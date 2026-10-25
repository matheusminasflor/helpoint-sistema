// "Pede atenção" do Resumo da Diretoria (proposta "Helpoint no dia a dia", etapa 4 · Diretoria, 2026-10-25): os três
// alertas mais fortes de clientes e produtos. Puro, para o teste.
//
// ponytail: cliente que parou se mede em R$ (o que comprava nos 3 meses anteriores) e produto que cai em % — não se
// comparam numa régua só. Então são até dois clientes (os de maior valor) e o produto que mais caiu pesado pelo
// faturamento; sem produto caindo, o terceiro é cliente. Se um dia houver "valor em risco" do produto, uma régua só.
import type { ClienteATrabalhar, TendenciaProduto } from '@/types/comercial';

export interface AlertaDaDiretoria {
  tipo: 'cliente' | 'produto';
  codigo: string;
  nome: string;
  /** Para ordenar: R$ do cliente; faturamento × queda do produto. */
  peso: number;
  variacao?: number;
  valor?: number;
  ultimaCompra?: string | null;
}

export function alertasDoResumo(clientes: ClienteATrabalhar[], produtos: TendenciaProduto[], maximo = 3): AlertaDaDiretoria[] {
  const deClientes: AlertaDaDiretoria[] = [...clientes]
    .filter((c) => c.valor_ultimos_3m > 0)
    .sort((a, b) => b.valor_ultimos_3m - a.valor_ultimos_3m)
    .map((c) => ({ tipo: 'cliente', codigo: c.cliente_codigo, nome: c.nome, peso: c.valor_ultimos_3m, valor: c.valor_ultimos_3m, ultimaCompra: c.ultima_compra }));
  const deProdutos: AlertaDaDiretoria[] = produtos
    .filter((p) => p.situacao === 'Caindo' && p.variacao !== null && p.variacao < 0)
    .map((p) => ({ tipo: 'produto' as const, codigo: p.produto_codigo, nome: p.nome, peso: p.faturamento * -p.variacao!, variacao: p.variacao! }))
    .sort((a, b) => b.peso - a.peso);
  const produto = deProdutos.slice(0, 1);
  return [...deClientes.slice(0, maximo - produto.length), ...produto];
}

/** Clientes que pararam e o que eles compravam nos 3 meses anteriores. */
export function clientesQuePararam(clientes: ClienteATrabalhar[]) {
  return { quantos: clientes.length, emRisco: clientes.reduce((s, c) => s + (Number(c.valor_ultimos_3m) || 0), 0) };
}
