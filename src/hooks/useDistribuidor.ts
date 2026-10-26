// Portal do Distribuidor, parte 1 (etapa 6; migration 20270204010000). Quem vê é a policy; quem age são as funções
// `dist_*` — nenhuma tabela do portal aceita escrita direta.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { VERSAO_DOS_TERMOS } from '@/config/termos-do-distribuidor';

export const rpc = async <T>(nome: string, args: Record<string, unknown>) =>
  unwrap(await supabase.rpc(nome as never, args as never)) as unknown as T;

export type StatusDoDistribuidor = 'pendente' | 'liberado' | 'recusado' | 'suspenso';

export type SituacaoDoDistribuidor =
  | { situacao: 'sem_login' | 'sem_cadastro_de_cliente' }
  | { situacao: 'convidado'; convite: string; distribuidor: { razao_social: string; cidade: string | null; uf: string | null } }
  | { situacao: 'sem_pedido'; recusado: { motivo: string; em: string } | null;
      cadastro: { razao_social: string | null; cnpj: string; telefone: string | null; cidade: string | null; uf: string | null } }
  | NoPortal;

export interface NoPortal {
  situacao: StatusDoDistribuidor; papel: 'dono' | 'vendedor'; termos_ok: boolean;
  distribuidor: { id: string; razao_social: string; cidade: string | null; uf: string | null; motivo: string | null; pedido_em: string };
}

/** Tudo o que a tela do portal precisa para decidir o que mostrar, numa chamada. */
export function useSituacaoDoDistribuidor() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['distribuidor', 'situacao', user?.id],
    enabled: !!user?.id,
    queryFn: () => rpc<SituacaoDoDistribuidor>('dist_situacao', { p_versao_termos: VERSAO_DOS_TERMOS }),
  });
}

export function useAcaoDoPortal<A>(fn: (a: A) => Promise<unknown>, ok: string, falhou: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['distribuidor'] }); if (ok) toast.success(ok); },
    onError: (e) => toast.error(falhou, { description: mensagemDeErro(e) }),
  });
}

export interface PedidoDeCadastro { razao_social: string; cnpj: string; cidade: string; uf: string; telefone: string }

export const usePedirCadastroDeDistribuidor = () => useAcaoDoPortal(
  (p: PedidoDeCadastro) => rpc('dist_pedir_cadastro', {
    p_razao_social: p.razao_social, p_cnpj: p.cnpj, p_cidade: p.cidade, p_uf: p.uf, p_telefone: p.telefone }),
  'Pedido enviado. A Minasflor confere e avisa você por e-mail.', 'Não enviou o pedido');

export const useAceitarTermos = () => useAcaoDoPortal(
  () => rpc('dist_aceitar_termos', { p_versao: VERSAO_DOS_TERMOS }), '', 'Não registrou o aceite');

export const useAceitarConvite = () => useAcaoDoPortal(
  (convite: string) => rpc('dist_aceitar_convite', { p_convite: convite }), 'Você entrou na equipe.', 'Não entrou na equipe');

// ── A equipe (o dono vê todos; o vendedor, a si mesmo — a policy) ──────────────────────────────────────────────
export interface MembroDoDistribuidor {
  id: string; email: string; nome: string | null; papel: 'dono' | 'vendedor'; user_id: string | null; entrou_em: string | null;
}

export function useEquipeDoDistribuidor(distribuidorId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['distribuidor', 'equipe', user?.id, distribuidorId],
    enabled: !!distribuidorId,
    queryFn: async () => unwrap(await supabase.from('dist_membros' as never)
      .select('id, email, nome, papel, user_id, entrou_em').eq('distribuidor_id' as never, distribuidorId as never)
      .eq('ativo' as never, true as never).order('created_at')) as unknown as MembroDoDistribuidor[],
  });
}

/** O e-mail sai pela função `distribuidor-email`; se ele falhar, o convite continua valendo (a pessoa se cadastra). */
async function mandarEmail(tipo: 'liberado' | 'convite', id: string) {
  const { data, error } = await supabase.functions.invoke('distribuidor-email', { body: { tipo, id } });
  if (error || (data as { error?: string } | null)?.error) {
    toast.warning('O e-mail não saiu', { description: 'O acesso vale do mesmo jeito: avise a pessoa por outro meio.' });
  }
}

