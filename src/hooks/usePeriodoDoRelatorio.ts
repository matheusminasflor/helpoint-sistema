// O período dos relatórios da etapa 5 (o modelo em components/relatorios/ModeloDeRelatorio.tsx): no endereço, e o
// anterior para a comparação de cada número.
import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { intervaloDoPeriodo, periodoAnterior, type Intervalo, type TipoDePeriodo } from '@/lib/periodo-do-relatorio';
import { todayISO } from '@/lib/dates';

/** O período da tela, no endereço, e o anterior para a comparação. */
export function usePeriodoDoRelatorio(padrao: TipoDePeriodo = 'mes') {
  const [tipo, setTipo] = useQueryState<TipoDePeriodo>('periodo', padrao);
  const [personalizado, setPersonalizado] = useState<Partial<Intervalo>>({});
  const atual = intervaloDoPeriodo(tipo, todayISO(), personalizado);
  return { tipo, setTipo, personalizado, setPersonalizado, atual, anterior: periodoAnterior(tipo, atual) };
}
export type PeriodoDoRelatorio = ReturnType<typeof usePeriodoDoRelatorio>;
