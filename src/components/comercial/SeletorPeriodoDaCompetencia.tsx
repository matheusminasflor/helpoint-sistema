// O seletor das telas que eram só por competência: "Um mês" (o `SeletorCompetencia` de sempre)
// ou um período — "Este mês", "Este trimestre", "Este ano", "Personalizado" (pedido do dono,
// 2026-10-03). O estado vem de `usePeriodoDaCompetencia`; desde a R6 a peça é a mesma das telas de análise
// (`SeletorDePeriodo`), com os mesmos tratadores de antes.
import { SeletorDePeriodo } from '@/components/comercial/SeletorDePeriodo';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { UM_MES, type PeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { OPCOES_DE_CALENDARIO, mesesInteirosDoIntervalo } from '@/lib/period';

const OPCOES = [{ value: UM_MES, label: 'Um mês' }, ...OPCOES_DE_CALENDARIO];

export function SeletorPeriodoDaCompetencia({
  competencia, setCompetencia, periodo, intervalo, escolher, definirIntervalo, ateOMesAtual,
}: PeriodoDaCompetencia & { ateOMesAtual?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* O "Personalizado" abre no mês que a tela mostrava, do dia 1 ao último. */}
      <SeletorDePeriodo opcoes={OPCOES} periodo={periodo} valorDeUmMes={UM_MES} mostrarIntervalo
        onPeriodo={(v) => escolher(v, intervalo ?? mesesInteirosDoIntervalo({ de: competencia, ate: competencia }))}
        umMes={<SeletorCompetencia competencia={competencia} onChange={setCompetencia} ateOMesAtual={ateOMesAtual} />}
        intervalo={intervalo} onIntervalo={definirIntervalo} />
    </div>
  );
}
