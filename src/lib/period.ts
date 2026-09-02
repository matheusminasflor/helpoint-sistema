export type Period = '7d' | '30d' | '90d' | '12m' | 'all';

export const PERIODS: { value: Period; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: 'all', label: 'Todo o período' },
];

export function periodStart(p: Period): Date | null {
  const d = new Date();
  if (p === '7d') { d.setDate(d.getDate() - 7); return d; }
  if (p === '30d') { d.setDate(d.getDate() - 30); return d; }
  if (p === '90d') { d.setDate(d.getDate() - 90); return d; }
  if (p === '12m') { d.setMonth(d.getMonth() - 12); return d; }
  return null;
}
