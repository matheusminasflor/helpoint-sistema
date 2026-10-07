// O cashback agrupado por cliente para a tela (dono, 2026-10-07): o analítico é UM cliente por
// linha que abre nos meses dele, com filtros "Com direito a cashback" e "Situação"; o simplificado
// mostra só quem GEROU cashback no período. As contas vêm prontas do banco (`com_cashback_resumo` e
// `com_cashback_mensal`) — aqui só se junta, filtra e ordena.
import type { CashbackMensal, CashbackResumo, SituacaoCashback } from '@/types/comercial';

export type FiltroSituacao = 'todas' | SituacaoCashback;

export interface ClienteDoCashback {
  resumo: CashbackResumo;
  /** Os meses do cliente no recorte, do mais antigo ao mais novo. */
  meses: CashbackMensal[];
}

const gerou = (r: CashbackResumo) => (r.cashback ?? 0) > 0;

export function clientesDoCashback(
  resumo: CashbackResumo[],
  mensal: CashbackMensal[],
  filtro: { soComDireito: boolean; situacao: FiltroSituacao },
): ClienteDoCashback[] {
  const mesesPorCliente = new Map<string, CashbackMensal[]>();
  for (const m of mensal) {
    const lista = mesesPorCliente.get(m.cliente_codigo) ?? [];
    lista.push(m);
    mesesPorCliente.set(m.cliente_codigo, lista);
  }
  return resumo
    .filter((r) => !filtro.soComDireito || gerou(r))
    .map((r) => ({
      resumo: r,
      meses: (mesesPorCliente.get(r.cliente_codigo) ?? []).slice().sort((a, b) => a.competencia.localeCompare(b.competencia)),
    }))
    // Situação: o cliente entra se ALGUM mês dele tem aquela situação.
    .filter((c) => filtro.situacao === 'todas' || c.meses.some((m) => m.situacao === filtro.situacao))
    .sort((a, b) => (b.resumo.cashback ?? 0) - (a.resumo.cashback ?? 0) || a.resumo.nome.localeCompare(b.resumo.nome));
}

/**
 * Quantos meses do cliente estão em cada situação, na ordem liberado → aguardando → não liberado.
 * O selo da linha mostra isso (dono, 2026-10-07): com o filtro "Liberado" a linha mostrava só a
 * situação do último mês ("Aguardando"), e parecia que o filtro não funcionava.
 */
export function situacoesDoCliente(meses: CashbackMensal[]): Array<{ situacao: SituacaoCashback; quantos: number }> {
  const ordem: SituacaoCashback[] = ['liberado', 'aguardando', 'nao_liberado'];
  return ordem
    .map((situacao) => ({ situacao, quantos: meses.filter((m) => m.situacao === situacao).length }))
    .filter((s) => s.quantos > 0);
}

/** O simplificado: só quem gerou cashback no período, do maior para o menor. */
export function geraramCashback(resumo: CashbackResumo[]): CashbackResumo[] {
  return resumo.filter(gerou).sort((a, b) => (b.cashback ?? 0) - (a.cashback ?? 0));
}
