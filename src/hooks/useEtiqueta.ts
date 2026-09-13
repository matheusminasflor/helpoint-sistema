import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';

/**
 * O encaixe "etiquetar" (ENC-1, ADR-009): de onde vem a etiqueta que a
 * Expedição imprime. Três conectores, escolha por empresa. A credencial dos
 * Correios nunca volta para a tela — a leitura é `exp_shipping_status()`.
 */

export type LabelProvider = 'nenhum' | 'bling' | 'yampi' | 'correios';

export const LABEL_PROVIDER_LABELS: Record<LabelProvider, string> = {
  nenhum: 'Nenhum (transportadora do cliente ou retirada)',
  bling: 'Buscar do Bling',
  yampi: 'Buscar da Yampi',
  correios: 'Correios (contrato da empresa)',
};

export interface ShippingStatus {
  provider: LabelProvider;
  correios_ligado: boolean;
  cartao_last4: string | null;
  codigo_servico: string | null;
  remetente: Remetente | null;
  updated_at: string | null;
}

export interface Remetente {
  nome?: string; documento?: string; telefone?: string; email?: string;
  logradouro?: string; numero?: string; complemento?: string; bairro?: string;
  cidade?: string; uf?: string; cep?: string;
}

export interface EtiquetaResult {
  provider: LabelProvider;
  label_url?: string | null;
  pdf_base64?: string | null;
  tracking_code?: string | null;
  /** Peso somado do pedido. Zero = nenhum produto tem peso cadastrado. */
  peso_gramas?: number;
  /** Objeto já existia: a etiqueta saiu de novo, sem gerar outra postagem. */
  reimpressao?: boolean;
}

// A edge function já responde com `message` em linguagem de gente; `invokeEdge`
// mostra essa mensagem. Não há tradução a fazer aqui.
const callLabel = <T,>(body: Record<string, unknown>) => invokeEdge<T>('shipping-label', body);

export function useShippingStatus() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['shipping-status', tenantId],
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<ShippingStatus | null> => {
      const rows = unwrap(await supabase.rpc('exp_shipping_status'));
      return (rows[0] as unknown as ShippingStatus) ?? null;
    },
  });
}

export function useSaveLabelProvider() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider: LabelProvider) => callLabel<{ ok: boolean }>({ action: 'provider', provider }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shipping-status', tenantId] });
      toast.success('Escolha salva.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export interface CorreiosInput {
  usuario?: string; codigo_acesso?: string; cartao_postagem?: string;
  contrato?: string; codigo_servico?: string; remetente?: Remetente;
}

export function useTestCorreios() {
  return useMutation({
    mutationFn: (input: CorreiosInput) => callLabel<{ ok: boolean; error?: string }>({ action: 'test', ...input }),
  });
}

export function useSaveCorreios() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CorreiosInput) => callLabel<{ ok: boolean; error?: string }>({ action: 'save', ...input }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shipping-status', tenantId] });
      if (res.ok) toast.success('Contrato dos Correios ligado.');
      else toast.error(res.error ?? 'Os Correios não aceitaram os dados.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDeleteCorreios() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callLabel<{ ok: boolean; removido?: boolean }>({ action: 'delete' }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['shipping-status', tenantId] });
      if (res.removido) toast.success('Contrato removido.');
      else toast.info('Não havia contrato ligado para remover.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** Busca (ou gera) a etiqueta da separação e abre para impressão. */
export function useEtiqueta(shipmentId: string | undefined) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callLabel<EtiquetaResult>({ action: 'fetch', shipment_id: shipmentId }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['exp-shipment', tenantId, shipmentId] });
      if (res.reimpressao) toast.info('Mesma etiqueta de antes: nenhuma postagem nova foi gerada.');
      if (res.peso_gramas === 0) {
        toast.warning('Nenhum produto deste pedido tem peso cadastrado: a etiqueta saiu com o peso mínimo.');
      }
      abrirEtiqueta(res);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/**
 * Abre a etiqueta numa aba para imprimir. Bling e Yampi devolvem um link; os
 * Correios devolvem o PDF em si (vem autenticado, não dá para guardar link).
 */
export function abrirEtiqueta(res: { label_url?: string | null; pdf_base64?: string | null }) {
  if (res.label_url) { window.open(res.label_url, '_blank', 'noopener'); return; }
  if (!res.pdf_base64) { toast.error('O provedor não devolveu a etiqueta.'); return; }
  const bytes = Uint8Array.from(atob(res.pdf_base64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  window.open(url, '_blank', 'noopener');
  // O navegador segura o blob enquanto a aba viver; um minuto é de sobra para abrir.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
