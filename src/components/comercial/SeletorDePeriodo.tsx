// O seletor de período do Comercial e da Diretoria — UM só (rodada 2, R6; o dono, 2026-10-26: "se não impactar os
// dados, pode ser somente um seletor"). É só a peça da tela: a lista de períodos, o "Um mês" e o "Personalizado".
// Cada tela continua com o próprio estado e a própria conta (`usePeriodoDaCompetencia`, `usePeriodoComercial`) e
// recebe EXATAMENTE as mesmas datas de antes — por isso a troca não muda número nenhum. As opções que uma tela não sabe
// responder (o "Últimos 6 meses" nos Indicadores) ela simplesmente não passa.
import type { ReactNode } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodoPersonalizado } from '@/components/ui/PeriodoPersonalizado';
import { PERSONALIZADO, rotuloDoIntervalo, type IntervaloDeDias } from '@/lib/period';

export interface OpcaoDePeriodo { value: string; label: string }

export function SeletorDePeriodo<P extends string>({ opcoes, periodo, onPeriodo, umMes, valorDeUmMes, intervalo, onIntervalo, mostrarIntervalo }: {
  opcoes: OpcaoDePeriodo[];
  periodo: P;
  onPeriodo: (p: P) => void;
  /** O que aparece ao lado quando o período é "Um mês" (o mês e o ano). */
  umMes?: ReactNode;
  valorDeUmMes: string;
  intervalo?: IntervaloDeDias | null;
  onIntervalo?: (i: IntervaloDeDias) => void;
  /** Nos atalhos de calendário ("Este trimestre"), escreve o período exibido. */
  mostrarIntervalo?: boolean;
}) {
  return (
    <>
      <Select value={periodo} onValueChange={(v) => onPeriodo(v as P)}>
        <SelectTrigger className="h-9 w-44" aria-label="Período"><SelectValue /></SelectTrigger>
        <SelectContent>
          {opcoes.filter((o) => o.value !== PERSONALIZADO || onIntervalo).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {periodo === valorDeUmMes ? umMes
        : periodo === PERSONALIZADO && intervalo && onIntervalo ? <PeriodoPersonalizado de={intervalo.de} ate={intervalo.ate} onChange={onIntervalo} />
        : mostrarIntervalo && intervalo ? (
          <span className="text-[13px] text-muted-foreground">
            Período exibido: <strong className="text-foreground">{rotuloDoIntervalo(intervalo)}</strong>
          </span>
        ) : null}
    </>
  );
}
