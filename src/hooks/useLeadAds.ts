import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { invokeEdge } from '@/lib/edge-function';
import { useAuth } from '@/contexts/AuthContext';
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

/** Uma pergunta do formulário. `key` é o que volta no lead, e é por ela que se mapeia. */
export interface PerguntaDaMeta {
  key: string;
  label?: string;
  type?: string;
}

/** Um formulário como a Meta o tem. Ela é a dona: aqui só se lê. */
export interface FormularioDaMeta {
  id: string;
  name?: string;
  status?: string;
  questions?: { data?: PerguntaDaMeta[] } | PerguntaDaMeta[];
}

/**
 * As perguntas de um formulário, de qualquer um dos dois formatos que a Graph
 * API usa (lista crua, ou embrulhada em `{data: [...]}` quando vem por `fields`).
 */
export function perguntasDoFormulario(f: FormularioDaMeta | undefined): PerguntaDaMeta[] {
  const q = f?.questions;
  if (!q) return [];
  return Array.isArray(q) ? q : (q.data ?? []);
}

/**
 * As três que o Facebook nomeia igual em todo formulário e que o sistema já lê
 * sozinho. Não entram no mapeamento: escolher destino para elas não muda nada.
 */
export const PERGUNTAS_PADRAO = ['full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone'];

export interface PaginaConectada {
  id: string;
  account_name: string;
  page_id: string;
}

export interface EstadoLeadAds {
  conectado: boolean;
  ativo: boolean;
  assinatura_configurada: boolean;
  verify_token: string | null;
  webhook_url: string;
  paginas: PaginaConectada[];
}

/**
 * Para onde pode ir a resposta de uma pergunta do anúncio. É o mesmo vocabulário
 * que o trigger `crm_lead_ads_confere_mapeamento` aceita e que
 * `crm_lead_ads_aplicar` sabe executar — se as três listas divergirem, a tela
 * deixa salvar algo que o banco recusa, ou pior: aceita e não cumpre.
 */
export const DESTINOS_EMBUTIDOS = [
  { valor: 'name', rotulo: 'Nome do contato' },
  { valor: 'email', rotulo: 'E-mail' },
  { valor: 'phone', rotulo: 'Telefone / WhatsApp' },
  { valor: 'company', rotulo: 'Empresa' },
] as const;

/**
 * "Vira anotação no negócio" é a **ausência** da pergunta no mapeamento, não um
 * destino vazio: o banco recusa string vazia como destino desconhecido. A tela
 * usa esta constante como valor do seletor e a apaga antes de salvar.
 */
export const DESTINO_ANOTACAO = '__nota__';

/** Só o que tem destino escolhido vai para o banco. */
export function limparMapeamento(bruto: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(bruto).filter(([, v]) => v && v !== DESTINO_ANOTACAO),
  );
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
    mutationFn: async (appSecret: string) =>
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
        msg.includes('crm_lead_ads_forms_form_idx') || msg.includes('crm_lead_ads_forms_unico')
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
