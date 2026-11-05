import { Lightbulb, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ListaDeChamadosNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { pontosDeMelhoria } from '@/lib/pontos-de-melhoria';

const SELO = { perigo: 'badge-danger', aviso: 'badge-warning', info: 'badge-info' } as const;

/** O que o período mostra, calculado pelo sistema. Só o botão usa IA, e só no clique. */
export function PontosDeMelhoria({ chamados, totalAnterior, onVerSugestoes }: {
  chamados: ChamadoDoPeriodo[]; totalAnterior: number | null; onVerSugestoes?: () => void;
}) {
  const pontos = pontosDeMelhoria({ chamados, totalAnterior });
  if (!pontos.length && !onVerSugestoes) return null;
  return (
    <Card className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-primary" aria-hidden="true" />Pontos de melhoria
        </h3>
        {onVerSugestoes && (
          <Button size="sm" className="gap-1.5" onClick={onVerSugestoes}>
            <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />Ver sugestões da IA
          </Button>
        )}
      </div>
      {pontos.length ? (
        <ul className="divide-y divide-border">
          {pontos.map((p) => (
            <li key={p.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-semibold text-foreground">{p.titulo}</span>
                <span className={`rounded-full px-2 py-0.5 text-[12px] font-semibold ${SELO[p.cor]}`}>{p.selo}</span>
              </div>
              <p className="text-[14px] text-foreground">
                {p.texto}{' '}
                <ListaDeChamadosNoHover titulo={p.titulo} chamados={p.chamados} modulo="tickets">
                  <button type="button" className="text-primary font-medium underline underline-offset-2">Ver chamados</button>
                </ListaDeChamadosNoHover>
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">Nada se destacou neste período.</p>
      )}
    </Card>
  );
}
