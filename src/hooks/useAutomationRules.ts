import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';
import type { Json } from '@/integrations/supabase/types';
import type { AutomationModule, TriggerKind, ActionKind } from '@/lib/automation-rules';

export {
  TRIGGER_LABELS,
  ACTION_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  TEAM_LABELS,
  WEEKDAY_LABELS,
  MODULE_TARGET_LABELS,
} from '@/lib/automation-rules';
export type { AutomationModule, TriggerKind, ActionKind, AutomationRule } from '@/lib/automation-rules';

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
