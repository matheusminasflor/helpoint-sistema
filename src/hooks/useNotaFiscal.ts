import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';

/**
 * O encaixe "emitir nota" (ENC-3, ADR-009): de onde sai a nota fiscal do pedido.
 * O token da Focus nunca volta para a tela — a leitura é `crm_nfe_status()`.
 */

export type NFeProvider = 'nenhum' | 'focusnfe' | 'bling';

export const NFE_PROVIDER_LABELS: Record<NFeProvider, string> = {
  nenhum: 'Nenhum (a empresa emite por fora)',
  focusnfe: 'Focus NFe (o Helpoint emite)',
  bling: 'Bling (quem já roda no ERP)',
};

export interface NFeStatus {
  provider: NFeProvider;
  focus_ligado: boolean;
  token_last4: string | null;
  ambiente: 'homologacao' | 'producao' | null;
  cnpj_emitente: string | null;
  serie: number | null;
  natureza_operacao: string | null;
  cfop_padrao: string | null;
  updated_at: string | null;
}

export interface NotaDoPedido {
  ref: string;
  nfe_status: 'processing' | 'authorized' | 'cancelled' | 'error';
  numero?: string | null;
  chave?: string | null;
  danfe_url?: string | null;
  xml_url?: string | null;
  mensagem?: string | null;
  /** A nota daquela referência já existia: nada foi emitido de novo. */
  ja_emitida?: boolean;
}

export const NFE_STATUS_LABELS: Record<string, string> = {
  processing: 'Na fila da SEFAZ',
  authorized: 'Autorizada',
  cancelled: 'Cancelada',
  error: 'Recusada',
  order_created: 'Pedido criado no Bling',
  nfe_generated: 'Nota gerada no Bling',
  nfe_sent: 'Nota transmitida pelo Bling',
};

const callNFe = <T,>(body: Record<string, unknown>) => invokeEdge<T>('nfe-focus', body);

export function useNFeStatus() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['nfe-status', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<NFeStatus | null> => {
      const rows = unwrap(await supabase.rpc('crm_nfe_status'));
      return (rows[0] as unknown as NFeStatus) ?? null;
    },
  });
}

export function useSaveNFeProvider() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: NFeProvider) => callNFe<{ ok: boolean }>({ action: 'provider', provider }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nfe-status', tenantId] });
      toast.success('Escolha salva.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export interface FocusInput {
  token?: string;
  ambiente?: 'homologacao' | 'producao';
  cnpj_emitente?: string;
  serie?: number;
  natureza_operacao?: string;
  cfop_padrao?: string;
}

export function useTestFocus() {
  return useMutation({
    mutationFn: (input: FocusInput) => callNFe<{ ok: boolean; error?: string; empresas?: number }>({ action: 'test', ...input }),
  });
}

export function useSaveFocus() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: FocusInput) => callNFe<{ ok: boolean; error?: string; token_last4?: string }>({ action: 'save', ...input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nfe-status', tenantId] });
      if (res.ok) toast.success('Focus NFe ligada.');
      else toast.error(res.error ?? 'A Focus não aceitou os dados.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDeleteFocus() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callNFe<{ ok: boolean; removido?: boolean }>({ action: 'delete' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['nfe-status', tenantId] });
      if (res.removido) toast.success('Conexão removida.');
      else toast.info('Não havia conexão para remover.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** Emite (ou reaproveita) a nota do pedido, e depois pergunta como ficou. */
export function useEmitirNota(orderId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (acao: 'emitir' | 'consultar' = 'emitir') => callNFe<NotaDoPedido>({ action: acao, order_id: orderId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['crm-order', tenantId, orderId] });
      qc.invalidateQueries({ queryKey: ['crm-orders'] });
      if (res.ja_emitida) toast.info('Este pedido já tinha nota nessa referência: nada foi emitido de novo.');
      else if (res.nfe_status === 'processing') toast.success('Nota enviada. A SEFAZ costuma responder em segundos.');
      else if (res.nfe_status === 'authorized') toast.success(`Nota ${res.numero ?? ''} autorizada.`);
      else if (res.nfe_status === 'error') toast.error(res.mensagem ?? 'A nota foi recusada.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
