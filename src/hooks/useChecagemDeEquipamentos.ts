// Devolução do desligamento e conferência do mês (dono, 2026-10-20; migration 20270129100000). O chamado da TI traz a
// lista; cada item se marca por `ti_marcar_item` (o Inventário acompanha), e a devolução fecha com o Termo de Devolução
// assinado (`ti_anexar_termo_de_devolucao`, balde `ti-termos`). O banco não deixa resolver o chamado antes.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export type SituacaoDoItem = 'ok' | 'avaria' | 'nao_devolvido' | 'conferido' | 'divergencia';

export interface ItemDaChecagem {
  id: string;
  asset_id: string | null;
  pessoa_id: string | null;
  pessoa_nome: string | null;
  descricao: string;
  patrimonio: string | null;
  serie: string | null;
  situacao: SituacaoDoItem | null;
  motivo: string | null;
}

export interface Checagem {
  id: string;
  tipo: 'devolucao' | 'conferencia';
  colaborador_id: string | null;
  colaborador_nome: string | null;
  referencia: string | null;
  termo_path: string | null;
  termo_anexado_em: string | null;
  itens: ItemDaChecagem[];
}

const chave = (tenantId: string | null, ticketId: string) => ['ti-checagem', tenantId, ticketId];

export function useChecagemDoChamado(ticketId: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: chave(tenantId, ticketId),
    enabled: !!tenantId,
    queryFn: async (): Promise<Checagem | null> => {
      const linhas = unwrap(await supabase.from('ti_checagens' as never)
        .select('id, tipo, colaborador_id, colaborador_nome, referencia, termo_path, termo_anexado_em, itens:ti_checagem_itens(id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie, situacao, motivo)')
        .eq('ticket_id', ticketId)) as unknown as Checagem[];
      const c = linhas[0];
      if (!c) return null;
      return {
        ...c,
        itens: [...c.itens].sort((a, b) => (a.pessoa_nome ?? '').localeCompare(b.pessoa_nome ?? '') || a.descricao.localeCompare(b.descricao)),
      };
    },
  });
}

export function useMarcarItem(ticketId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemId, situacao, motivo }: { itemId: string; situacao: SituacaoDoItem; motivo?: string }) => {
      unwrap(await supabase.rpc('ti_marcar_item' as never, { p_item: itemId, p_situacao: situacao, p_motivo: motivo ?? null } as never));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chave(tenantId, ticketId) });
      qc.invalidateQueries({ queryKey: ['assets'] });
    },
    onError: (e: Error) => toast.error(`Não marcou: ${e.message}`),
  });
}

export function useAnexarTermoDeDevolucao(ticketId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ checagemId, arquivo }: { checagemId: string; arquivo: File }) => {
      const nome = arquivo.name.replace(/[^\w.-]/g, '_');
      const path = `${tenantId}/devolucoes/${checagemId}/${Date.now()}-${nome}`;
      const { error } = await supabase.storage.from('ti-termos').upload(path, arquivo, { upsert: false });
      if (error) throw error;
      unwrap(await supabase.rpc('ti_anexar_termo_de_devolucao' as never, { p_checagem: checagemId, p_path: path } as never));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: chave(tenantId, ticketId) });
      qc.invalidateQueries({ queryKey: ['ti-termos', tenantId] });
      toast.success('Termo de devolução anexado. Agora o chamado pode ser resolvido.');
    },
    onError: (e: Error) => toast.error(`Não anexou: ${e.message}`),
  });
}
