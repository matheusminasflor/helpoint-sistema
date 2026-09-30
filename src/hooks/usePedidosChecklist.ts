// O checklist de pedidos Comercial × Financeiro (LEVA S, 2026-09-29). As regras moram no banco
// (migration 20261118010000); a especificação é `docs/manual-checklist-pedidos.md`.
//
// Uma leitura só para as telas — a view `ped_checklists_situacao` (manual §3.6): situação, valor,
// recusas e pagamento vêm prontos, e nenhuma tela recalcula.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap, mensagemDeErro } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';
import type {
  EspelhoDoPedido, Filial, ItemDoChecklist, PedidoDoChecklist, Resposta, TipoDePedido,
} from '@/lib/checklist-de-pedidos';
import type { CategoriaDeColorimetria } from '@/lib/espelho-do-pedido';

export type SituacaoDoChecklist = 'Em análise' | 'Aprovado' | 'Recusado' | 'Finalizado';
export type StatusDoPagamento = 'Em negociação' | 'Pago' | 'Recusado';

export interface Recusa {
  tentativa: number;
  em: string;
  por: string | null;
  motivos: string[];
  observacao: string | null;
}

export interface MovimentoDePagamento {
  status: StatusDoPagamento;
  data: string | null;
  em: string;
  por: string | null;
  observacao: string | null;
}

export interface ChecklistResumo {
  id: string;
  interacao_id: string;
  protocolo: string;
  versao: number;
  enviado_em: string;
  editado_em: string | null;
  contato: string;
  rota: string | null;
  observacao: string | null;
  vendedor_id: string;
  vendedor_nome: string | null;
  cliente_codigo: string;
  cliente_nome: string;
  tabela_preco: string | null;
  qtd_pedidos: number;
  valor_total: number;
  recusas: number;
  historico_recusas: Recusa[];
  historico_pagamentos: MovimentoDePagamento[];
  retorno_status: 'Aprovado' | 'Recusado' | null;
  retorno_motivos: string[] | null;
  retorno_observacao: string | null;
  retorno_em: string | null;
  retorno_por: string | null;
  situacao: SituacaoDoChecklist;
  pagamento_status: StatusDoPagamento | null;
  pagamento_data: string | null;
  finalizado_em: string | null;
  finalizado_por: string | null;
  /** Quem enviou ("Enviado em 29/09/26, 15:34 por Jacqueline"). */
  criado_por_nome: string | null;
}

export interface PedidoGravado {
  id: string;
  ordem: number;
  tipo: TipoDePedido;
  filial: Filial;
  numero: string;
  valor: number;
  desconto: number;
  espelho_total: number | null;
  espelho_st: number | null;
  qtd_coloracao: number | null;
  qtd_tonalizante: number | null;
  importado_em: string | null;
  ped_respostas: { item_id: string; resposta: Resposta; justificativa: string | null; ped_itens?: { ordem: number } | null }[];
}

const CHAVE = 'pedidos-checklist';

function invalidar(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: [CHAVE] });
  // O valor da venda do lançamento muda junto (soma dos pedidos tipo Venda).
  qc.invalidateQueries({ queryKey: ['comercial'] });
}

// ─── Configuração ────────────────────────────────────────────────────────────

export function useItensDoChecklist(todos = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'itens', tenantId, todos],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('ped_itens').select('id, rotulo, ajuda, ordem, pede_justificativa, regra, ativo').order('ordem');
      if (!todos) q = q.eq('ativo', true);
      return unwrap(await q) as (ItemDoChecklist & { ativo: boolean })[];
    },
  });
}

export function useMotivosDeRecusa(todos = false) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'motivos', tenantId, todos],
    enabled: !!tenantId,
    queryFn: async () => {
      let q = supabase.from('ped_motivos_recusa').select('id, nome, ordem, ativo').order('ordem');
      if (!todos) q = q.eq('ativo', true);
      return unwrap(await q) as { id: string; nome: string; ordem: number; ativo: boolean }[];
    },
  });
}

/**
 * Criar ou mudar um item da conferência ou um motivo de recusa (Financeiro › Configurações ›
 * Conferência de pedidos). Item respondido não se apaga — se desliga (`ativo`), para o histórico
 * continuar dizendo o que foi conferido.
 */
