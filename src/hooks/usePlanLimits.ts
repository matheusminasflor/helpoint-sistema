import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { PlanConfig, ModuleId } from '@/types/database';

const DEFAULT_PLAN_CONFIG: PlanConfig = {
  plan: 'free',
  trial_ends_at: null,
  max_users: 5,
  available_modules: ['ti', 'comercial', 'marketing', 'rh', 'financeiro', 'producao', 'expedicao', 'educacional', 'qualidade'],
  features: {
    lyra_advanced: true,
    advanced_reports: true,
    export_data: true,
  },
};

export function usePlanConfig() {
  const { tenantId } = useAuth();

  return useQuery({
    queryKey: ['plan-config', tenantId],
    queryFn: async (): Promise<PlanConfig> => {
      if (!tenantId) return DEFAULT_PLAN_CONFIG;

      const { data, error } = await supabase
        .from('tenants')
        .select('plan_config')
        .eq('id', tenantId)
        .single();

      if (error || !data?.plan_config) {
        console.error('Error fetching plan config:', error);
        return DEFAULT_PLAN_CONFIG;
      }

      return data.plan_config as unknown as PlanConfig;
    },
    enabled: !!tenantId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

export function usePlanLimits() {
  const { data: planConfig, isLoading } = usePlanConfig();

  const isTrialExpired = (): boolean => {
    if (!planConfig?.trial_ends_at) return false;
    return new Date(planConfig.trial_ends_at) < new Date();
  };

  const hasModule = (module: ModuleId): boolean => {
    if (!planConfig) return false;
    return planConfig.available_modules.includes(module);
  };

  const hasFeature = (feature: keyof PlanConfig['features']): boolean => {
    if (!planConfig) return false;
    return planConfig.features[feature] ?? false;
  };

  const getMaxUsers = (): number => {
    return planConfig?.max_users ?? 5;
  };

  const isUnlimitedUsers = (): boolean => {
    return (planConfig?.max_users ?? 0) < 0;
  };

  const getPlanName = (): string => {
    const names: Record<string, string> = {
      free: 'Free (Trial)',
      starter: 'Starter',
      enterprise: 'Enterprise',
      custom: 'Personalizado',
    };
    return names[planConfig?.plan || 'free'] || 'Free';
  };

  return {
    planConfig,
    isLoading,
    isTrialExpired,
    hasModule,
    hasFeature,
    getMaxUsers,
    isUnlimitedUsers,
    getPlanName,
  };
}
