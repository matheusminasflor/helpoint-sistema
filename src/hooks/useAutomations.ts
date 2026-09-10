import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { Database, Json } from '@/integrations/supabase/types';
import type { AutomationModule, FlowStep, FlowTrigger } from '@/lib/automation-flow';

export type AutomationWorkflow = Database['public']['Tables']['automation_workflows']['Row'];
export type AutomationRun = Database['public']['Tables']['automation_runs']['Row'];
export type WorkflowStatus = 'draft' | 'active' | 'paused';

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** O gatilho e os passos de um fluxo, já com o tipo do front (o banco só garante que é jsonb válido). */
export function flowOf(w: Pick<AutomationWorkflow, 'trigger' | 'steps'>): { trigger: FlowTrigger; steps: FlowStep[] } {
  return { trigger: w.trigger as unknown as FlowTrigger, steps: (Array.isArray(w.steps) ? w.steps : []) as unknown as FlowStep[] };
}

export function useWorkflows(module: AutomationModule) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-workflows', tenantId, module],
    enabled: !!tenantId,
    queryFn: async (): Promise<AutomationWorkflow[]> =>
      unwrap(await supabase.from('automation_workflows').select('*').eq('tenant_id', tenantId!).eq('module', module).order('created_at')),
  });
}

export function useWorkflow(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-workflow', tenantId, id],
    enabled: !!tenantId && !!id,
    queryFn: async (): Promise<AutomationWorkflow> =>
      unwrap(await supabase.from('automation_workflows').select('*').eq('id', id!).single()),
  });
}

export interface WorkflowInput {
  id?: string;
  module: AutomationModule;
  name: string;
  description?: string | null;
  trigger: FlowTrigger;
  steps: FlowStep[];
  status?: WorkflowStatus;
}

/** Cria ou salva o fluxo inteiro. O CHECK do banco recusa grafo inválido — o erro vem em português no toast. */
export function useSaveWorkflow() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: WorkflowInput): Promise<string> => {
      const patch = {
        name: input.name,
        description: input.description ?? null,
        trigger: input.trigger as unknown as Json,
        steps: input.steps as unknown as Json,
        ...(input.status ? { status: input.status } : {}),
      };
      if (input.id) {
        expectRows(await supabase.from('automation_workflows').update(patch).eq('id', input.id).select('id'), 'o fluxo');
        return input.id;
      }
      const rows = expectRows(
        await supabase.from('automation_workflows').insert({ ...patch, module: input.module, tenant_id: tenantId!, created_by: user?.id }).select('id'),
        'o fluxo',
      );
      return rows[0].id;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', tenantId, id] });
      toast.success('Fluxo salvo.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useSetWorkflowStatus() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: WorkflowStatus }) =>
      expectRows(await supabase.from('automation_workflows').update({ status }).eq('id', id).select('id'), 'o fluxo'),
    onSuccess: (_r, v) => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['automation-workflow', tenantId, v.id] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useDeleteWorkflow() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(await supabase.from('automation_workflows').delete().eq('id', id).select('id'), 'o fluxo'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-workflows', tenantId] });
      toast.success('Fluxo apagado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Execuções de um fluxo, a mais recente primeiro. */
export function useWorkflowRuns(workflowId: string | undefined, limit = 50) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-runs', tenantId, workflowId, limit],
    enabled: !!tenantId && !!workflowId,
    queryFn: async (): Promise<AutomationRun[]> =>
      unwrap(
        await supabase.from('automation_runs').select('*').eq('workflow_id', workflowId!).order('created_at', { ascending: false }).limit(limit),
      ),
  });
}

export function useCancelRun() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => unwrap(await supabase.rpc('automation_cancel_run', { p_run: runId })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs', tenantId] });
      toast.success('Execução cancelada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─── A2: webhook e disparo manual ─────────────────────────────────────────────

/** Gera (ou troca) o segredo do gatilho webhook; o valor volta uma vez só — o banco guarda o hash. */
export function useWebhookSecret() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workflowId: string): Promise<string> =>
      unwrap(await supabase.rpc('automation_webhook_secret', { p_workflow: workflowId })) as unknown as string,
    onSuccess: (_s, id) => queryClient.invalidateQueries({ queryKey: ['automation-workflow', tenantId, id] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Os fluxos manuais ativos de um cadastro — o que o botão "Automações" lista. */
export function useManualWorkflows(entity: 'ticket' | 'crm_deal' | 'crm_contact' | 'crm_order') {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-manual', tenantId, entity],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ id: string; name: string; module: string }[]> =>
      unwrap(await supabase.rpc('automation_manual_for', { p_entity: entity })),
  });
}

export function useRunManual() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ workflowId, subjectId }: { workflowId: string; subjectId: string }): Promise<string> =>
      unwrap(await supabase.rpc('automation_run_manual', { p_workflow: workflowId, p_subject_id: subjectId })) as unknown as string,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal'] });
      queryClient.invalidateQueries({ queryKey: ['crm-deal-activities'] });
      queryClient.invalidateQueries({ queryKey: ['ticket'] });
      toast.success('Fluxo acionado.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

// ─── A3: reexecutar e ver um run ─────────────────────────────────────────────

export function useRun(runId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-run', tenantId, runId],
    enabled: !!tenantId && !!runId,
    queryFn: async (): Promise<AutomationRun> => unwrap(await supabase.from('automation_runs').select('*').eq('id', runId!).single()),
    refetchInterval: (q) => (q.state.data && ['queued', 'running', 'waiting'].includes(q.state.data.status) ? 5000 : false),
  });
}

/** Run que falhou volta pela(s) etapa(s) que falharam, com o mesmo contexto (`automation_retry_run`). */
export function useRetryRun() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (runId: string) => unwrap(await supabase.rpc('automation_retry_run', { p_run: runId })),
    onSuccess: (_r, runId) => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['automation-run', tenantId, runId] });
      toast.success('Execução reenfileirada.');
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}
