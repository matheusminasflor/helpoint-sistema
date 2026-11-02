// Horas para gente ler (revisão dos Indicadores da TI, 2026-11-01): a tela mostrava "73.2h" e "246.8h", no formato
// americano e sem noção de dias. Até um dia: "22,7 h"; a partir de um dia: "3 d 1 h".
export function formatarHoras(horas: number | null | undefined): string {
  if (horas === null || horas === undefined || Number.isNaN(horas)) return '—';
  if (horas < 24) return `${horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
  const dias = Math.floor(horas / 24);
  const resto = Math.round(horas - dias * 24);
  return resto === 0 ? `${dias} d` : resto === 24 ? `${dias + 1} d` : `${dias} d ${resto} h`;
}