export const useConvidarVendedor = () => useAcaoDoPortal(
  async ({ email, nome }: { email: string; nome: string }) => {
    const id = await rpc<string>('dist_convidar', { p_email: email, p_nome: nome });
    await mandarEmail('convite', id);
  }, 'Convite enviado.', 'Não convidou');

export const useTirarDaEquipe = () => useAcaoDoPortal(
  (membro: string) => rpc('dist_tirar_da_equipe', { p_membro: membro }), 'Tirado da equipe.', 'Não tirou da equipe');

// ── A TI (decisão 4) ────────────────────────────────────────────────────────────────────────────────────────────
export interface DistribuidorNaTI {
  id: string; razao_social: string; cnpj: string; cidade: string | null; uf: string | null; telefone: string | null;
  status: StatusDoDistribuidor; com_cliente_codigo: string | null; motivo: string | null; created_at: string;
  decidido_em: string | null; catalogo_mf: string | null; catalogo_inbras: string | null;
  membros: { email: string; nome: string | null; papel: string; ativo: boolean }[];
}

export function useDistribuidoresDaTI() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['distribuidor', 'ti', tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('dist_distribuidores' as never)
      .select('id, razao_social, cnpj, cidade, uf, telefone, status, com_cliente_codigo, motivo, created_at, decidido_em, catalogo_mf, catalogo_inbras, membros:dist_membros(email, nome, papel, ativo)')
      .order('created_at', { ascending: false })) as unknown as DistribuidorNaTI[],
  });
}

/** Os links dos catálogos do Conecta (rodada 3, decisão 3): colados por quem libera, valem antes dos lidos do Conecta. */
export interface CatalogosColados { mf: string; inbras: string }

export type DecisaoDaTI = { id: string } & (
  | { acao: 'liberar'; cliente: string; catalogos: CatalogosColados }
  | { acao: 'recusar' | 'suspender'; motivo: string });

const guardarCatalogos = (id: string, c: CatalogosColados) =>
  rpc('dist_guardar_catalogos', { p_id: id, p_mf: c.mf, p_inbras: c.inbras });

export const useGuardarCatalogos = () => useAcaoDoPortal(
  (d: { id: string; catalogos: CatalogosColados }) => guardarCatalogos(d.id, d.catalogos),
  'Catálogos guardados.', 'Não guardou os catálogos');

export const useDecidirDistribuidor = () => useAcaoDoPortal(
  async (d: DecisaoDaTI) => {
    if (d.acao === 'liberar') await guardarCatalogos(d.id, d.catalogos);
    await rpc('dist_decidir', { p_id: d.id, p_acao: d.acao,
      p_cliente_codigo: d.acao === 'liberar' ? d.cliente : null, p_motivo: d.acao === 'liberar' ? null : d.motivo });
    if (d.acao === 'liberar') await mandarEmail('liberado', d.id);
  }, 'Feito.', 'Não registrou a decisão');

export interface ClienteParaLigar {
  codigo: string; razao_social: string; documento: string | null; cidade: string | null; estado: string | null;
  tabela_preco: string | null; mesmo_cnpj: boolean;
}

/** O cliente do Forteplus a ligar (a TI não lê `com_clientes`; a função só responde a quem libera). */
export function useClientesParaLigar(distribuidorId: string | null, busca: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['distribuidor', 'clientes-para-ligar', tenantId, distribuidorId, busca],
    enabled: !!tenantId && !!distribuidorId,
    queryFn: () => rpc<ClienteParaLigar[]>('dist_clientes_para_ligar', { p_distribuidor: distribuidorId, p_busca: busca }),
  });
}

export interface LeituraDoConecta { conta: 'MF' | 'INBRAS'; ok: boolean; detalhe: string | null; em: string }

/** A última leitura do robô `conecta-sync` em cada conta (migration 20270204030000): diz se falta a chave. */
export function useUltimaLeituraDoConecta() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['distribuidor', 'conecta-leituras', tenantId], enabled: !!tenantId,
    queryFn: async () => {
      const linhas = unwrap(await supabase.from('conecta_sincronizacoes' as never).select('conta, ok, detalhe, em')
        .order('em', { ascending: false }).limit(20)) as unknown as LeituraDoConecta[];
      return (['MF', 'INBRAS'] as const).map((conta) => linhas.find((l) => l.conta === conta) ?? null);
    },
  });
}