export function useSalvarItemDoChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; rotulo: string; ajuda: string | null; ordem: number; pede_justificativa: boolean; ativo: boolean }) => {
      const { id, ...campos } = input;
      return id
        ? expectRows(await supabase.from('ped_itens').update(campos).eq('id', id).select('id'), 'o item')
        : expectRows(await supabase.from('ped_itens').insert(campos).select('id'), 'o item');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE, 'itens'] }),
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useSalvarMotivoDeRecusa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; nome: string; ordem: number; ativo: boolean }) => {
      const { id, ...campos } = input;
      return id
        ? expectRows(await supabase.from('ped_motivos_recusa').update(campos).eq('id', id).select('id'), 'o motivo')
        : expectRows(await supabase.from('ped_motivos_recusa').insert(campos).select('id'), 'o motivo');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [CHAVE, 'motivos'] }),
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

/** O catálogo de colorimetria (código do produto → categoria), para contar o espelho. */
export function useColorimetria() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'colorimetria', tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const linhas = unwrap(await supabase.from('ped_colorimetria').select('codigo, categoria')) as
        { codigo: string; categoria: CategoriaDeColorimetria }[];
      return new Map(linhas.map((l) => [l.codigo, l.categoria]));
    },
  });
}

export interface ResultadoDaCarga {
  confirmado: boolean;
  carregaveis: number;
  colorimetria: number;
  pulados: { protocolo: string; motivo: string }[];
}

/**
 * A carga do histórico do sistema antigo (`ped_carregar_historico`, só dono/admin). `pessoas` liga
 * cada nome do sistema antigo ao id do usuário escolhido na tela. `confirmar: false` é a prévia.
 */
export function useCarregarHistorico() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { pessoas: Record<string, string>; dados: unknown; confirmar: boolean }) =>
      unwrap(await supabase.rpc('ped_carregar_historico', {
        p_pessoas: input.pessoas as Json, p_dados: input.dados as Json, p_confirmar: input.confirmar,
      })) as unknown as ResultadoDaCarga,
    onSuccess: (r) => {
      if (!r.confirmado) return;
      invalidar(qc);
      toast.success(`${r.carregaveis} checklists do sistema anterior importados.`);
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

// ─── Leitura ─────────────────────────────────────────────────────────────────

/** Os checklists que a pessoa pode ver (a vendedora, os dela; o Financeiro, todos). */
export function useChecklists() {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'lista', tenantId, user?.id],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase.from('ped_checklists_situacao').select('*')
      .order('enviado_em', { ascending: false })) as unknown as ChecklistResumo[],
  });
}

/** O checklist de um lançamento, com os pedidos e as respostas — para editar e para conferir. */
export function useChecklistDoLancamento(interacaoId: string | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'lancamento', tenantId, interacaoId],
    enabled: !!tenantId && !!interacaoId,
    queryFn: async () => {
      const resumo = unwrap(await supabase.from('ped_checklists_situacao').select('*')
        .eq('interacao_id', interacaoId!).maybeSingle()) as unknown as ChecklistResumo | null;
      if (!resumo) return null;
      const pedidos = unwrap(await supabase.from('ped_pedidos')
        .select('id, ordem, tipo, filial, numero, valor, desconto, espelho_total, espelho_st, qtd_coloracao, qtd_tonalizante, importado_em, ped_respostas(item_id, resposta, justificativa, ped_itens(ordem))')
        .eq('checklist_id', resumo.id).order('ordem')) as unknown as PedidoGravado[];
      // As respostas na ordem dos itens, como a vendedora respondeu — a conferência e o PDF leem
      // daqui (visto na navegação de 2026-09-30: sem isto saíam na ordem em que o banco devolvia).
      for (const p of pedidos) p.ped_respostas.sort((a, b) => (a.ped_itens?.ordem ?? 0) - (b.ped_itens?.ordem ?? 0));
      return { resumo, pedidos };
    },
  });
}

