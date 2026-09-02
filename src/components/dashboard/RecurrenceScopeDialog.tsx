import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Repeat, Calendar, ChevronsRight, Layers } from 'lucide-react';
import type { RecurrenceScope } from '@/hooks/useCalendarEvents';

interface RecurrenceScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'edit' | 'delete';
  eventTitle?: string;
  onConfirm: (scope: RecurrenceScope) => void;
}

export function RecurrenceScopeDialog({
  open,
  onOpenChange,
  mode,
  eventTitle,
  onConfirm,
}: RecurrenceScopeDialogProps) {
  const verb = mode === 'edit' ? 'Editar' : 'Excluir';

  const handle = (scope: RecurrenceScope) => {
    onConfirm(scope);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm bg-card border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Repeat className="w-4 h-4 text-primary" strokeWidth={1.5} />
            {verb} evento recorrente
          </DialogTitle>
          {eventTitle && (
            <DialogDescription className="truncate">
              {eventTitle}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-2 pt-2">
          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => handle('this')}
          >
            <Calendar className="w-4 h-4 text-muted-foreground mr-2.5 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col items-start">
              <span className="text-sm">Apenas este evento</span>
              <span className="text-[11px] text-muted-foreground">
                {mode === 'edit' ? 'Altera somente esta ocorrência' : 'Remove somente esta ocorrência'}
              </span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => handle('following')}
          >
            <ChevronsRight className="w-4 h-4 text-muted-foreground mr-2.5 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col items-start">
              <span className="text-sm">Este e os próximos eventos</span>
              <span className="text-[11px] text-muted-foreground">
                Aplica desta ocorrência em diante
              </span>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start h-auto py-2.5 px-3 text-left"
            onClick={() => handle('all')}
          >
            <Layers className="w-4 h-4 text-muted-foreground mr-2.5 shrink-0" strokeWidth={1.5} />
            <div className="flex flex-col items-start">
              <span className="text-sm">Todos os eventos da série</span>
              <span className="text-[11px] text-muted-foreground">
                Aplica a todas as ocorrências
              </span>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
