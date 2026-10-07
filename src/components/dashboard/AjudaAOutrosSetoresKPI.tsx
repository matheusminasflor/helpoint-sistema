// O cartão "Ajuda a outros setores" dos Indicadores de cada setor (dono, 2026-10-07): quantos
// chamados de OUTROS setores gente deste setor atendeu no período; ao passar o mouse, quais e de
// que setor. Não pesa no prazo de ninguém.
import { CalendarClock, Clock, HandHelping } from 'lucide-react';
import { KPICard } from '@/components/glpi/KPICard';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import type { TicketMetrics } from '@/hooks/useHelpdeskMetrics';
import { ListaDeChamadosNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';
import { useAjudaAOutrosSetores, ajudaNoHover } from '@/hooks/useAjudaAOutrosSetores';
import type { MetricsFilter } from '@/hooks/useHelpdeskMetrics';

export function AjudaAOutrosSetoresKPI({ modulo, filter }: { modulo: string; filter: MetricsFilter }) {
  const { data: ajuda = [] } = useAjudaAOutrosSetores(modulo, filter);
  return (
    <ListaDeChamadosNoHover
      titulo="Ajuda a outros setores"
      subtitulo={`${ajuda.length} ${ajuda.length === 1 ? 'chamado' : 'chamados'} de outros setores atendidos por gente daqui — não pesam no prazo`}
      chamados={ajudaNoHover(ajuda)}
      vazio="Ninguém deste setor atendeu chamado de outro setor no período."
      side="bottom"
    >
      <div>
        <KPICard value={ajuda.length} label="Ajuda a outros setores" icon={HandHelping} color="purple" />
      </div>
    </ListaDeChamadosNoHover>
  );
}

/** A linha "Agendados · Tempo agendado · Ajuda a outros setores" dos Indicadores (2026-10-07). */
export function LinhaAgendaEAjuda({ metrics, modulo, filter }: { metrics: TicketMetrics | null | undefined; modulo: string; filter: MetricsFilter }) {
  return (
    <KPIGrid lgCols={3}>
      <KPICard value={metrics?.agendados ?? 0} label="Agendados" icon={CalendarClock} color="purple" explicacao="chamados.agendados" />
      <KPICard value={`${metrics?.horasAgendadas ?? 0}h`} label="Tempo agendado" icon={Clock} color="grey" explicacao="chamados.horas_agendadas" />
      <AjudaAOutrosSetoresKPI modulo={modulo} filter={filter} />
    </KPIGrid>
  );
}
