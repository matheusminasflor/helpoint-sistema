import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Play } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import type { Task } from '@/types/database';

const PRIORITY = ['', 'Crítica', 'Alta', 'Média', 'Baixa', 'Baixa'];

/**
 * Painel da tarefa (curadoria do dia): o que é, prazo, de onde veio, e as
 * duas ações — "Concluir" e "Modo foco". O modo foco só entra por aqui ou
 * pelo botão "Focar" da lista; o clique na linha não decide por ninguém.
 */
export function TaskDetailDialog({ task, onOpenChange, onFocus, onCompleted }: {
  task: Task | null;
  onOpenChange: (open: boolean) => void;
  onFocus: (task: Task) => void;
  onCompleted: () => void;
}) {
  const { tenantId } = useAuth();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [completing, setCompleting] = useState(false);

  // Nome do fluxo que criou a tarefa (source_type 'automation' guarda o id do fluxo).
  const { data: flowName } = useQuery({
    queryKey: ['automation-workflow-name', tenantId, task?.source_id],
    enabled: !!tenantId && task?.source_type === 'automation' && !!task?.source_id,
    queryFn: async () => unwrap(await supabase.from('automation_workflows').select('name').eq('id', task!.source_id!).maybeSingle())?.name ?? null,
  });

  const complete = async () => {
    if (!task) return;
    setCompleting(true);
    try {
      expectRows(await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id).select('id'), 'a conclusão da tarefa');
      toast.success('Tarefa concluída.');
      onCompleted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setCompleting(false);
    }
  };

  const origin = !task ? '' : task.is_ai_suggested ? 'Sugerida pela assistente'
    : task.source_type === 'automation' ? `Criada pelo fluxo${flowName ? ` "${flowName}"` : ' de automação'}`
    : task.source_type === 'ticket' ? 'Nascida de um chamado'
    : 'Criada por você';

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {task && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap"><Badge variant="outline" className="text-[10px]">Tarefa</Badge> {task.title}</DialogTitle>
              <DialogDescription>{origin}{task.due_date ? ` · vence em ${new Date(task.due_date).toLocaleDateString('pt-BR')}` : ' · sem prazo'} · prioridade {PRIORITY[task.priority] ?? 'Média'}</DialogDescription>
            </DialogHeader>
            {task.description ? (
              <p className="text-sm whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 max-h-64 overflow-y-auto">{task.description}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem descrição.</p>
            )}
            {task.source_type === 'ticket' && task.source_id && (
              <Button variant="link" size="sm" className="px-0 justify-start" onClick={() => { onOpenChange(false); navigate(tenantPath(`/helpdesk/${task.source_id}`)); }}>
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir o chamado de origem
              </Button>
            )}
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => onFocus(task)}><Play className="h-3.5 w-3.5 mr-1.5" /> Modo foco</Button>
              <Button onClick={complete} disabled={completing}><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" /> Concluir</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
