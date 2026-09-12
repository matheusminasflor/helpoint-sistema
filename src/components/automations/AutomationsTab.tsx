import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useTICategories, formatTICategoryLabel } from '@/hooks/useTICategories';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMStages } from '@/hooks/useCRM';
import { flowOf, useDeleteWorkflow, useSaveWorkflow, useSetWorkflowStatus, useWorkflows, type AutomationWorkflow } from '@/hooks/useAutomations';
import { describeFlow, type AutomationModule } from '@/lib/automation-flow';
import { AutomationTemplatesDialog } from './AutomationTemplatesDialog';

interface AutomationsTabProps {
  module: AutomationModule;
}

const STATUS_BADGE: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft: { label: 'Rascunho', variant: 'outline' },
  active: { label: 'Ativo', variant: 'default' },
  paused: { label: 'Pausado', variant: 'secondary' },
};

/**
 * Aba "Automações" das configurações de cada módulo (E5-A1): a lista dos
 * fluxos, com "quando … → então …", status, última execução e erro. Editar
 * e criar abrem a página `automacoes/:id`.
 */
export function AutomationsTab({ module }: AutomationsTabProps) {
  const { role } = useAuth();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const canEdit = ['owner', 'admin', 'manager'].includes(role ?? '');

  const { data: workflows = [], isLoading } = useWorkflows(module);
  const { categories } = useTICategories(module);
  const { data: technicians = [] } = useTechnicians();
  const { data: stages = [] } = useCRMStages();
  const saveWorkflow = useSaveWorkflow();
  const setStatus = useSetWorkflowStatus();
  const deleteWorkflow = useDeleteWorkflow();
  const [deleting, setDeleting] = useState<AutomationWorkflow | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const ctx = useMemo(() => ({
    people: technicians.map((t) => ({ id: t.id, name: t.full_name || t.email })),
    categories: categories.map((c) => ({ id: c.id, name: formatTICategoryLabel(c, categories) })),
    stages: stages.map((s) => ({ id: s.id, name: s.name })),
  }), [technicians, categories, stages]);

  const createNew = () => {
    saveWorkflow.mutate(
      { module, name: 'Novo fluxo', trigger: { kind: 'record_created', entity: 'ticket', next: [] }, steps: [] },
      { onSuccess: (id) => navigate(tenantPath(`/automacoes/${id}`)) },
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Automações</CardTitle>
          <CardDescription>Fluxos do tipo «quando … → então …, depois …», executados pelo próprio sistema.</CardDescription>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            {module === 'comercial' && (
              <Button size="sm" variant="outline" onClick={() => setTemplatesOpen(true)}>
                <Sparkles className="w-3.5 h-3.5 mr-1" /> Usar um modelo
              </Button>
            )}
            <Button size="sm" onClick={createNew} disabled={saveWorkflow.isPending}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Novo fluxo
            </Button>
          </div>
        )}
      </CardHeader>
      <AutomationTemplatesDialog open={templatesOpen} onOpenChange={setTemplatesOpen} module={module} />
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : workflows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Nenhum fluxo ainda. Crie o primeiro: quando algo acontece, o sistema faz uma sequência de coisas por você.
          </div>
        ) : (
          <div className="space-y-2">
            {workflows.map((w) => {
              const { trigger, steps } = flowOf(w);
              const { quando, entao } = describeFlow(trigger, steps, ctx);
              const badge = STATUS_BADGE[w.status] ?? STATUS_BADGE.draft;
              return (
                <div key={w.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{w.name}</span>
                        <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">Quando {quando} → {entao}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {w.last_run_at
                          ? `Última execução ${formatDistanceToNow(new Date(w.last_run_at), { addSuffix: true, locale: ptBR })} · ${w.run_count} no total`
                          : 'Nunca rodou'}
                      </p>
                      {w.last_error && <Badge variant="destructive" className="mt-1.5">{w.last_error}</Badge>}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Switch
                          checked={w.status === 'active'}
                          onCheckedChange={(on) => setStatus.mutate({ id: w.id, status: on ? 'active' : 'paused' })}
                          aria-label="Ativo"
                        />
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(tenantPath(`/automacoes/${w.id}`))} aria-label="Editar">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDeleting(w)} aria-label="Apagar">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar o fluxo "{deleting?.name}"?</DialogTitle>
            <DialogDescription>As execuções passadas somem junto. Para só parar de disparar, pause em vez de apagar.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteWorkflow.isPending} onClick={() => deleting && deleteWorkflow.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