/** O pedido gravado, de volta ao formato do formulário. */
export function pedidoDoFormulario(p: PedidoGravado): PedidoDoChecklist {
  const espelho: EspelhoDoPedido | null = p.importado_em
    ? { total: Number(p.espelho_total ?? 0), st: Number(p.espelho_st ?? 0), coloracao: p.qtd_coloracao, tonalizante: p.qtd_tonalizante }
    : null;
  return {
    tipo: p.tipo,
    filial: p.filial,
    numero: p.numero,
    valor: String(p.valor).replace('.', ','),
    desconto: Number(p.desconto) ? String(p.desconto).replace('.', ',') : '',
    espelho,
    respostas: Object.fromEntries(p.ped_respostas.map((r) => [r.item_id, r.resposta])),
    justificativas: Object.fromEntries(p.ped_respostas.filter((r) => r.justificativa).map((r) => [r.item_id, r.justificativa!])),
  };
}

export interface QtdEValor { qtd: number; valor: number }
export interface MotivoContado { motivo: string; vezes: number }

/** O painel 18.4 do dono — definições na migration 20261118020000. */
export interface IndicadoresDaConferencia {
  registrado: QtdEValor;
  conciliado: QtdEValor;
  pendente: QtdEValor;
  divergente: QtdEValor;
  recebido: QtdEValor;
  percentual_conciliacao: number | null;
  faturado: number;
  motivos: MotivoContado[];
  /** Quem mais erra, e em quê (2026-09-30): na ordem de mais recusas. */
  por_vendedora: {
    vendedor_id: string;
    nome: string;
    checklists: number;
    com_recusa: number;
    recusas: number;
    valor: number;
    /** % dos checklists que tiveram ao menos uma recusa. */
    taxa: number | null;
    motivos: MotivoContado[];
  }[];
  por_cliente: { codigo: string; nome: string; registrado: number; conciliado: number; recebido: number; faturado: number }[];
}

export function useIndicadoresDaConferencia(de: string, ate: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: [CHAVE, 'indicadores', tenantId, de, ate],
    enabled: !!tenantId && !!de && !!ate,
    queryFn: async () =>
      unwrap(await supabase.rpc('ped_indicadores', { p_de: de, p_ate: ate })) as unknown as IndicadoresDaConferencia,
  });
}

// ─── Escrita ─────────────────────────────────────────────────────────────────

export function useSalvarChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { interacaoId: string; dados: unknown }) => {
      const id = unwrap(await supabase.rpc('ped_salvar_checklist', {
        p_interacao: input.interacaoId,
        p_dados: input.dados as Json,
      })) as unknown as string | null;
      if (!id) throw new Error('O checklist não foi gravado.');
      return id;
    },
    onSuccess: () => {
      invalidar(qc);
      toast.success('Checklist enviado ao Financeiro.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

/**
 * As três ações do Financeiro. Cada uma é um INSERT numa tabela só-inserção, e `.select()` prova
 * que gravou (regra 2): a policy barrada devolve erro 42501 no insert, e o trigger que recusa
 * (decisão repetida, pagamento depois de Pago) devolve a frase do manual.
 */
export function useDecidirChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { checklistId: string; status: 'Aprovado' | 'Recusado'; motivos: string[]; observacao: string }) =>
      unwrap(await supabase.from('ped_decisoes').insert({
        checklist_id: input.checklistId, status: input.status, motivos: input.motivos,
        observacao: input.observacao.trim() || null,
      }).select('id').single()),
    onSuccess: (_r, input) => {
      invalidar(qc);
      toast.success(input.status === 'Aprovado' ? 'Checklist aprovado.' : 'Checklist recusado — volta para o Comercial.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useRegistrarPagamento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { checklistId: string; status: StatusDoPagamento; data: string | null; observacao: string }) =>
      unwrap(await supabase.from('ped_pagamentos').insert({
        checklist_id: input.checklistId, status: input.status, data_pagamento: input.data,
        observacao: input.observacao.trim() || null,
      }).select('id').single()),
    onSuccess: () => {
      invalidar(qc);
      toast.success('Pagamento registrado.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}

export function useFinalizarChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { checklistId: string; observacao: string }) =>
      unwrap(await supabase.from('ped_finalizacoes').insert({
        checklist_id: input.checklistId, observacao: input.observacao.trim() || null,
      }).select('checklist_id').single()),
    onSuccess: () => {
      invalidar(qc);
      toast.success('Checklist finalizado.');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });
}
