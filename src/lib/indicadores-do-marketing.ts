// Os indicadores do Marketing além dos chamados (rodada 2, R6): o estoque abaixo do mínimo, os pedidos de arte e o
// atraso do Benefício de sexta. Tudo do que as telas já leem (estoque, pedidos, retiradas); só a conta mora aqui.
import { terminou, type EtapaDaSolicitacao } from '@/config/solicitacoes';

export interface MovimentoDeEstoque { produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number }

/** O saldo de cada produto: entradas menos saídas (a mesma conta da tela do Estoque). */
export function saldosDoEstoque(movimentos: MovimentoDeEstoque[]): Map<string, number> {
  const s = new Map<string, number>();
  for (const m of movimentos) s.set(m.produto_id, (s.get(m.produto_id) ?? 0) + (m.tipo === 'entrada' ? m.quantidade : -m.quantidade));
  return s;
}

export interface ProdutoComMinimo { id: string; nome: string; unidade: string; estoque_minimo: number; ativo: boolean }
export interface PedidoDeArte { etapa: EtapaDaSolicitacao; created_at: string; atualizada_em: string; preciso_ate: string | null }
export interface RetiradaDoBeneficio { status: string; retirado_em: string | null; prazo: string | null; devolvido_em: string | null; atraso: boolean }

export interface IndicadoresDoMarketing {
  abaixoDoMinimo: { nome: string; unidade: string; saldo: number; minimo: number }[];
  pedidosNoPeriodo: number; entreguesNoPeriodo: number; abertos: number; atrasados: number;
  retiradasNoPeriodo: number; devolvidasComAtraso: number; foraDoPrazoAgora: number;
}

const dia = (iso: string | null) => (iso ?? '').slice(0, 10);

/** `de`/`ate`/`hoje` em AAAA-MM-DD (dia local). Pedido entra no período pela data do pedido; retirada, pela da retirada. */
export function indicadoresDoMarketing(a: {
  produtos: ProdutoComMinimo[]; movimentos: MovimentoDeEstoque[]; pedidos: PedidoDeArte[]; retiradas: RetiradaDoBeneficio[];
  de: string; ate: string; hoje: string;
}): IndicadoresDoMarketing {
  const saldo = saldosDoEstoque(a.movimentos);
  const noPeriodo = (iso: string | null) => !!iso && dia(iso) >= a.de && dia(iso) <= a.ate;
  const pedidos = a.pedidos.filter((p) => noPeriodo(p.created_at));
  const abertos = a.pedidos.filter((p) => !terminou('arte', p.etapa));
  const retiradas = a.retiradas.filter((r) => noPeriodo(r.retirado_em));
  return {
    abaixoDoMinimo: a.produtos
      .filter((p) => p.ativo && p.estoque_minimo > 0 && (saldo.get(p.id) ?? 0) < p.estoque_minimo)
      .map((p) => ({ nome: p.nome, unidade: p.unidade, saldo: saldo.get(p.id) ?? 0, minimo: p.estoque_minimo }))
      .sort((x, y) => x.saldo / x.minimo - y.saldo / y.minimo),
    pedidosNoPeriodo: pedidos.length,
    entreguesNoPeriodo: pedidos.filter((p) => p.etapa === 'entregue').length,
    abertos: abertos.length,
    atrasados: abertos.filter((p) => p.preciso_ate && p.preciso_ate < a.hoje).length,
    retiradasNoPeriodo: retiradas.length,
    devolvidasComAtraso: retiradas.filter((r) => r.atraso).length,
    foraDoPrazoAgora: a.retiradas.filter((r) => r.status === 'retirada' && r.prazo && dia(r.prazo) < a.hoje).length,
  };
}
