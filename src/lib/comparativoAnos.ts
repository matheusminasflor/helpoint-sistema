// Comparativo entre anos do painel do Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: "comparativo
// entre anos, mesmo mês lado a lado, com variação calculada só sobre os
// meses fechados" — senão setembro pela metade contra um setembro inteiro
// do ano anterior vira uma "queda" de ~50% que não existe.
import { todayISO } from '@/lib/dates';
import type { MetaXRealizado } from '@/types/comercial';

/** Rótulo dos 12 meses — copiado em quatro telas de `src/pages/diretoria/` antes desta correção. */
export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Os anos que o seletor oferece, do mais recente ao mais antigo. A aba de
 * Metas inclui o ano SEGUINTE (o diretor define a meta do ano que vem antes
 * dele começar); as demais abas — que só leem realizado — não têm o que
 * mostrar num ano que ainda não aconteceu.
 */
export function anosDisponiveis(incluirProximoAno = false): number[] {
  const anoAtual = new Date().getFullYear();
  const primeiro = incluirProximoAno ? anoAtual + 1 : anoAtual;
  return Array.from({ length: 6 }, (_, i) => primeiro - i);
}

/** Soma o `realizado` de `com_metas_x_realizado` por mês (índice 0 = janeiro) — todas as carteiras + Sem carteira juntas. */
export function realizadoPorMes(linhas: MetaXRealizado[]): number[] {
  const somas = Array<number>(12).fill(0);
  for (const l of linhas) somas[Number(l.competencia.slice(5, 7)) - 1] += l.realizado;
  return somas;
}

/**
 * Um mês é FECHADO quando não é o mês em curso do ano corrente — anos
 * inteiramente passados têm os 12 fechados; o ano corrente, só até o mês
 * anterior ao de hoje; um ano futuro não tem nenhum.
 */
export function mesesFechados(ano: number, hojeISO: string = todayISO()): boolean[] {
  const anoDeHoje = Number(hojeISO.slice(0, 4));
  const mesDeHoje = Number(hojeISO.slice(5, 7));
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    if (ano < anoDeHoje) return true;
    if (ano > anoDeHoje) return false;
    return mes < mesDeHoje;
  });
}

/**
 * Variação percentual entre dois anos, somando só os meses fechados dos
 * dois lados. `null` quando não há mês fechado ainda, ou quando a soma do
 * ano anterior nesses meses é zero (variação sem base não se calcula).
 */
export function variacaoSobreMesesFechados(
  realizadoAtual: number[],
  realizadoAnterior: number[],
  fechados: boolean[],
): number | null {
  let somaAtual = 0;
  let somaAnterior = 0;
  for (let mes = 0; mes < 12; mes++) {
    if (!fechados[mes]) continue;
    somaAtual += realizadoAtual[mes] ?? 0;
    somaAnterior += realizadoAnterior[mes] ?? 0;
  }
  if (somaAnterior === 0) return null;
  return (somaAtual - somaAnterior) / somaAnterior;
}
