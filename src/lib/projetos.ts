import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/**
 * Um dia puro (`2026-09-30`) escrito para gente ler: "30 de set".
 *
 * `new Date('2026-09-30')` seria meia-noite **em UTC** e, no Brasil, viraria o
 * dia 29 — a regra 4 das cinco, do lado da leitura. Por isso o dia é montado
 * peça por peça, no fuso de quem está olhando.
 */
export function diaCurto(iso: string): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  return format(new Date(ano, mes - 1, dia), "d 'de' MMM", { locale: ptBR });
}
