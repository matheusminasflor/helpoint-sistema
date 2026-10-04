// O lançamento da vendedora e o Painel do Gestor (LEVA O) — a planilha de Gestão Comercial
// dentro do sistema. A especificação é `docs/manual-gestao-comercial.md`; as regras que ela
// impõe moram no banco (migration `20261113010000`), e este arquivo só as chama.
//
// Duas coisas daqui não são óbvias:
//
// 1. SALVAR É UMA CHAMADA SÓ (`com_salvar_interacao`). Interação e marcações Sim em duas
//    chamadas deixariam, na falha da segunda, um lançamento sem nenhuma marca — contado como
//    contato, sem o indicador que a vendedora marcou.
//
// 2. OS NÚMEROS DO PAINEL VÊM PRONTOS, COM A COR. A régua do farol (verde ≥ meta, amarelo
//    ≥ 70%, vermelho abaixo, e "sem meta" quando a meta é zero) está em `com_cor_do_farol`, no
//    banco. A tela não recalcula — duas réguas iguais em dois lugares viram duas réguas
//    diferentes na primeira mudança.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type { Json } from '@/integrations/supabase/types';
import { addDays } from 'date-fns';
import { fromLocalISODate, toLocalISODate } from '@/lib/dates';
import { buscarComTeto, type ConsultaComLimite } from '@/lib/listas';
import type { IntervaloDeDias } from '@/lib/period';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type TipoIndicador = 'indicador' | 'acao';
export type StatusInteracao = 'em_andamento' | 'agendado' | 'concluido';
export type CorFarol = 'verde' | 'amarelo' | 'vermelho' | 'sem_meta';

export const STATUS_INTERACAO: { valor: StatusInteracao; rotulo: string }[] = [
  { valor: 'em_andamento', rotulo: 'Em andamento' },
  { valor: 'agendado', rotulo: 'Agendado' },
  { valor: 'concluido', rotulo: 'Concluído' },
];

export interface IndicadorCatalogo {
  id: string;
  tipo: TipoIndicador;
  nome: string;
  rotulo_painel: string | null;
  ordem: number;
  ativo: boolean;
  periodo: 'mes' | 'semana';
  conta_em_aberto: boolean;
}

export interface Interacao {
  id: string;
  vendedor_id: string;
  cliente_codigo: string | null;
  data: string;
  status: StatusInteracao;
  valor_venda: number | null;
  prazo: string | null;
  observacoes: string | null;
  fora_da_carteira: boolean;
  marcas: string[];
  cliente: { razao_social: string; cidade: string | null; estado: string | null; telefone: string | null } | null;
}

export interface InteracaoInput {
  id?: string;
  cliente_codigo: string | null;
  data: string;
  status: StatusInteracao;
  valor_venda: number | null;
  prazo: string | null;
  observacoes: string | null;
  fora_da_carteira: boolean;
  marcas: string[];
}

export interface ClienteParaLancar {
  codigo: string;
  razao_social: string;
  fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  carteira: string | null;
}

export interface LinhaPainel {
  vendedor_id: string;
  vendedor_nome: string;
  carteira: string | null;
  ordem: number;
  metrica: string;
  rotulo: string;
  periodo: string;
  meta: number | null;
  realizado: number | null;
  cor: CorFarol;
}

export interface LinhaFarolAcao {
  indicador_id: string;
  acao: string;
  ordem: number;
  vendedor_id: string;
  vendedor_nome: string;
  quantidade: number;
}

export interface ResumoCarteira {
  vendedor_id: string;
  vendedor_nome: string;
  carteira: string | null;
  total_carteira: number;
  ativos: number;
  inativos: number;
  nunca_compraram: number;
  relacionados: number;
  compradores: number;
  relacionados_sem_compra: number;
  valor_vendido: number;
  compradores_ativos: number;
  vendas_ativos: number;
  ticket_ativos: number | null;
  compradores_inativos: number;
  vendas_inativos: number;
  ticket_inativos: number | null;
  media_base_ativa: number | null;
}

const num = (v: unknown): number => Number(v ?? 0);
const numOuNulo = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ─── Catálogo de indicadores ─────────────────────────────────────────────────

/** Os 14 indicadores e 12 ações da planilha — ou o que o gestor fez deles. */
export function useIndicadoresCatalogo() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'indicadores-catalogo', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<IndicadorCatalogo[]> =>
      unwrap(await supabase
        .from('com_indicadores')
        .select('id, tipo, nome, rotulo_painel, ordem, ativo, periodo, conta_em_aberto')
        .order('tipo')
        .order('ordem')) as IndicadorCatalogo[],
  });
}

