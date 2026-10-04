// Diretrizes comerciais (decisão do dono, 2026-10-04): "comprou no mês 36 OX 6 volumes → R$ 100 de
// cashback na próxima compra". A apuração mora no banco (`com_diretrizes_apuracao`, migration
// 20261203010000); aqui só o que a tela faz com o que veio: separar em "a conceder", "perto" e
// "concedidos", somar os cartões do topo, escrever o benefício em português e conferir o
// formulário antes de mandar (o banco confere de novo — CHECK — e é ele quem barra).
import { formatBRL } from '@/types/financeiro';

export type TipoDeBeneficio = 'cashback_valor' | 'cashback_percentual' | 'bonificacao';

export const TIPOS_DE_BENEFICIO: { valor: TipoDeBeneficio; rotulo: string }[] = [
  { valor: 'cashback_valor', rotulo: 'Cashback em R$' },
  { valor: 'cashback_percentual', rotulo: 'Cashback em % do que comprou' },
  { valor: 'bonificacao', rotulo: 'Bonificação (produto)' },
];

export interface Beneficio {
  beneficio_tipo: string;
  beneficio_valor: number | null;
  bonificacao_produto_codigo: string | null;
  bonificacao_quantidade: number | null;
}

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

/** "R$ 100,00 de cashback", "5% de cashback sobre o que comprou", "2 un. de TOM (bonificação)". */
export function descreverBeneficio(b: Beneficio, nomeDoProduto?: (codigo: string) => string | undefined): string {
  if (b.beneficio_tipo === 'cashback_valor') return `${formatBRL(b.beneficio_valor ?? 0)} de cashback`;
  if (b.beneficio_tipo === 'cashback_percentual') return `${fmtQtd(b.beneficio_valor ?? 0)}% de cashback sobre o que comprou`;
  const codigo = b.bonificacao_produto_codigo ?? '';
  const produto = nomeDoProduto?.(codigo) ?? codigo;
  return `${fmtQtd(b.bonificacao_quantidade ?? 0)} un. de ${produto} (bonificação)`;
}

export interface LinhaDaApuracao extends Beneficio {
  diretriz_id: string;
  diretriz: string;
  cliente_codigo: string;
  cliente_nome: string;
  tabela_base: string | null;
  /** O mês apurado, `aaaa-mm-01`. */
  competencia: string;
  quantidade: number;
  minimo: number;
  falta: number;
  atingiu: boolean;
  perto: boolean;
  valor_comprado: number;
  valor_beneficio: number | null;
  condicao: string | null;
  concessao_id: string | null;
  concedido: boolean;
  concedido_em: string | null;
  concedido_por_nome: string | null;
  pedido: string | null;
  observacao: string | null;
}

export interface ApuracaoSeparada {
  aConceder: LinhaDaApuracao[];
  perto: LinhaDaApuracao[];
  concedidos: LinhaDaApuracao[];
  /** R$ do que está a conceder — só os cashbacks; bonificação não tem valor em R$. */
  valorAConceder: number;
  valorConcedido: number;
}

/**
 * As três listas da tela. Concedido sai de "a conceder" mesmo que uma devolução importada depois
 * tenha baixado a quantidade: o que foi dado foi dado, e aparece onde está a história.
 */
export function separarApuracao(linhas: LinhaDaApuracao[]): ApuracaoSeparada {
  const aConceder = linhas.filter((l) => l.atingiu && !l.concedido);
  const perto = linhas.filter((l) => l.perto && !l.concedido);
  const concedidos = linhas.filter((l) => l.concedido);
  const soma = (ls: LinhaDaApuracao[]) => ls.reduce((s, l) => s + (l.valor_beneficio ?? 0), 0);
  return { aConceder, perto, concedidos, valorAConceder: soma(aConceder), valorConcedido: soma(concedidos) };
}

/** `aaaa-mm` do `<input type="month">` ↔ `aaaa-mm-01` do banco (a vigência é de meses inteiros). */
export const mesParaData = (mes: string): string | null => (/^\d{4}-\d{2}$/.test(mes) ? `${mes}-01` : null);
export const dataParaMes = (data: string | null | undefined): string => (data ? data.slice(0, 7) : '');

export interface FormularioDeDiretriz {
  nome: string;
  medir: 'familia' | 'produto';
  familia_id: string;
  produto_codigo: string;
  quantidade_minima: string;
  beneficio_tipo: TipoDeBeneficio;
  beneficio_valor: string;
  bonificacao_produto_codigo: string;
  bonificacao_quantidade: string;
  vigencia_inicio: string;
  vigencia_fim: string;
}

const numero = (s: string) => Number(s.replace(',', '.'));

/** Por que o formulário não serve — ou `null`. As mesmas regras dos CHECK da tabela, em português. */
export function erroDaDiretriz(f: FormularioDeDiretriz): string | null {
  if (!f.nome.trim()) return 'Dê um nome à diretriz.';
  if (f.medir === 'familia' && !f.familia_id) return 'Escolha a família.';
  if (f.medir === 'produto' && !f.produto_codigo.trim()) return 'Escolha o produto.';
  if (!(numero(f.quantidade_minima) > 0)) return 'A quantidade mínima tem de ser maior que zero.';
  if (f.beneficio_tipo === 'bonificacao') {
    if (!f.bonificacao_produto_codigo.trim()) return 'Escolha o produto da bonificação.';
    if (!(numero(f.bonificacao_quantidade) > 0)) return 'A quantidade da bonificação tem de ser maior que zero.';
  } else {
    const v = numero(f.beneficio_valor);
    if (!(v > 0)) return 'O valor do benefício tem de ser maior que zero.';
    if (f.beneficio_tipo === 'cashback_percentual' && v > 100) return 'O percentual vai até 100%.';
  }
  if (!mesParaData(f.vigencia_inicio)) return 'Escolha o mês de início da vigência.';
  if (f.vigencia_fim && f.vigencia_fim < f.vigencia_inicio) return 'O fim da vigência não pode ser antes do início.';
  return null;
}

/** O formulário como linha de `com_diretrizes` — só os campos do tipo escolhido, os outros nulos. */
export function linhaDaDiretriz(f: FormularioDeDiretriz) {
  const bonificacao = f.beneficio_tipo === 'bonificacao';
  return {
    nome: f.nome.trim(),
    familia_id: f.medir === 'familia' ? f.familia_id : null,
    produto_codigo: f.medir === 'produto' ? f.produto_codigo.trim() : null,
    quantidade_minima: numero(f.quantidade_minima),
    beneficio_tipo: f.beneficio_tipo,
    beneficio_valor: bonificacao ? null : numero(f.beneficio_valor),
    bonificacao_produto_codigo: bonificacao ? f.bonificacao_produto_codigo.trim() : null,
    bonificacao_quantidade: bonificacao ? numero(f.bonificacao_quantidade) : null,
    vigencia_inicio: mesParaData(f.vigencia_inicio)!,
    vigencia_fim: f.vigencia_fim ? mesParaData(f.vigencia_fim) : null,
  };
}
