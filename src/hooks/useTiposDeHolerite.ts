// Os tipos de holerite cadastráveis (RH › Configurações › Holerites, 20270212310000). O holerite guarda o CÓDIGO;
// o nome vem daqui, então renomear aparece em todo holerite já enviado.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { toast } from 'sonner';

export interface TipoDeHolerite {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  ordem: number;
}

const CHAVE = 'rh-tipos-holerite';

const mensagemDoTipo = (e: Error) => {
  if (e.message.includes('rh_tipos_holerite_nome')) return 'Já existe um tipo com este nome.';
  if (e.message.includes('rh_payslips_tipo_fk')) return 'Este tipo já tem holerite enviado: desative em vez de apagar.';
  return e.message;
};

export function useTiposDeHolerite() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, tenantId],
    queryFn: async () =>
      (unwrap(await supabase.from('rh_tipos_holerite' as never)
        .select('id, codigo, nome, ativo, ordem').eq('tenant_id', tenantId!)
        .order('ordem').order('nome')) ?? []) as unknown as TipoDeHolerite[],
    enabled: !!tenantId,
  });
}

/** O nome do tipo; o código só aparece se a lista ainda não carregou. */
export const nomeDoTipo = (tipos: TipoDeHolerite[], codigo: string) =>
  tipos.find((t) => t.codigo === codigo)?.nome ?? codigo;

export function useCriarTipoDeHolerite() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ nome, ordem }: { nome: string; ordem: number }) => {
      expectRows(await supabase.from('rh_tipos_holerite' as never)
        .insert({ tenant_id: tenantId, nome: nome.trim(), ordem } as never).select('id'), 'o tipo de holerite');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CHAVE, tenantId] }); toast.success('Tipo criado.'); },
    onError: (e: Error) => toast.error(mensagemDoTipo(e)),
  });
}

export function useAlterarTiposDeHolerite() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (mudancas: (Pick<TipoDeHolerite, 'id'> & Partial<Pick<TipoDeHolerite, 'nome' | 'ativo' | 'ordem'>>)[]) => {
      for (const { id, ...campos } of mudancas) {
        expectRows(await supabase.from('rh_tipos_holerite' as never)
          .update(campos as never).eq('id', id).select('id'), 'o tipo de holerite');
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: [CHAVE, tenantId] }),
    onError: (e: Error) => toast.error(mensagemDoTipo(e)),
  });
}

export function useApagarTipoDeHolerite() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('rh_tipos_holerite' as never).delete().eq('id', id).select('id'), 'o tipo de holerite');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [CHAVE, tenantId] }); toast.success('Tipo apagado.'); },
    onError: (e: Error) => toast.error(mensagemDoTipo(e)),
  });
}
