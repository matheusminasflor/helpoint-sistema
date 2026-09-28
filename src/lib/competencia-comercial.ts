// A competência do Painel do Gestor — manual de Gestão Comercial §2.
//
// A planilha oferece duas formas: "Mês atual", para o dia a dia, e MM/AAAA, para fechamento
// e consulta. O sistema guarda sempre o PRIMEIRO DIA DO MÊS (`2026-09-01`), que é como o banco
// recorta competência (`com_vendas_itens.competencia`, `com_metas_indicador.competencia`).
//
// "Mês atual" sai de `todayISO()` — o dia do Brasil, nunca `toISOString()`, que à noite já é
// amanhã em UTC (regra 4 das cinco). No último dia do mês, depois das 21h, isso mudaria a
// competência inteira do painel.
import { todayISO } from '@/lib/dates';

const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

/** O primeiro dia do mês corrente, no dia do Brasil: `2026-09-01`. */
export function competenciaAtual(hoje: string = todayISO()): string {
  return `${hoje.slice(0, 7)}-01`;
}

/**
 * Lê o que a pessoa digitou: `09/2026`, `9/2026` ou `2026-09`. Devolve `null` para qualquer
 * outra coisa — inclusive mês 13 —, e a tela avisa em vez de adivinhar.
 */
export function lerCompetencia(texto: string): string | null {
  const t = texto.trim();
  let m = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (m) return montar(Number(m[2]), Number(m[1]));
  m = t.match(/^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/);
  if (m) return montar(Number(m[1]), Number(m[2]));
  return null;
}

function montar(ano: number, mes: number): string | null {
  if (mes < 1 || mes > 12 || ano < 2000 || ano > 2100) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-01`;
}

/** `2026-09-01` → `09/2026`, como a planilha escreve. */
export function competenciaCurta(competencia: string): string {
  return `${competencia.slice(5, 7)}/${competencia.slice(0, 4)}`;
}

/**
 * `2026-09-01` → `setembro de 2026`. É o "MÊS EXIBIDO" da planilha: o manual manda conferir
 * este texto antes de ler qualquer número, porque um lançamento fora do mês exibido não
 * aparece no recorte (§2, "Atenção").
 */
export function competenciaPorExtenso(competencia: string): string {
  const mes = Number(competencia.slice(5, 7));
  return `${MESES[mes - 1] ?? '?'} de ${competencia.slice(0, 4)}`;
}

/** O mês anterior ou o seguinte — para as setas do seletor. */
export function deslocarCompetencia(competencia: string, meses: number): string {
  const ano = Number(competencia.slice(0, 4));
  const mes = Number(competencia.slice(5, 7)) - 1 + meses;
  const a = ano + Math.floor(mes / 12);
  const m = ((mes % 12) + 12) % 12 + 1;
  return `${a}-${String(m).padStart(2, '0')}-01`;
}

/** Um lançamento de `data` cai na competência? É a pergunta do §12 ("resultado em outro mês"). */
export function dataNaCompetencia(data: string, competencia: string): boolean {
  return data.slice(0, 7) === competencia.slice(0, 7);
}
