// TI › Termos de responsabilidade de equipamento (dono, 2026-10-20; migration 20270129030000). Gerar é uma chamada só
// (`ti_gerar_termo`: termo, itens, cadastro rápido no Inventário e o equipamento no nome da pessoa); devolver também
// (`ti_devolver_termo`); o termo assinado sobe para o balde `ti-termos`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { todayISO } from '@/lib/dates';

const BALDE = 'ti-termos';

export interface ItemDoTermo {
  id?: string;
  asset_id?: string | null;
  descricao: string;
  marca_modelo: string | null;
  /** Só no cadastro rápido (20270129060000): vão separados para o Inventário. */
  categoria?: string | null;
  marca?: string | null;
  modelo?: string | null;
  patrimonio: string | null;
  estado: string | null;
}

export interface Termo {
  id: string;
  colaborador_id: string | null;
  colaborador_nome: string;
  cpf: string | null;
  matricula: string | null;
  setor: string | null;
  empresa: string;
  responsavel_nome: string | null;
  local: string | null;
  status: 'aguardando_assinatura' | 'assinado' | 'devolvido';
  assinado_path: string | null;
  assinado_em: string | null;
  devolvido_em: string | null;
  devolucao_obs: string | null;
  created_at: string;
  itens: ItemDoTermo[];
}

export function useTermos() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-termos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Termo[]> =>
      ((unwrap(await supabase.from('ti_termos' as never)
        .select('*, itens:ti_termo_itens(id, asset_id, descricao, marca_modelo, patrimonio, estado, posicao)')
        .order('created_at', { ascending: false })) ?? []) as unknown as (Termo & { itens: (ItemDoTermo & { posicao: number })[] })[])
        .map((t) => ({ ...t, itens: [...t.itens].sort((a, b) => a.posicao - b.posicao) })),
  });
}

export interface DadosDoColaborador { nome: string | null; cpf: string | null; matricula: string | null; setor: string | null; empresa: string | null }

/** O que o RH sabe da pessoa (para preencher o termo). */
export function useDadosParaTermo(pessoaId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-dados-para-termo', tenantId, pessoaId],
    enabled: !!tenantId && !!pessoaId,
    queryFn: async (): Promise<DadosDoColaborador | null> =>
      ((unwrap(await supabase.rpc('ti_dados_para_termo' as never, { p_pessoa: pessoaId } as never)) ?? []) as unknown as DadosDoColaborador[])[0] ?? null,
  });
}

/** Os termos de um equipamento (para o detalhe dele no Inventário). */
export function useTermosDoEquipamento(assetId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-termos-do-equipamento', tenantId, assetId],
    enabled: !!tenantId && !!assetId,
    queryFn: async () =>
      ((unwrap(await supabase.rpc('ti_termos_do_equipamento' as never, { p_asset: assetId } as never)) ?? []) as unknown as {
        termo_id: string; colaborador_nome: string; status: string; created_at: string; assinado_path: string | null; devolvido_em: string | null;
      }[]),
  });
}

/** Os equipamentos que já estão com a pessoa no Inventário. */
export function useEquipamentosDaPessoa(pessoaId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-equipamentos-da-pessoa', tenantId, pessoaId],
    enabled: !!tenantId && !!pessoaId,
    queryFn: async () =>
      ((unwrap(await supabase.from('assets')
        .select('id, name, manufacturer, model, asset_tag')
        .eq('assigned_to', pessoaId!)
        .order('name')) ?? []) as EquipamentoDoInventario[]),
  });
}

export type EquipamentoDoInventario = { id: string; name: string; manufacturer: string | null; model: string | null; asset_tag: string | null };

/** Os equipamentos do Inventário sem ninguém (no estoque), para pôr no termo sem passar pelo Inventário (dono, 2026-10-23). */
export function useEquipamentosLivres(ligado: boolean) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-equipamentos-livres', tenantId],
    enabled: !!tenantId && ligado,
    queryFn: async () =>
      ((unwrap(await supabase.from('assets')
        .select('id, name, manufacturer, model, asset_tag')
        .is('assigned_to', null)
        .not('status', 'in', '(decommissioned,maintenance)')
        .order('name')) ?? []) as EquipamentoDoInventario[]),
  });
}

/** Excluir o termo lançado errado (20270129140000): o equipamento que só ele cobria volta ao estoque. */
export function useExcluirTermo() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (termo: Pick<Termo, 'id' | 'assinado_path'>) => {
      unwrap(await supabase.rpc('ti_excluir_termo' as never, { p_termo: termo.id } as never));
      if (termo.assinado_path) {
        const { error } = await supabase.storage.from(BALDE).remove([termo.assinado_path]);
        if (error) toast.warning(`O termo foi excluído, mas o arquivo assinado ficou guardado: ${error.message}`);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['ti-equipamentos-livres', tenantId] });
      toast.success('Termo excluído.');
    },
    onError: (e: Error) => toast.error(`Não excluiu: ${e.message}`),
  });
}

export function useGerarTermo() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { termo: Omit<Termo, 'id' | 'status' | 'assinado_path' | 'assinado_em' | 'devolvido_em' | 'devolucao_obs' | 'created_at' | 'itens'>; itens: ItemDoTermo[] }) =>
      unwrap(await supabase.rpc('ti_gerar_termo' as never, { p_termo: input.termo, p_itens: input.itens } as never)) as unknown as string,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['ti-equipamentos-livres', tenantId] });
    },
    onError: (e: Error) => toast.error(`Não gerou o termo: ${e.message}`),
  });
}

/** Trocar quem assina pela empresa (dono, 2026-10-29) — só antes de o termo ser assinado. */
export function useMudarQuemAssina() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ termoId, responsavel }: { termoId: string; responsavel: string }) =>
      expectRows(
        await supabase.from('ti_termos' as never)
          .update({ responsavel_nome: responsavel } as never)
          .eq('id', termoId).eq('status', 'aguardando_assinatura')
          .select('id'),
        'o termo',
      ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] }); toast.success('Quem assina foi trocado. Baixe o PDF de novo.'); },
    onError: (e: Error) => toast.error(`Não trocou: ${e.message}`),
  });
}

export function useAnexarTermoAssinado() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ termoId, arquivo }: { termoId: string; arquivo: File }) => {
      const nome = arquivo.name.replace(/[^\w.-]/g, '_');
      const path = `${tenantId}/${termoId}/${Date.now()}-${nome}`;
      const { error } = await supabase.storage.from(BALDE).upload(path, arquivo, { upsert: false });
      if (error) throw error;
      expectRows(
        await supabase.from('ti_termos' as never)
          .update({ status: 'assinado', assinado_path: path, assinado_em: todayISO() } as never)
          .eq('id', termoId)
          .select('id'),
        'o termo',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] }); toast.success('Termo assinado anexado.'); },
    onError: (e: Error) => toast.error(`Não anexou: ${e.message}`),
  });
}

export function useDevolverTermo() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ termoId, data, obs }: { termoId: string; data: string; obs: string }) => {
      unwrap(await supabase.rpc('ti_devolver_termo' as never, { p_termo: termoId, p_data: data, p_obs: obs } as never));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] });
      qc.invalidateQueries({ queryKey: ['assets'] });
      qc.invalidateQueries({ queryKey: ['ti-equipamentos-livres', tenantId] });
      toast.success('Devolução registrada: o equipamento voltou ao estoque.');
    },
    onError: (e: Error) => toast.error(`Não registrou: ${e.message}`),
  });
}

export async function urlDoTermoAssinado(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BALDE).createSignedUrl(path, 60 * 10);
  if (error) return null;
  return data?.signedUrl ?? null;
}
