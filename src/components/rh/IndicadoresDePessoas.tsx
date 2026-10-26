// Os indicadores de PESSOAS do RH (rodada 2, R4; `rh_indicadores`): quantas pessoas, entradas, saídas, faltas por tipo,
// custo da folha e férias vencendo. Seguem o período do topo da tela — menos as férias, que são a foto de hoje.
import { CalendarClock, LogIn, LogOut, UserX, Users, Wallet } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { useRHIndicadores } from '@/hooks/useRH';
import { TIPOS_DE_AUSENCIA } from '@/lib/rh-status';
import { fmtBRL } from '@/components/rh/shared';
import { fromLocalISODate } from '@/lib/dates';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

const rotuloDaAusencia = (k: string) => TIPOS_DE_AUSENCIA.find((t) => t.value === k)?.label ?? k;
const numero = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function IndicadoresDePessoas({ de, ate }: { de: string; ate: string }) {
  const { data, isLoading, isError } = useRHIndicadores(de, ate);
  if (isError) return <p className="text-[13px] text-status-danger">Não consegui carregar os indicadores de pessoas.</p>;
  if (isLoading || !data) {
    return <KPIGrid lgCols={4}>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</KPIGrid>;
  }
  const faltas = Object.entries(data.faltas).sort((a, b) => b[1].vezes - a[1].vezes);
  const totalFaltas = faltas.reduce((s, [, v]) => s + v.vezes, 0);

  return (
    <div className="space-y-4">
      <KPIGrid lgCols={4}>
        <KPICard value={data.pessoas} label="Pessoas" icon={Users} color="blue" explicacao="rh.pessoas" />
        <KPICard value={data.entradas} label="Entradas" icon={LogIn} color="green" explicacao="rh.entradas" />
        <KPICard value={data.saidas} label="Saídas" icon={LogOut} color="red" explicacao="rh.saidas" />
        <KPICard value={fmtBRL(data.folha.bruto)} label="Custo da folha (bruto)" icon={Wallet} color="purple" explicacao="rh.custo_da_folha" />
      </KPIGrid>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
            <UserX className="w-4 h-4 text-muted-foreground" aria-hidden="true" />Faltas, atestados e atrasos
            <ExplicacaoDoIndicador id="rh.faltas_no_periodo" />
          </h3>
          <p className="text-xs text-muted-foreground mb-3">
            {totalFaltas} registro(s) no período · folha líquida {fmtBRL(data.folha.liquido)}
            {data.folha.meses > 0 && ` em ${data.folha.meses} mês(es)`}
          </p>
          {faltas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma ausência registrada no período.</p>
          ) : (
            <ul className="divide-y divide-border">
              {faltas.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between py-2 text-[14px]">
                  <span>{rotuloDaAusencia(k)}</span>
                  <span className="tabular-nums text-muted-foreground">{v.vezes} vez(es) · {numero(Number(v.dias))} dia(s)</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />Férias vencendo
            <ExplicacaoDoIndicador id="rh.ferias_vencendo" />
          </h3>
          <p className="text-xs text-muted-foreground mb-3">Hoje: quem precisa tirar férias nos próximos 60 dias, e quem já passou do prazo.</p>
          {data.ferias.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Ninguém com férias vencendo.</p>
          ) : (
            <ul className="divide-y divide-border">
              {data.ferias.map((f) => (
                <li key={`${f.colaborador_id}-${f.situacao}`} className="flex items-center justify-between gap-3 py-2 text-[14px]">
                  <span className="min-w-0 truncate">{f.nome ?? '—'}</span>
                  <span className={cn('shrink-0 tabular-nums', f.situacao === 'vencida' ? 'text-status-danger font-semibold' : 'text-muted-foreground')}>
                    {f.situacao === 'vencida' ? 'venceu em ' : 'vence em '}{format(fromLocalISODate(f.vence_em), 'dd/MM/yyyy')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
