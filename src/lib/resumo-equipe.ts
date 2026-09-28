// A linha TOTAL EQUIPE do resumo da carteira (manual de Gestão Comercial §7).
//
// Parece uma soma de colunas e não é, por dois motivos — os dois custariam número errado sem
// nada acusar:
//
// 1. A CARTEIRA NÃO SE SOMA POR PESSOA. Uma carteira pode ter mais de uma pessoa, e cada uma
//    recebe a linha com o total da carteira dela. Somar as linhas contaria a mesma carteira
//    duas vezes. Os números de carteira (total, ativos, inativos) somam-se uma vez por
//    carteira; os de trabalho (relacionados, compradores, vendas) somam-se por pessoa.
//
// 2. TICKET NÃO SE SOMA — RECALCULA. Somar o ticket de duas vendedoras dá um número sem
//    significado. O ticket da equipe é vendas da equipe ÷ compradores da equipe, pela mesma
//    fórmula do manual (§7.1).
//
// Compradores somados por pessoa podem contar duas vezes o cliente que comprou das duas. É
// raro (lançar para cliente de outra carteira exige o escape) e a planilha soma igual; fica
// registrado aqui como o teto conhecido desta conta.
import type { ResumoCarteira } from '@/hooks/useComercialLancamentos';

export interface TotalEquipe {
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

const dividir = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) / 100 : null);

export function totalDaEquipe(linhas: ResumoCarteira[]): TotalEquipe {
  // Uma vez por carteira — a primeira linha de cada uma carrega o total dela.
  const porCarteira = new Map<string, ResumoCarteira>();
  for (const l of linhas) {
    if (l.carteira && !porCarteira.has(l.carteira)) porCarteira.set(l.carteira, l);
  }
  const carteiras = [...porCarteira.values()];
  const somaCarteira = (k: 'total_carteira' | 'ativos' | 'inativos' | 'nunca_compraram') =>
    carteiras.reduce((s, l) => s + l[k], 0);
  const somaPessoa = (k: keyof Pick<ResumoCarteira,
    'relacionados' | 'compradores' | 'relacionados_sem_compra' | 'valor_vendido' |
    'compradores_ativos' | 'vendas_ativos' | 'compradores_inativos' | 'vendas_inativos'>) =>
    linhas.reduce((s, l) => s + l[k], 0);

  const ativos = somaCarteira('ativos');
  const vendasAtivos = somaPessoa('vendas_ativos');
  const vendasInativos = somaPessoa('vendas_inativos');
  const compradoresAtivos = somaPessoa('compradores_ativos');
  const compradoresInativos = somaPessoa('compradores_inativos');

  return {
    total_carteira: somaCarteira('total_carteira'),
    ativos,
    inativos: somaCarteira('inativos'),
    nunca_compraram: somaCarteira('nunca_compraram'),
    relacionados: somaPessoa('relacionados'),
    compradores: somaPessoa('compradores'),
    relacionados_sem_compra: somaPessoa('relacionados_sem_compra'),
    valor_vendido: somaPessoa('valor_vendido'),
    compradores_ativos: compradoresAtivos,
    vendas_ativos: vendasAtivos,
    ticket_ativos: dividir(vendasAtivos, compradoresAtivos),
    compradores_inativos: compradoresInativos,
    vendas_inativos: vendasInativos,
    ticket_inativos: dividir(vendasInativos, compradoresInativos),
    media_base_ativa: dividir(vendasAtivos, ativos),
  };
}
