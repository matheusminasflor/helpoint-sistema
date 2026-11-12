// O seletor das telas que eram só por competência: "Mês" (o `SeletorCompetencia` de sempre) ou um período da lista
// padrão do Comercial (`PERIODOS_DO_COMERCIAL`, dono, 2026-11-12). O estado vem de `usePeriodoDaCompetencia`; a peça é a
// mesma das telas de análise (`SeletorDePeriodo`).
import { SeletorDePeriodo } from '@/components/comercial/SeletorDePeriodo';
import { SeletorCompetencia } from '@/components/comercial/SeletorCompetencia';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UM_MES, type PeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { competenciaAtual } from '@/lib/competencia-comercial';
import { PERIODOS_DO_COMERCIAL, mesesInteirosDoIntervalo } from '@/lib/period';

/** As vendas importadas começam em 2022 (importação do go-live). */
const PRIMEIRO_ANO = 2022;

export function SeletorPeriodoDaCompetencia({
  competencia, setCompetencia, periodo, intervalo, escolher, definirIntervalo, ateOMesAtual,
}: PeriodoDaCompetencia & { ateOMesAtual?: boolean }) {
  const atual = competenciaAtual();
  const anoAtual = Number(atual.slice(0, 4));
  const anos = Array.from({ length: anoAtual - PRIMEIRO_ANO + 1 }, (_, i) => anoAtual - i);
  // Trocar o ano leva a competência junto (mesmo mês, no ano escolhido); a Carteira não passa do mês atual.
  const trocarAno = (ano: string) => {
    const nova = `${ano}-${competencia.slice(5, 7)}-01`;
    setCompetencia(ateOMesAtual && nova > atual ? atual : nova);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* O "Personalizado" abre no mês que a tela mostrava, do dia 1 ao último. */}
      <SeletorDePeriodo opcoes={PERIODOS_DO_COMERCIAL} periodo={periodo} valorDeUmMes={UM_MES} mostrarIntervalo
        onPeriodo={(v) => escolher(v, intervalo ?? mesesInteirosDoIntervalo({ de: competencia, ate: competencia }))}
        umMes={<SeletorCompetencia competencia={competencia} onChange={setCompetencia} ateOMesAtual={ateOMesAtual} />}
        umAno={(
          <Select value={competencia.slice(0, 4)} onValueChange={trocarAno}>
            <SelectTrigger className="h-9 w-28" aria-label="Ano"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        intervalo={intervalo} onIntervalo={definirIntervalo} />
    </div>
  );
}
