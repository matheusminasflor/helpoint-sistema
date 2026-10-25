// O período dos relatórios da etapa 5 (o modelo em components/relatorios/ModeloDeRelatorio.tsx): no endereço, e o
// anterior para a comparação de cada número. O que olha para trás (venda, gasto, compras) corta o período em hoje e
// compara até o mesmo ponto do anterior; o que olha para a frente (o calendário de ausências) fica com o período inteiro.
import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { ateHojeComOAnterior, intervaloDoPeriodo, periodoAnterior, type Intervalo, type TipoDePeriodo } from '@/lib/periodo-do-relatorio';
import { todayISO } from '@/lib/dates';

export function usePeriodoDoRelatorio(padrao: TipoDePeriodo = 'mes', { olhaParaFrente = false } = {}) {
  const [tipo, setTipo] = useQueryState<TipoDePeriodo>('periodo', padrao);
  const [personalizado, setPersonalizado] = useState<Partial<Intervalo>>({});
  const inteiro = intervaloDoPeriodo(tipo, todayISO(), personalizado);
  const { atual, anterior } = olhaParaFrente
    ? { atual: inteiro, anterior: periodoAnterior(tipo, inteiro) }
    : ateHojeComOAnterior(tipo, inteiro, todayISO());
  return { tipo, setTipo, personalizado, setPersonalizado, atual, anterior };
}
export type PeriodoDoRelatorio = ReturnType<typeof usePeriodoDoRelatorio>;
