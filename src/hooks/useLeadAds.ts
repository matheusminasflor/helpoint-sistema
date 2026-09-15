import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';
import type { FormularioDaMeta } from '@/lib/lead-ads';
import type { Database, Json } from '@/integrations/supabase/types';

/**
 * Lead Ads do Facebook (CRM-4c, ADR-006).
 *
 * A regra que manda aqui é do dono, dita duas vezes: **o lead não escolhe
 * funil**. O administrador cria o funil, liga o formulário do anúncio a ele e
 * só então o lead entra. Enquanto isso o lead fica guardado inteiro, retido —
 * ele é pago, e o Facebook não reentrega.
 *
 * Por isso não há, em lugar nenhum deste arquivo, um destino padrão.
 */

export type LeadAdsForm = Database['public']['Tables']['crm_lead_ads_forms']['Row'];
export type LeadAdsRaw = Database['public']['Tables']['crm_lead_ads_raw']['Row'];


export interface PaginaConectada {
  account_name: string;
  page_id: string;
  /**
   * A página instalou o aplicativo do Helpoint — isto é, ela **manda** os leads.
   * Conectar no Marketing dá permissão de ler; instalar é a outra metade.
   * Falso = reconecte.
   *
   * ponytail: opcional, e a tela compara com `=== false`. **Teto:** enquanto o
   * front (Vercel) e a função (Supabase) sobem separados, existe uma janela em
   * que o front é novo e a função é velha, e o campo chega indefinido — avisar
   * por não saber seria pior do que esperar. **Saída:** quando a função da
   * CRM-4c estiver em produção, o campo vira obrigatório e a comparação vira
   * `!p.instalada`; o descompasso passa a ser erro de tipo, e não silêncio.
   */
  instalada?: boolean;
}

export interface EstadoLeadAds {
  conectado: boolean;
  ativo: boolean;
  assinatura_configurada: boolean;
  /** O aplicativo da Meta é o do Helpoint: a empresa não precisa colar segredo. */
  app_da_casa?: boolean;
  verify_token: string | null;
  webhook_url: string;
  paginas: PaginaConectada[];
}


export function useEstadoLeadAds() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['lead-ads-estado', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<EstadoLeadAds> =>
      invokeEdge<EstadoLeadAds>('facebook-leads-config', { acao: 'estado' }),
  });
}

export function useSalvarLeadAds() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (appSecret: string | undefined) =>
      invokeEdge<EstadoLeadAds>('facebook-leads-config', { acao: 'salvar', app_secret: appSecret }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-ads-estado', tenantId] });
      toast.success('Lead Ads ligado. Agora cadastre o webhook no painel da Meta.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDesligarLeadAds() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => invokeEdge('facebook-leads-config', { acao: 'desligar' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-ads-estado', tenantId] });
      toast.success('Lead Ads desligado. O que já virou negócio continua no funil.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/** Os formulários que existem na página, perguntados à Meta na hora. */
export function useFormulariosDaMeta(pageId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['lead-ads-formularios-meta', tenantId, pageId],
    enabled: !!tenantId && !!pageId,
    queryFn: async (): Promise<FormularioDaMeta[]> => {
      const r = await invokeEdge<{ formularios: FormularioDaMeta[] }>(
        'facebook-leads-config', { acao: 'formularios', page_id: pageId },
      );
      return r.formularios ?? [];
    },
  });
}

/** Os formulários que esta empresa já ligou a um funil. */
export function useLeadAdsForms() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['lead-ads-forms', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<LeadAdsForm[]> =>
      unwrap(await supabase.from('crm_lead_ads_forms').select('*').order('created_at', { ascending: false })),
  });
}

export interface LeadAdsFormInput {
  id?: string;
  page_id: string;
  form_id: string;
  form_name?: string | null;
  pipeline_id: string;
  stage_id: string;
  segment_id?: string | null;
  owner_id?: string | null;
  /** `{ "quantos_pontos": "custom:quantos_pontos" }` — pergunta → campo do contato. */
  mapeamento: Record<string, string>;
  is_active?: boolean;
}

export function useSalvarLeadAdsForm() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeadAdsFormInput) => {
      const payload = {
        page_id: input.page_id,
        form_id: input.form_id,
        form_name: input.form_name ?? null,
        pipeline_id: input.pipeline_id,
        stage_id: input.stage_id,
        segment_id: input.segment_id ?? null,
        owner_id: input.owner_id ?? null,
        mapeamento: input.mapeamento as unknown as Json,
        is_active: input.is_active ?? true,
      };
      if (input.id) {
        return expectRows(
          await supabase.from('crm_lead_ads_forms').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'o formulário do anúncio',
        );
      }
      return expectRows(
        await supabase.from('crm_lead_ads_forms')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'o formulário do anúncio',
      );
    },
    onSuccess: () => {
      // Ligar o formulário solta os leads que estavam esperando — por isso as
      // três listas se refazem juntas, e não só a dos formulários.
      qc.invalidateQueries({ queryKey: ['lead-ads-forms', tenantId] });
      qc.invalidateQueries({ queryKey: ['lead-ads-leads', tenantId] });
      qc.invalidateQueries({ queryKey: ['crm-deals', tenantId] });
      toast.success('Formulário ligado. Os leads que estavam esperando entraram no funil.');
    },
    onError: (e) => {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(
        msg.includes('crm_lead_ads_forms_unico')
          ? 'Esse formulário do Facebook já está ligado — edite a configuração que existe.'
          : msg,
        { duration: 10000 },
      );
    },
  });
}

export function useRemoverLeadAdsForm() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('crm_lead_ads_forms').delete()
          .eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'o formulário do anúncio',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lead-ads-forms', tenantId] });
      toast.success('Formulário desligado. Novos leads dele voltam a ficar retidos.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

/**
 * Os leads que **não** entraram: retidos (formulário sem destino) e com erro.
 * Os aplicados não aparecem aqui — eles já são negócios no funil.
 */
export function useLeadAdsPendentes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['lead-ads-leads', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<LeadAdsRaw[]> =>
      unwrap(
        await supabase.from('crm_lead_ads_raw').select('*')
          .in('status', ['retido', 'erro']).order('created_at', { ascending: false }).limit(200),
      ),
  });
}

/** Tentar de novo um lead, depois de corrigir a causa. */
export function useReprocessarLead() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<string | null> =>
      unwrap(await supabase.rpc('crm_lead_ads_aplicar', { p_raw: id })),
    onSuccess: (dealId) => {
      qc.invalidateQueries({ queryKey: ['lead-ads-leads', tenantId] });
      qc.invalidateQueries({ queryKey: ['crm-deals', tenantId] });
      if (dealId) toast.success('O lead entrou no funil.');
      else toast.warning('O lead continua parado. Confira o destino e o mapeamento do formulário.', { duration: 10000 });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
