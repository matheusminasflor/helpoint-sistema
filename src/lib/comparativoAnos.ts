// Comparativo entre anos do painel do Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: "comparativo
// entre anos, mesmo mês lado a lado, com variação calculada só sobre os
// meses fechados" — senão setembro pela metade contra um setembro inteiro
// do ano anterior vira uma "queda" de ~50% que não existe.
import { todayISO } from '@/lib/dates';
import type { MetaAno } from '@/types/comercial';

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

/**
 * `total_realizado` de `metas_ano` por mês (índice 0 = janeiro) — leitura
 * direta, nunca soma de `com_metas_x_realizado` por carteira (esse cálculo
 * saiu na Frente 2: o total já vem somado do HISTORICO_METAS.json). `null`
 * é "sem dado" — nunca zero.
 */
export function realizadoPorMes(linhas: MetaAno[]): Array<number | null> {
  const porMes = Array<number | null>(12).fill(null);
  for (const l of linhas) porMes[l.mes - 1] = l.total_realizado;
  return porMes;
}

/**
 * Soma que sabe a diferença entre "não vendeu" e "sem dado": nula quando
 * NENHUM dos valores está presente, senão soma só os que estão. É a defesa
 * direta contra o bug que esta leva existe para corrigir ("Fechamento de
 * 2025: R$ 0,00" — um ano sem nenhum dado, somado com `?? 0`, virava zero
 * em vez de "sem dado").
 */
export function somaComAusencia(valores: Array<number | null>): number | null {
  const presentes = valores.filter((v): v is number => v != null);
  if (presentes.length === 0) return null;
  return presentes.reduce((soma, v) => soma + v, 0);
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
  realizadoAtual: Array<number | null>,
  realizadoAnterior: Array<number | null>,
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
