import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { daysFromTodayISO, todayISO } from '@/lib/dates';
import {
  PERSONALIZADO, ehPeriodoRapido, erroDoIntervalo, intervaloDoPeriodoRapido,
  type IntervaloDeDias, type PeriodoRapido,
} from '@/lib/period';

/**
 * O período de uma tela de indicadores, na URL (`?periodo=`, e `&de=&ate=`
 * quando é personalizado) — o link copiado abre no mesmo recorte.
 *
 * Um hook, e não três `useQueryState`: o `setSearchParams` do react-router 6
 * aplica a função sobre os parâmetros DO RENDER, então duas chamadas seguidas
 * se atropelam e a segunda apaga a primeira. Período e datas mudam juntos aqui.
 *
 * `intervalo` é o recorte em dias quando o período é um dos rápidos ou o
 * personalizado; `null` nos presets próprios de cada tela, que continuam com a
 * conta de antes. Personalizado com datas quebradas na URL cai no padrão.
 */
export function usePeriodoNaUrl<P extends string>(padrao: P) {
  const [params, setParams] = useSearchParams();
  const bruto = params.get('periodo') || padrao;
  const de = params.get('de');
  const ate = params.get('ate');
  const personalizadoValido = bruto === PERSONALIZADO && !erroDoIntervalo(de, ate);
  const periodo = (bruto === PERSONALIZADO && !personalizadoValido ? padrao : bruto) as P | PeriodoRapido | typeof PERSONALIZADO;

  const intervalo: IntervaloDeDias | null = personalizadoValido
    ? { de: de!, ate: ate! }
    : ehPeriodoRapido(periodo) ? intervaloDoPeriodoRapido(periodo) : null;

  /**
   * Troca o período. Ao abrir o personalizado, as datas começam em `inicial`
   * (o recorte que a tela mostrava) ou, sem ele, nos últimos 30 dias.
   */
  const escolher = useCallback((novo: string, inicial?: IntervaloDeDias | null) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.delete('de');
      p.delete('ate');
      if (novo === padrao) p.delete('periodo');
      else p.set('periodo', novo);
      if (novo === PERSONALIZADO) {
        const comeco = inicial ?? { de: daysFromTodayISO(-30), ate: todayISO() };
        p.set('de', comeco.de);
        p.set('ate', comeco.ate);
      }
      return p;
    }, { replace: true });
  }, [padrao, setParams]);

  /** Grava um intervalo personalizado (já validado por `<PeriodoPersonalizado>`). */
  const definirIntervalo = useCallback((novo: IntervaloDeDias) => {
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('periodo', PERSONALIZADO);
      p.set('de', novo.de);
      p.set('ate', novo.ate);
      return p;
    }, { replace: true });
  }, [setParams]);

  return { periodo, intervalo, escolher, definirIntervalo };
}
