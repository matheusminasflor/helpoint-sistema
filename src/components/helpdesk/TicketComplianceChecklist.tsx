import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useTicketChecklist, useToggleTicketChecklistItem } from '@/hooks/useComplianceChecklists';

interface TicketComplianceChecklistProps {
  ticketId: string;
  canEdit?: boolean;
}

export function TicketComplianceChecklist({ ticketId, canEdit = false }: TicketComplianceChecklistProps) {
  const { checklists, guardrail, isLoading } = useTicketChecklist(ticketId);
  const { toggleItem, isUpdating } = useToggleTicketChecklistItem(ticketId);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Checklist de Conformidade
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (checklists.length === 0) return null;

  const progressValue = guardrail.totalItems === 0 ? 0 : (guardrail.completedItems / guardrail.totalItems) * 100;

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Checklist de Conformidade
            </CardTitle>
            <Badge variant={guardrail.canClose ? 'secondary' : 'outline'}>
              {guardrail.completedItems} de {guardrail.totalItems}
            </Badge>
          </div>
          <div className="space-y-2">
            <Progress value={progressValue} className="h-2 bg-secondary [&>div]:bg-foreground" />
            <p className="text-xs text-muted-foreground">
              {guardrail.completedItems} de {guardrail.totalItems} tarefas realizadas
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {checklists.map((checklist) => (
          <div key={checklist.id} className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">{checklist.template?.name || 'Checklist'}</h3>
                {checklist.status === 'completed' && <CheckCircle2 className="h-4 w-4 text-status-success" />}
              </div>
              {checklist.template?.description && (
                <p className="text-xs text-muted-foreground">{checklist.template.description}</p>
              )}
            </div>

            <div className="space-y-2">
              {checklist.items.map((item) => (
                <label
                  key={item.id}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border border-border bg-card p-3 transition-colors',
                    canEdit && 'cursor-pointer hover:bg-secondary/40',
                    item.is_completed && 'bg-secondary/30'
                  )}
                >
                  <Checkbox
                    checked={item.is_completed}
                    disabled={!canEdit || isUpdating}
                    onCheckedChange={(checked) => toggleItem({ itemId: item.id, isCompleted: checked === true })}
                    className="mt-0.5 border-border data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background"
                  />

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        className={cn(
                          'text-sm font-medium text-foreground',
                          item.is_completed && 'line-through text-muted-foreground'
                        )}
                      >
                        {item.description}
                      </p>
                      {item.is_required && (
                        <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                          Obrigatória
                        </Badge>
                      )}
                    </div>
                    {item.responsible_sector && (
                      <p className="text-xs text-muted-foreground">
                        Setor responsável: {item.responsible_sector}
                      </p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}

        {!guardrail.canClose && (
          <div className="rounded-xl border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
            Restam {guardrail.pendingRequiredItems} item(ns) obrigatório(s) para liberar o encerramento do chamado.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
