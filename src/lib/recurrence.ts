// Pure helpers to materialize calendar recurrence rules into discrete dates.
// Strategy: bounded materialization. We never generate more than MAX_OCCURRENCES
// rows or extend more than MAX_HORIZON_DAYS into the future, even for "never" rules.

export type RecurrenceFreq =
  | 'none'
  | 'daily'
  | 'weekly'
  | 'biweekly'
  | 'monthly'
  | 'quarterly'
  | 'semiannually'
  | 'yearly'
  | 'custom';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';
export type RecurrenceEndType = 'never' | 'date' | 'count';

export interface RecurrenceRule {
  freq: RecurrenceFreq;
  /** Used for custom freq (e.g. "every 2 weeks"). For preset freqs we infer. */
  interval?: number;
  /** Used when freq=custom */
  unit?: RecurrenceUnit;
  /** 0 = Sunday … 6 = Saturday — used for weekly/biweekly multi-day */
  byweekday?: number[];
  endType: RecurrenceEndType;
  /** ISO date (YYYY-MM-DD) or full ISO string */
  endDate?: string | null;
  count?: number | null;
}

export const MAX_OCCURRENCES = 365;
export const MAX_HORIZON_DAYS = 730; // ~2 years

export const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  none: 'Não repetir',
  daily: 'Diariamente',
  weekly: 'Semanalmente',
  biweekly: 'Quinzenalmente',
  monthly: 'Mensalmente',
  quarterly: 'Trimestralmente',
  semiannually: 'Semestralmente',
  yearly: 'Anualmente',
  custom: 'Personalizado',
};

export const WEEKDAY_LABELS_PT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
export const WEEKDAY_FULL_PT = [
  'Domingo',
  'Segunda',
  'Terça',
  'Quarta',
  'Quinta',
  'Sexta',
  'Sábado',
];

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}
function addYears(d: Date, n: number): Date {
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + n);
  return r;
}

/**
 * Given a starting Date and a recurrence rule, returns the full list of
 * occurrence Dates (including the start date as the first one).
 *
 * Hard caps: at most MAX_OCCURRENCES dates and never more than
 * MAX_HORIZON_DAYS in the future. The seed date is always included.
 */
export function generateOccurrences(start: Date, rule: RecurrenceRule): Date[] {
  if (rule.freq === 'none') return [new Date(start)];

  const horizonEnd = addDays(start, MAX_HORIZON_DAYS);
  const userEnd =
    rule.endType === 'date' && rule.endDate ? new Date(rule.endDate) : null;
  if (userEnd && rule.endDate && rule.endDate.length === 10) {
    // pure date string — treat as end-of-day to be inclusive
    userEnd.setHours(23, 59, 59, 999);
  }
  const maxCount =
    rule.endType === 'count' && rule.count && rule.count > 0
      ? Math.min(rule.count, MAX_OCCURRENCES)
      : MAX_OCCURRENCES;

  const stopAt = userEnd && userEnd < horizonEnd ? userEnd : horizonEnd;

  const out: Date[] = [];
  const push = (d: Date): boolean => {
    if (d > stopAt) return false;
    out.push(new Date(d));
    return out.length < maxCount;
  };

  switch (rule.freq) {
    case 'daily': {
      let cur = new Date(start);
      while (push(cur)) cur = addDays(cur, 1);
      break;
    }
    case 'weekly':
    case 'biweekly': {
      const stepWeeks = rule.freq === 'biweekly' ? 2 : 1;
      // pick weekdays from rule, default to start's weekday
      const days =
        rule.byweekday && rule.byweekday.length > 0
          ? [...rule.byweekday].sort((a, b) => a - b)
          : [start.getDay()];
      // Anchor at the Sunday of the week containing `start`
      const weekAnchor = addDays(start, -start.getDay());
      let weekIdx = 0;
      outer: while (true) {
        const baseWeek = addDays(weekAnchor, weekIdx * 7 * stepWeeks);
        for (const dow of days) {
          const occ = new Date(baseWeek);
          occ.setDate(occ.getDate() + dow);
          occ.setHours(
            start.getHours(),
            start.getMinutes(),
            start.getSeconds(),
            start.getMilliseconds(),
          );
          if (occ < start) continue; // skip days earlier in the seed week
          if (!push(occ)) break outer;
        }
        weekIdx++;
        if (weekIdx > MAX_OCCURRENCES) break; // hard safety
      }
      break;
    }
    case 'monthly': {
      let i = 0;
      while (true) {
        const cur = addMonths(start, i);
        if (!push(cur)) break;
        i++;
      }
      break;
    }
    case 'quarterly': {
      let i = 0;
      while (true) {
        const cur = addMonths(start, i * 3);
        if (!push(cur)) break;
        i++;
      }
      break;
    }
    case 'semiannually': {
      let i = 0;
      while (true) {
        const cur = addMonths(start, i * 6);
        if (!push(cur)) break;
        i++;
      }
      break;
    }
    case 'yearly': {
      let i = 0;
      while (true) {
        const cur = addYears(start, i);
        if (!push(cur)) break;
        i++;
      }
      break;
    }
    case 'custom': {
      const interval = Math.max(1, rule.interval ?? 1);
      const unit = rule.unit ?? 'day';
      let i = 0;
      while (true) {
        let cur: Date;
        if (unit === 'day') cur = addDays(start, i * interval);
        else if (unit === 'week') cur = addDays(start, i * interval * 7);
        else if (unit === 'month') cur = addMonths(start, i * interval);
        else cur = addYears(start, i * interval);
        if (!push(cur)) break;
        i++;
      }
      break;
    }
  }

  // Ensure the seed date is always present
  if (out.length === 0) out.push(new Date(start));
  return out;
}

/** Compact human label of the rule for UI hints. */
export function describeRule(rule: RecurrenceRule): string {
  if (rule.freq === 'none') return 'Não repete';
  const base = FREQ_LABELS[rule.freq];
  const ending =
    rule.endType === 'never'
      ? 'sem término'
      : rule.endType === 'date'
        ? `até ${rule.endDate?.slice(0, 10) ?? ''}`
        : `por ${rule.count ?? 0}x`;
  if (rule.freq === 'custom') {
    const unitLabel =
      rule.unit === 'day'
        ? 'dia(s)'
        : rule.unit === 'week'
          ? 'semana(s)'
          : rule.unit === 'month'
            ? 'mês(es)'
            : 'ano(s)';
    return `A cada ${rule.interval ?? 1} ${unitLabel} — ${ending}`;
  }
  return `${base} — ${ending}`;
}
