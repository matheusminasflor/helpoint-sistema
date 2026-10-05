// Grupos de fornecedor (decisão do dono, 2026-10-04): a empresa cria os grupos, e um fornecedor
// pode estar em vários. Quem escreve é quem cria e edita fornecedor — o banco confere
// (`pode_editar_fornecedores`, migration 20261203100000).
import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';

export interface GrupoDeFornecedor { id: string; nome: string }
interface Membro { supplier_id: string; grupo_id: string }

const nomeRepetido = (e: unknown) =>
  /fornecedor_grupos_nome_unico|duplicate key/i.test(mensagemDeErro(e))
    ? 'Já existe um grupo com esse nome.'
    : mensagemDeErro(e);

export function useGruposDeFornecedor() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['fornecedor-grupos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<GrupoDeFornecedor[]> =>
      unwrap(await supabase.from('fornecedor_grupos').select('id, nome').order('nome')) ?? [],
  });
}

/** Os grupos de cada fornecedor: `supplier_id → [grupo]`, já com o nome. */
export function useGruposPorFornecedor() {
  const { tenantId } = useAuth();
  const { data: grupos = [] } = useGruposDeFornecedor();
  const { data: membros = [] } = useQuery({
    queryKey: ['fornecedor-grupo-membros', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Membro[]> =>
      unwrap(await supabase.from('fornecedor_grupo_membros').select('supplier_id, grupo_id')) ?? [],
  });
  return useMemo(() => {
    const porId = new Map(grupos.map(g => [g.id, g]));
    const mapa = new Map<string, GrupoDeFornecedor[]>();
    for (const m of membros) {
      const g = porId.get(m.grupo_id);
      if (!g) continue;
      mapa.set(m.supplier_id, [...(mapa.get(m.supplier_id) ?? []), g]);
    }
    for (const lista of mapa.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    return mapa;
  }, [grupos, membros]);
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['fornecedor-grupos'] });
    qc.invalidateQueries({ queryKey: ['fornecedor-grupo-membros'] });
  };
}

export function useCriarGrupoDeFornecedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (nome: string): Promise<GrupoDeFornecedor> =>
      expectRows(await supabase.from('fornecedor_grupos').insert({ nome: nome.trim() }).select('id, nome'), 'o grupo')[0],
    onSuccess: () => { invalidar(); toast.success('Grupo criado'); },
    onError: (e) => toast.error('Erro ao criar grupo: ' + nomeRepetido(e)),
  });
}

export function useRenomearGrupoDeFornecedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      expectRows(await supabase.from('fornecedor_grupos').update({ nome: nome.trim() }).eq('id', id).select('id'), 'o nome do grupo');
    },
    onSuccess: () => { invalidar(); toast.success('Grupo renomeado'); },
    onError: (e) => toast.error('Erro ao renomear: ' + nomeRepetido(e)),
  });
}

/** Apagar o grupo desfaz as ligações; os fornecedores ficam. */
export function useApagarGrupoDeFornecedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('fornecedor_grupos').delete().eq('id', id).select('id'), 'a remoção do grupo');
    },
    onSuccess: () => { invalidar(); toast.success('Grupo apagado'); },
    onError: (e) => toast.error('Erro ao apagar grupo: ' + mensagemDeErro(e)),
  });
}

/** Deixa o fornecedor exatamente nos grupos marcados: tira os desmarcados, põe os novos. */
export function useSalvarGruposDoFornecedor() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async ({ supplierId, antes, depois }: { supplierId: string; antes: string[]; depois: string[] }) => {
      const tirar = antes.filter(id => !depois.includes(id));
      const por = depois.filter(id => !antes.includes(id));
      if (tirar.length > 0) {
        expectRows(await supabase.from('fornecedor_grupo_membros').delete()
          .eq('supplier_id', supplierId).in('grupo_id', tirar).select('grupo_id'), 'a saída do grupo');
      }
      if (por.length > 0) {
        expectRows(await supabase.from('fornecedor_grupo_membros')
          .insert(por.map(grupo_id => ({ supplier_id: supplierId, grupo_id }))).select('grupo_id'), 'a entrada no grupo');
      }
    },
    onSuccess: invalidar,
    onError: (e) => toast.error('Erro ao salvar os grupos do fornecedor: ' + mensagemDeErro(e)),
  });
}
