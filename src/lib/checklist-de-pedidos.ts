// O checklist de pedidos na tela da vendedora (LEVA S, 2026-09-29) — as mesmas regras que o banco
// confere em `ped_salvar_checklist` (migration 20261118010000), ditas antes de enviar, com as
// mesmas frases. Quem garante é o banco; isto só evita que a vendedora descubra pelo erro.
// Especificação: `docs/manual-checklist-pedidos.md`.

export type Resposta = 'Sim' | 'Não' | 'Não se aplica';
export const RESPOSTAS: Resposta[] = ['Sim', 'Não', 'Não se aplica'];
export const TIPOS_DE_PEDIDO = ['Venda', 'Bonificação', 'Publicidade', 'Cashback'] as const;
export const FILIAIS = ['INBRAS', 'MF'] as const;
export const MAXIMO_DE_PEDIDOS = 10;

export type TipoDePedido = (typeof TIPOS_DE_PEDIDO)[number];
export type Filial = (typeof FILIAIS)[number];

export interface ItemDoChecklist {
  id: string;
  rotulo: string;
  ajuda: string | null;
  ordem: number;
  pede_justificativa: boolean;
  regra: 'st' | null;
}

export interface EspelhoDoPedido {
  total: number;
  st: number;
  coloracao: number | null;
  tonalizante: number | null;
}

export interface PedidoDoChecklist {
  tipo: TipoDePedido;
  filial: Filial;
  numero: string;
  /** Total líquido, com o desconto (texto como digitado: "1.234,56"). */
  valor: string;
  desconto: string;
  espelho: EspelhoDoPedido | null;
  /** item_id → resposta */
  respostas: Record<string, Resposta>;
  /** item_id → justificativa */
  justificativas: Record<string, string>;
}

export function pedidoVazio(): PedidoDoChecklist {
  return { tipo: 'Venda', filial: 'MF', numero: '', valor: '', desconto: '', espelho: null, respostas: {}, justificativas: {} };
}

/** O checklist enquanto a vendedora preenche. */
export interface ChecklistEmEdicao {
  contato: string;
  rota: string;
  observacao: string;
  pedidos: PedidoDoChecklist[];
}

export function checklistVazio(): ChecklistEmEdicao {
  return { contato: '', rota: '', observacao: '', pedidos: [pedidoVazio()] };
}

/** "1.234,56" → 1234.56; vazio ou inválido → null. */
export function lerValor(texto: string): number | null {
  const t = texto.trim();
  if (!t) return null;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** O valor da venda do lançamento: a soma dos pedidos tipo Venda (manual §6.7). */
export function valorDaVenda(pedidos: PedidoDoChecklist[]): number {
  return pedidos.filter((p) => p.tipo === 'Venda').reduce((s, p) => s + (lerValor(p.valor) ?? 0), 0);
}

const moeda = (n: number) => n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * O que impede o envio, na ordem em que o banco diria: por pedido, os campos, depois os itens sem
 * resposta, os "Não", as justificativas e o ST. Vazio = pode enviar.
 */
export function problemasDoChecklist(contato: string, pedidos: PedidoDoChecklist[], itens: ItemDoChecklist[]): string[] {
  const problemas: string[] = [];
  if (!contato.trim()) problemas.push('Informe o contato do cliente.');
  if (pedidos.length === 0) problemas.push('O checklist precisa de pelo menos um pedido.');
  if (pedidos.length > MAXIMO_DE_PEDIDOS) problemas.push(`O checklist tem no máximo ${MAXIMO_DE_PEDIDOS} pedidos.`);
  const ordenados = [...itens].sort((a, b) => a.ordem - b.ordem);

  pedidos.forEach((p, i) => {
    const n = i + 1;
    if (!p.numero.trim()) problemas.push(`Pedido ${n}: falta o número do pedido no Forteplus.`);
    if (lerValor(p.valor) === null) problemas.push(`Pedido ${n}: valor inválido.`);
    if (p.desconto.trim() && lerValor(p.desconto) === null) problemas.push(`Pedido ${n}: desconto inválido.`);
    for (const item of ordenados) {
      const r = p.respostas[item.id];
      if (!r) problemas.push(`Pedido ${n}: falta responder "${item.rotulo}".`);
      else if (r === 'Não') problemas.push(`Pedido ${n}: "${item.rotulo}" está como Não — corrija no Forteplus antes de enviar.`);
      else if (r === 'Sim' && item.pede_justificativa && !p.justificativas[item.id]?.trim()) {
        problemas.push(`Pedido ${n}: "${item.rotulo}" pede justificativa.`);
      } else if (item.regra === 'st' && p.espelho) {
        if (p.espelho.st > 0 && r === 'Não se aplica') {
          problemas.push(`Pedido ${n}: o espelho tem ST de R$ ${moeda(p.espelho.st)}, e "${item.rotulo}" está como Não se aplica.`);
        } else if (p.espelho.st === 0 && r === 'Sim') {
          problemas.push(`Pedido ${n}: o espelho não tem ST, e "${item.rotulo}" está como Sim.`);
        }
      }
    }
  });
  return problemas;
}

export type SituacaoDoSt = 'ST pendente' | 'ST atualizado' | 'S/ST';

/**
 * O ST do atendimento, como o resumo do sistema antigo mostrava ao Financeiro: pelas respostas do
 * item "Atualizar ST" de todos os pedidos — algum "Não" é pendente; algum "Sim", atualizado; senão,
 * sem ST.
 */
export function situacaoDoSt(respostas: (Resposta | undefined)[]): SituacaoDoSt {
  if (respostas.includes('Não')) return 'ST pendente';
  if (respostas.includes('Sim')) return 'ST atualizado';
  return 'S/ST';
}

/** O que vai para `ped_salvar_checklist`. */
export function dadosParaOBanco(contato: string, rota: string, observacao: string, pedidos: PedidoDoChecklist[], itens: ItemDoChecklist[]) {
  return {
    contato: contato.trim(),
    rota: rota.trim(),
    observacao: observacao.trim(),
    pedidos: pedidos.map((p, i) => ({
      ordem: i + 1,
      tipo: p.tipo,
      filial: p.filial,
      numero: p.numero.trim(),
      valor: lerValor(p.valor),
      desconto: lerValor(p.desconto) ?? 0,
      espelho: p.espelho,
      respostas: itens
        .filter((item) => p.respostas[item.id])
        .map((item) => ({ item_id: item.id, resposta: p.respostas[item.id], justificativa: p.justificativas[item.id] ?? null })),
    })),
  };
}