export function useSalvarIndicador() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ind: Partial<IndicadorCatalogo> & { tipo: TipoIndicador; nome: string }) => {
      const dados = {
        tipo: ind.tipo,
        nome: ind.nome.trim(),
        rotulo_painel: ind.rotulo_painel?.trim() || null,
        ordem: ind.ordem ?? 0,
        ativo: ind.ativo ?? true,
        periodo: ind.periodo ?? 'mes',
        conta_em_aberto: ind.tipo === 'indicador' ? (ind.conta_em_aberto ?? false) : false,
        updated_at: new Date().toISOString(),
      };
      return ind.id
        ? expectRows(await supabase.from('com_indicadores').update(dados).eq('id', ind.id).select('id'), 'o indicador')
        : expectRows(await supabase.from('com_indicadores').insert({ ...dados, tenant_id: tenantId! }).select('id'), 'o indicador');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comercial', 'indicadores-catalogo', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'painel-do-gestor', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'farol-de-acoes', tenantId] });
      toast.success('Indicador salvo.');
    },
    onError: (e: unknown) => {
      const codigo = (e as { code?: string } | null)?.code;
      toast.error(codigo === '23505' ? 'Já existe um item com este nome.' : mensagemDeErro(e));
    },
  });
}

// ─── A vendedora e os clientes dela ──────────────────────────────────────────

/**
 * As carteiras de quem está logado. Desde 2026-10-01 uma pessoa pode estar em uma, duas ou mais
 * (pedido do dono; migration 20261119060000) — era "uma pessoa, uma carteira".
 */
export function useMinhasCarteiras() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'minhas-carteiras', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async (): Promise<string[]> => {
      const linhas = unwrap(await supabase
        .from('com_carteira_membros')
        .select('carteira')
        .eq('user_id', user!.id)
        .order('carteira')) as { carteira: string }[];
      return linhas.map((l) => l.carteira);
    },
  });
}

const COLUNAS_CLIENTE = 'codigo, razao_social, fantasia, cidade, estado, telefone, carteira';

/** Os clientes das carteiras dela — a lista padrão do lançamento. */
export function useClientesDaCarteira(carteiras: string[]) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'clientes-da-carteira', tenantId, carteiras.join('|')],
    enabled: !!tenantId && carteiras.length > 0,
    queryFn: async (): Promise<ClienteParaLancar[]> =>
      unwrap(await supabase
        .from('com_clientes')
        .select(COLUNAS_CLIENTE)
        .in('carteira', carteiras)
        .order('razao_social')) as ClienteParaLancar[],
  });
}

/**
 * Busca em TODA a base — é o escape ("fora da minha carteira") e o caminho para trazer
 * cliente do Histórico. Só busca com 2 letras ou mais: 450 clientes num select não se
 * escolhem, se procuram.
 */
