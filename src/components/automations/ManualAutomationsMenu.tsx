import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useManualWorkflows, useRunManual } from '@/hooks/useAutomations';

interface ManualAutomationsMenuProps {
  entity: 'ticket' | 'crm_deal' | 'crm_contact' | 'crm_order';
  subjectId: string;
  compact?: boolean;
}

/**
 * Botão "Automações" no chamado e no negócio (E5-A2): lista os fluxos com
 * gatilho manual do cadastro e aciona um deles para este registro. Some
 * quando não há fluxo manual ativo.
 */
export function ManualAutomationsMenu({ entity, subjectId, compact }: ManualAutomationsMenuProps) {
  const { data: workflows = [] } = useManualWorkflows(entity);
  const runManual = useRunManual();
  if (workflows.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={compact ? 'sm' : 'default'} disabled={runManual.isPending}>
          <Zap className="w-4 h-4 mr-1.5" /> Automações
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Acionar fluxo</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workflows.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => runManual.mutate({ workflowId: w.id, subjectId })}>
            {w.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
