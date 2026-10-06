// O seletor das telas que eram só por competência: "Um mês" (o `SeletorCompetencia` de sempre)
// ou um período — "Este mês", "Este trimestre", "Este ano", "Personalizado" (pedido do dono,
// 2026-10-03). O estado vem de `usePeriodoDaCompetencia`; aqui é só a tela.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PeriodoPersonalizado } from '@/components/ui/PeriodoPersonalizado';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { UM_MES, type PeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { OPCOES_DE_CALENDARIO, PERSONALIZADO, mesesInteirosDoIntervalo, rotuloDoIntervalo } from '@/lib/period';

const OPCOES = [{ value: UM_MES, label: 'Um mês' }, ...OPCOES_DE_CALENDARIO];

export function SeletorPeriodoDaCompetencia({
  competencia, setCompetencia, periodo, intervalo, escolher, definirIntervalo,
}: PeriodoDaCompetencia) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* O "Personalizado" abre no mês que a tela mostrava, do dia 1 ao último. */}
      <Select value={periodo} onValueChange={(v) => escolher(v, intervalo ?? mesesInteirosDoIntervalo({ de: competencia, ate: competencia }))}>
        <SelectTrigger className="h-9 w-40" aria-label="Período"><SelectValue /></SelectTrigger>
        <SelectContent>
          {OPCOES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {periodo === UM_MES ? (
        <SeletorCompetencia competencia={competencia} onChange={setCompetencia} />
      ) : periodo === PERSONALIZADO && intervalo ? (
        <PeriodoPersonalizado de={intervalo.de} ate={intervalo.ate} onChange={definirIntervalo} />
      ) : intervalo ? (
        <span className="text-[13px] text-muted-foreground">
          Período exibido: <strong className="text-foreground">{rotuloDoIntervalo(intervalo)}</strong>
        </span>
      ) : null}
    </div>
  );
}
