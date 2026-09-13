import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';
import type { Database } from '@/integrations/supabase/types';

/**
 * WhatsApp (CRM-4a, ADR-006). A conversa vive **dentro do negócio**: a mensagem
 * do cliente entra na história dele junto com reunião, pedido e anotação.
 *
 * Escrever mensagem é sempre pela edge function — ela é quem fala com a Meta.
 * Uma linha gravada direto pela tela seria uma mensagem que o cliente nunca viu,
 * e é por isso que a tabela não tem policy de INSERT.
 */

export type MensagemRow = Database['public']['Tables']['crm_messages']['Row'];

export interface EstadoWhatsApp {
  conectado: boolean;
  numero?: string | null;
  ativo?: boolean;
  verify_token?: string;
  webhook_url?: string;
  assinatura_configurada?: boolean;
}

/** A janela da Meta: fora dela só mensagem-modelo aprovada (CRM-4b). */
export const JANELA_HORAS = 24;

export function useConversa(dealId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-conversa', tenantId, dealId],
    enabled: !!tenantId && !!dealId,
    queryFn: async (): Promise<MensagemRow[]> =>
      unwrap(
        await supabase.from('crm_messages').select('*')
          .eq('deal_id', dealId!).order('created_at', { ascending: true }),
      ),
  });
}

/**
 * Quanto tempo resta para responder livremente.
 *
 * Contado da última mensagem **do cliente**, e por **contato** — não por
 * negócio. É a regra da Meta, e é o que o servidor confere: a janela pertence à
 * pessoa, não à venda. Olhando só o negócio, um cliente que fechou uma compra e
 * voltou a escrever num negócio novo ficaria com a caixa de resposta trancada
 * no negócio antigo, dizendo para usar o celular — enquanto o servidor aceitaria
 * a mensagem sem reclamar.
 */
export function janelaAberta(ultimaEntrada: string | null | undefined): {
  aberta: boolean;
  horasRestantes: number;
} {
  if (!ultimaEntrada) return { aberta: false, horasRestantes: 0 };
  const passou = (Date.now() - new Date(ultimaEntrada).getTime()) / 3_600_000;
  return { aberta: passou < JANELA_HORAS, horasRestantes: Math.max(0, JANELA_HORAS - passou) };
}

/** A última vez que **este cliente** escreveu, em qualquer negócio dele. */
export function useUltimaEntrada(contactId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['crm-ultima-entrada', tenantId, contactId],
    enabled: !!tenantId && !!contactId,
    queryFn: async (): Promise<string | null> => {
      const linhas = unwrap(
        await supabase.from('crm_messages').select('created_at')
          .eq('contact_id', contactId!).eq('direction', 'in')
          .order('created_at', { ascending: false }).limit(1),
      );
      return linhas[0]?.created_at ?? null;
    },
  });
}

export function useEnviarWhatsApp(dealId: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (texto: string) =>
      invokeEdge<{ enviado: boolean; motivo?: string; message_id?: string }>(
        'whatsapp-send', { deal_id: dealId, texto },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['crm-conversa', tenantId, dealId] });
      if (r.enviado) toast.success('Mensagem enviada.');
      else toast.warning(r.motivo ?? 'A mensagem não saiu.', { duration: 10000 });
    },
    // A janela é a mesma conta dos dois lados, e ela vive numa constante só
    // (`JANELA_HORAS`) porque tela e servidor discordando sobre 24 horas é pior
    // do que qualquer um dos dois estar errado sozinho.
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** O estado da conexão, para a tela de configuração do CRM. */
export function useEstadoWhatsApp() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['whatsapp-estado', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<EstadoWhatsApp> =>
      invokeEdge<EstadoWhatsApp>('whatsapp-credentials', { acao: 'estado' }),
  });
}

export interface CredenciaisWhatsApp {
  phone_number_id: string;
  waba_id: string;
  access_token: string;
  app_secret?: string;
}

export function useSalvarWhatsApp() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (c: CredenciaisWhatsApp) =>
      invokeEdge<EstadoWhatsApp>('whatsapp-credentials', { acao: 'salvar', ...c }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-estado', tenantId] });
      toast.success('WhatsApp ligado.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useTestarWhatsApp() {
  return useMutation({
    mutationFn: async () =>
      invokeEdge<{ ok: boolean; numero?: string; qualidade?: string; motivo?: string }>(
        'whatsapp-credentials', { acao: 'testar' },
      ),
    onSuccess: (r) => {
      if (r.ok) toast.success(`O número ${r.numero ?? ''} respondeu.`);
      else toast.error(r.motivo ?? 'O número não respondeu.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDesligarWhatsApp() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => invokeEdge('whatsapp-credentials', { acao: 'desligar' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['whatsapp-estado', tenantId] });
      toast.success('WhatsApp desligado. A conversa já gravada continua nos negócios.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
