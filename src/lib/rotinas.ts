// Rotinas do dia (dono, 2026-10-30; docs/proposta-rotinas.md): as regras puras que a tela usa.

export type Periodo = 'manha' | 'tarde' | 'fim_do_dia';
export type Repeticao = 'dias_uteis' | 'dias_da_semana' | 'mensal' | 'ultimo_dia_util';
export type Pede = 'nada' | 'observacao' | 'anexo';

export const PERIODOS: Periodo[] = ['manha', 'tarde', 'fim_do_dia'];
export const ROTULO_DO_PERIODO: Record<Periodo, string> = { manha: 'Manhã', tarde: 'Tarde', fim_do_dia: 'Fim do dia' };
export const ROTULO_DA_REPETICAO: Record<Repeticao, string> = {
  dias_uteis: 'Todo dia útil',
  dias_da_semana: 'Dias da semana',
  mensal: 'Uma vez por mês',
  ultimo_dia_util: 'Último dia útil do mês',
};
export const ROTULO_DO_PEDE: Record<Pede, string> = { nada: 'Nada', observacao: 'Uma observação', anexo: 'Uma foto ou arquivo' };
/** 1 = segunda … 5 = sexta, como o banco guarda (`extract(isodow …)`). */
export const DIAS_UTEIS: { n: number; curto: string }[] = [
  { n: 1, curto: 'Seg' }, { n: 2, curto: 'Ter' }, { n: 3, curto: 'Qua' }, { n: 4, curto: 'Qui' }, { n: 5, curto: 'Sex' },
];

/**
 * Em que período a pessoa está agora (`agora` em "HH:MM"). A manhã vai até o almoço dela (RH), a tarde até uma hora
 * antes do fim do expediente do setor, e o fim do dia é essa última hora. Sem horário cadastrado: almoço às 12h e
 * expediente até as 18h.
 */
export function periodoAgora(agora: string, horarios?: { inicio_almoco?: string | null; fim_expediente?: string | null } | null): Periodo {
  const almoco = (horarios?.inicio_almoco ?? '12:00').slice(0, 5);
  const [h, m] = (horarios?.fim_expediente ?? '18:00').slice(0, 5).split(':').map(Number);
  const ultimaHora = `${String(Math.max(h - 1, 0)).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  if (agora < almoco) return 'manha';
  if (agora < ultimaHora) return 'tarde';
  return 'fim_do_dia';
}

/** "Todo dia útil", "Seg, Qua e Sex", "Todo dia 10" ou "Último dia útil do mês". */
export function descreverRepeticao(r: { repeticao: Repeticao; dias_da_semana?: number[] | null; dia_do_mes?: number | null }): string {
  if (r.repeticao === 'dias_da_semana') {
    const nomes = DIAS_UTEIS.filter((d) => r.dias_da_semana?.includes(d.n)).map((d) => d.curto);
    return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}` : nomes[0] ?? '';
  }
  if (r.repeticao === 'mensal') return `Todo dia ${r.dia_do_mes}`;
  return ROTULO_DA_REPETICAO[r.repeticao];
}
