import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';
import type { Database, Json } from '@/integrations/supabase/types';

export type AutomationModule = 'tickets' | 'marketing' | 'qualidade' | 'rh' | 'financeiro';
export type TriggerKind = 'ticket_created' | 'ticket_status_changed' | 'ticket_deadline_expired' | 'schedule';
export type ActionKind = 'notify' | 'create_ticket' | 'create_task' | 'assign' | 'set_priority';

export type AutomationRule = Database['public']['Tables']['automation_rules']['Row'];

export interface AutomationRuleInput {
  id?: string;
  name: string;
  module: AutomationModule;
  is_active?: boolean;
  trigger_kind: TriggerKind;
  trigger_config: Record<string, unknown>;
  action_kind: ActionKind;
  action_config: Record<string, unknown>;
}

export const TRIGGER_LABELS: Record<TriggerKind, string> = {
  ticket_created: 'um chamado é aberto',
  ticket_status_changed: 'um chamado muda de status',
  ticket_deadline_expired: 'o prazo de um chamado estoura',
  schedule: 'chega o dia e a hora marcados',
};

export const ACTION_LABELS: Record<ActionKind, string> = {
  notify: 'avisar',
  create_ticket: 'abrir um chamado',
  create_task: 'criar uma tarefa',
  assign: 'atribuir o chamado a alguém',
  set_priority: 'mudar a prioridade',
};

export const STATUS_LABELS: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting_user: 'Aguardando usuário',
  waiting_parts: 'Aguardando peça',
  resolved: 'Resolvido',
  closed: 'Fechado',
  cancelled: 'Cancelado',
  rejected: 'Reprovado',
};

export const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Média',
  low: 'Baixa',
};

export const TEAM_LABELS: Record<string, string> = {
  ti: 'Equipe de TI',
  marketing: 'Equipe de Marketing',
  rh: 'Equipe de RH',
  qualidade: 'Equipe de Qualidade',
  financeiro: 'Equipe do Financeiro',
};

export const WEEKDAY_LABELS: Record<number, string> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
  7: 'domingo',
};

export const MODULE_TARGET_LABELS: Record<AutomationModule, string> = {
  tickets: 'TI',
  marketing: 'Marketing',
  rh: 'RH',
  qualidade: 'Qualidade',
  financeiro: 'Financeiro',
};

export function useAutomationRules(module: AutomationModule) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['automation-rules', tenantId, module],
    enabled: !!tenantId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('automation_rules')
          .select('*')
          .eq('tenant_id', tenantId!)
          .eq('module', module)
          .order('created_at'),
      ),
  });
}

export function useSaveAutomationRule() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AutomationRuleInput) => {
      const payload = {
        name: input.name,
        module: input.module,
        is_active: input.is_active,
        trigger_kind: input.trigger_kind,
        trigger_config: input.trigger_config as unknown as Json,
        action_kind: input.action_kind,
        action_config: input.action_config as unknown as Json,
      };

      if (input.id) {
        return expectRows(
          await supabase.from('automation_rules').update(payload).eq('id', input.id).select('id'),
          'a regra',
        );
      }

      return expectRows(
        await supabase
          .from('automation_rules')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user?.id })
          .select('id'),
        'a regra',
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
      toast.success('Regra salva.');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useDeleteAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) =>
      expectRows(
        await supabase.from('automation_rules').delete().eq('id', id).select('id'),
        'a exclusão da regra',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}

export function useToggleAutomationRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) =>
      expectRows(
        await supabase.from('automation_rules').update({ is_active }).eq('id', id).select('id'),
        'a regra',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-rules'] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });
}