export function useBuscarClienteParaLancar(termo: string) {
  const { tenantId } = useAuth();
  const t = termo.trim();
  return useQuery({
    queryKey: ['comercial', 'buscar-cliente-lancar', tenantId, t],
    enabled: !!tenantId && t.length >= 2,
    queryFn: async (): Promise<ClienteParaLancar[]> => {
      const padrao = `%${t.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
      return unwrap(await supabase
        .from('com_clientes')
        .select(COLUNAS_CLIENTE)
        .or(`razao_social.ilike.${padrao},fantasia.ilike.${padrao},codigo.ilike.${padrao}`)
        .order('razao_social')
        .limit(20)) as ClienteParaLancar[];
    },
  });
}

// ─── Lançamentos ─────────────────────────────────────────────────────────────

type InteracaoCrua = Omit<Interacao, 'marcas' | 'valor_venda'> & {
  valor_venda: unknown; marcas: { indicador_id: string }[];
};

/** A consulta dos lançamentos de `de` a `ate` (os dois dias incluídos), mais novos primeiro. */
function consultaDeInteracoes(de: string, ate: string, vendedorId?: string) {
  let q = supabase
    .from('com_interacoes')
    .select(`id, vendedor_id, cliente_codigo, data, status, valor_venda, prazo, observacoes, fora_da_carteira,
             marcas:com_interacao_marcas(indicador_id),
             cliente:com_clientes(razao_social, cidade, estado, telefone)`)
    .gte('data', de)
    .lte('data', ate)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false });
  if (vendedorId) q = q.eq('vendedor_id', vendedorId);
  return q;
}

function lerInteracoes(linhas: InteracaoCrua[]): Interacao[] {
  return linhas.map((l) => ({
    ...l,
    valor_venda: numOuNulo(l.valor_venda),
    marcas: (l.marcas ?? []).map((m) => m.indicador_id),
  }));
}

/**
 * Os lançamentos de uma competência. O RLS decide: a vendedora vê os dela; o gestor, todos.
 * `ativo = false` desliga a consulta — é o que a tela faz quando está num período, e não num mês.
 */
export function useInteracoes(competencia: string, vendedorId?: string, ativo = true) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'interacoes', tenantId, competencia, vendedorId ?? 'todas'],
    enabled: !!tenantId && ativo,
    queryFn: async (): Promise<Interacao[]> => {
      // O último dia do mês é a véspera do 1º do mês seguinte (`data` é dia puro, sem hora).
      const ultimoDia = toLocalISODate(addDays(fromLocalISODate(proximoMes(competencia)), -1));
      return lerInteracoes(unwrap(await consultaDeInteracoes(competencia, ultimoDia, vendedorId)) as unknown as InteracaoCrua[]);
    },
  });
}

/**
 * Os lançamentos de um PERÍODO (pedido do dono, 2026-10-03: "Este trimestre", "Personalizado"),
 * nos dias exatos. Um mês cabe folgado no corte de 1.000 linhas do PostgREST; um ano de uma
 * equipe, não — então aqui a lista passa por `buscarComTeto` e a tela diz quando cortou, em vez
 * de somar um pedaço como se fosse o todo.
 */
export function useInteracoesDoPeriodo(intervalo: IntervaloDeDias | null, vendedorId?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'interacoes', tenantId, 'periodo', intervalo?.de ?? null, intervalo?.ate ?? null, vendedorId ?? 'todas'],
    enabled: !!tenantId && !!intervalo,
    queryFn: async (): Promise<{ linhas: Interacao[]; cortou: boolean }> => {
      const { linhas, cortou } = await buscarComTeto<InteracaoCrua>(
        consultaDeInteracoes(intervalo!.de, intervalo!.ate, vendedorId) as unknown as ConsultaComLimite<InteracaoCrua>,
      );
      return { linhas: lerInteracoes(linhas), cortou };
    },
  });
}

function proximoMes(competencia: string): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7));
  return mes === 12 ? `${ano + 1}-01-01` : `${ano}-${String(mes + 1).padStart(2, '0')}-01`;
}

function invalidarPainel(qc: ReturnType<typeof useQueryClient>, tenantId?: string | null) {
  for (const chave of ['interacoes', 'painel-do-gestor', 'farol-de-acoes', 'resumo-da-carteira',
    'acompanhamento-da-carteira', 'carteira-mes-a-mes']) {
    qc.invalidateQueries({ queryKey: ['comercial', chave, tenantId] });
  }
}

/**
 * Traduz o erro do banco para o que a vendedora precisa fazer. As três recusas que o banco
 * dá de propósito têm causa conhecida — dizer a causa é mais útil do que "violates row-level
 * security policy".
 */
function mensagemDoLancamento(e: unknown): string {
  const codigo = (e as { code?: string } | null)?.code;
  const texto = mensagemDeErro(e);
  if (codigo === '23514' && /exige cliente/i.test(texto)) return texto;
  if (codigo === '42501' && /row-level security/i.test(texto)) {
    return 'Este cliente não está na sua carteira. Traga-o para a sua carteira (se ele estiver no Histórico) ou marque "fora da minha carteira".';
  }
  return texto;
}

export function useSalvarInteracao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InteracaoInput): Promise<string> => {
      const dados = {
        cliente_codigo: input.cliente_codigo,
        data: input.data,
        status: input.status,
        valor_venda: input.valor_venda === null ? '' : String(input.valor_venda),
        prazo: input.prazo ?? '',
        observacoes: input.observacoes ?? '',
        fora_da_carteira: input.fora_da_carteira,
      };
      const id = unwrap(await supabase.rpc('com_salvar_interacao', {
        p_id: input.id ?? null,
        p_dados: dados as unknown as Json,
        p_marcas: input.marcas,
      })) as unknown as string | null;
      // A função devolve o id gravado; sem ele, nada foi gravado — e a tela não pode dizer
      // "salvo" (regra 2 das cinco, do lado da RPC).
      if (!id) throw new Error('O lançamento não foi gravado.');
      return id;
    },
    onSuccess: (_id, input) => {
      invalidarPainel(qc, tenantId);
      toast.success(input.id ? 'Lançamento atualizado.' : 'Lançamento registrado.');
    },
    onError: (e: unknown) => toast.error(mensagemDoLancamento(e)),
  });
}

export function useApagarInteracao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('com_interacoes').delete().eq('id', id).select('id'), 'o lançamento'),
    onSuccess: () => {
      invalidarPainel(qc, tenantId);
      toast.success('Lançamento apagado.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

// ─── Carteira ────────────────────────────────────────────────────────────────

export interface ResultadoLote { pedidos: number; atribuidos: number; ficaram_de_fora: number }

/**
 * Atribuir clientes a uma carteira, em lote. O gestor move qualquer um; a vendedora só traz
 * do Histórico para a própria carteira — o banco decide, e devolve quantos ficaram de fora
 * para a tela dizer, em vez de a linha proibida derrubar o lote inteiro.
 */
export function useAtribuirCarteiraEmLote() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { codigos: string[]; carteira: string | null }): Promise<ResultadoLote> =>
      unwrap(await supabase.rpc('com_atribuir_carteira_em_lote', {
        p_codigos: input.codigos,
        p_carteira: input.carteira ?? '',
      })) as unknown as ResultadoLote,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'cliente'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes-da-carteira', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'resumo-da-carteira', tenantId] });
      if (r.atribuidos === 0) {
        toast.error('Nenhum cliente mudou de carteira — eles já estavam nela, ou são da carteira de outra pessoa.');
      } else if (r.ficaram_de_fora > 0) {
        toast.success(`${r.atribuidos} cliente(s) atribuído(s). ${r.ficaram_de_fora} ficaram de fora: já estavam nesta carteira ou são de outra.`);
      } else {
        toast.success(`${r.atribuidos} cliente(s) atribuído(s).`);
      }
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

/**
 * Pôr vários códigos no mesmo grupo (cliente de acompanhamento) de uma vez — o jeito de juntar
 * os CNPJs do mesmo dono sem abrir ficha por ficha. Grupo vazio desfaz: cada código volta a ser
 * o próprio grupo.
 */
export function useAgruparClientes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { codigos: string[]; grupo: string | null }) =>
      expectRows(
        await supabase.from('com_clientes')
          .update({ grupo: input.grupo?.trim() || null } as never)
          .in('codigo', input.codigos)
          .select('id'),
        'o grupo dos clientes',
      ),
    onSuccess: (linhas, input) => {
      qc.invalidateQueries({ queryKey: ['comercial', 'clientes'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'cliente'] });
      qc.invalidateQueries({ queryKey: ['comercial', 'acompanhamento-da-carteira'] });
      toast.success(input.grupo?.trim()
        ? `${linhas.length} cliente(s) agrupado(s) como "${input.grupo.trim()}".`
        : `${linhas.length} cliente(s) desagrupado(s).`);
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

// ─── Acompanhamento por carteira ─────────────────────────────────────────────

export interface LinhaAcompanhamento {
  grupo_chave: string;
  grupo_nome: string;
  codigos: string[];
  tabelas: string | null;
  uf_cidade: string | null;
  situacao: 'ativo' | 'inativo' | 'nunca_comprou';
  ultima_compra: string | null;
  dias_sem_comprar: number | null;
  faturado_12m: number;
  meses_com_compra: number;
  media_meses_compra: number | null;
  recompra: boolean;
  venda_mes: number;
  contatos_mes: number;
  ultimo_contato: string | null;
  status_ultimo_contato: StatusInteracao | null;
  proximo_prazo: string | null;
  observacao: string | null;
}

/** Uma linha por grupo da carteira (manual §8.2). A porta é a carteira: a vendedora, só a dela. */
export function useAcompanhamentoDaCarteira(carteira: string | null, competencia: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'acompanhamento-da-carteira', tenantId, carteira, competencia],
    enabled: !!tenantId && !!carteira,
    queryFn: async (): Promise<LinhaAcompanhamento[]> => {
      const linhas = unwrap(await supabase.rpc('com_acompanhamento_da_carteira', {
        p_carteira: carteira!, p_competencia: competencia,
      })) as unknown as Array<Record<string, unknown>>;
      return linhas.map((l) => ({
        ...(l as unknown as LinhaAcompanhamento),
        faturado_12m: num(l.faturado_12m),
        media_meses_compra: numOuNulo(l.media_meses_compra),
        venda_mes: num(l.venda_mes),
      }));
    },
  });
}

export interface MesDaCarteira { mes: number; meta: number | null; venda: number; cor: CorFarol }

/** Meta da Diretoria × venda lançada, os 12 meses do ano (manual §8.1). */
export function useCarteiraMesAMes(carteira: string | null, ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteira-mes-a-mes', tenantId, carteira, ano],
    enabled: !!tenantId && !!carteira,
    queryFn: async (): Promise<MesDaCarteira[]> => {
      const linhas = unwrap(await supabase.rpc('com_carteira_mes_a_mes', {
        p_carteira: carteira!, p_ano: ano,
      })) as unknown as Array<{ mes: number; meta: unknown; venda: unknown; cor: CorFarol }>;
      return linhas.map((l) => ({ mes: l.mes, meta: numOuNulo(l.meta), venda: num(l.venda), cor: l.cor }));
    },
  });
}

// ─── Painel do Gestor ────────────────────────────────────────────────────────

export function usePainelDoGestor(competencia: string, intervalo?: IntervaloDeDias | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'painel-do-gestor', tenantId, competencia, intervalo?.de ?? null, intervalo?.ate ?? null],
    enabled: !!tenantId,
    queryFn: async (): Promise<LinhaPainel[]> => {
      const linhas = unwrap(await supabase.rpc('com_painel_do_gestor', {
        p_competencia: competencia, p_de: intervalo?.de ?? null, p_ate: intervalo?.ate ?? null,
      })) as unknown as Array<
        Omit<LinhaPainel, 'meta' | 'realizado'> & { meta: unknown; realizado: unknown }>;
      return linhas.map((l) => ({ ...l, meta: numOuNulo(l.meta), realizado: numOuNulo(l.realizado) }));
    },
  });
}

export function useFarolDeAcoes(competencia: string, intervalo?: IntervaloDeDias | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'farol-de-acoes', tenantId, competencia, intervalo?.de ?? null, intervalo?.ate ?? null],
    enabled: !!tenantId,
    queryFn: async (): Promise<LinhaFarolAcao[]> => {
      const linhas = unwrap(await supabase.rpc('com_farol_de_acoes', {
        p_competencia: competencia, p_de: intervalo?.de ?? null, p_ate: intervalo?.ate ?? null,
      })) as unknown as Array<
        Omit<LinhaFarolAcao, 'quantidade'> & { quantidade: unknown }>;
      return linhas.map((l) => ({ ...l, quantidade: num(l.quantidade) }));
    },
  });
}

export function useResumoDaCarteira(competencia: string, intervalo?: IntervaloDeDias | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'resumo-da-carteira', tenantId, competencia, intervalo?.de ?? null, intervalo?.ate ?? null],
    enabled: !!tenantId,
    queryFn: async (): Promise<ResumoCarteira[]> => {
      const linhas = unwrap(await supabase.rpc('com_resumo_da_carteira', {
        p_competencia: competencia, p_de: intervalo?.de ?? null, p_ate: intervalo?.ate ?? null,
      })) as unknown as Array<Record<string, unknown>>;
      return linhas.map((l) => ({
        vendedor_id: String(l.vendedor_id),
        vendedor_nome: String(l.vendedor_nome ?? ''),
        carteira: (l.carteira as string | null) ?? null,
        total_carteira: num(l.total_carteira),
        ativos: num(l.ativos),
        inativos: num(l.inativos),
        nunca_compraram: num(l.nunca_compraram),
        relacionados: num(l.relacionados),
        compradores: num(l.compradores),
        relacionados_sem_compra: num(l.relacionados_sem_compra),
        valor_vendido: num(l.valor_vendido),
        compradores_ativos: num(l.compradores_ativos),
        vendas_ativos: num(l.vendas_ativos),
        ticket_ativos: numOuNulo(l.ticket_ativos),
        compradores_inativos: num(l.compradores_inativos),
        vendas_inativos: num(l.vendas_inativos),
        ticket_inativos: numOuNulo(l.ticket_inativos),
        media_base_ativa: numOuNulo(l.media_base_ativa),
      }));
    },
  });
}

/**
 * Gravar a meta de um indicador para uma vendedora. A meta vale a partir desta competência e
 * até alguém mudar — como a coluna C da planilha, que atravessa os meses. Cada mudança fica
 * gravada na competência em que passou a valer, então o histórico não se perde.
 */
export function useSalvarMetaIndicador() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { vendedorId: string; competencia: string; metrica: string; meta: number }) =>
      expectRows(
        await supabase.from('com_metas_indicador').upsert({
          tenant_id: tenantId!,
          vendedor_id: input.vendedorId,
          competencia: input.competencia,
          metrica: input.metrica,
          meta: input.meta,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,vendedor_id,competencia,metrica' }).select('id'),
        'a meta',
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comercial', 'painel-do-gestor', tenantId] });
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}
