import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';

export interface LyraSettings {
  customName?: string;
  tone?: 'formal' | 'semiformal' | 'casual';
  companyContext?: string;
  customInstructions?: string;
  priorityFocus?: string[];
  greeting?: string;
  enabled?: boolean;
}

export interface HelpdeskSettings {
  ticketVisibility?: 'all' | 'own_and_unassigned';
  departmentIsolation?: boolean;
}

export interface ComercialSettings {
  /**
   * O vendedor vê somente os clientes das carteiras de que é membro.
   *
   * **Quem faz valer é o BANCO** — as policies de `com_clientes` e
   * `com_vendas_itens` leem esta chave por `com_so_a_minha_carteira()` (migration
   * `20261109030000`). Este tipo existe para a tela de configuração; mudar só aqui
   * não muda nada, e é assim que deve ser: front que esconde sem o banco restringir
   * é cortina, não porta.
   */
  vendedorSoVeSuaCarteira?: boolean;
  /**
   * A categoria de chamado para onde vai o pedido de cadastro de cliente novo quando o gestor
   * aprova (LEVA O, parte 3). Destino é configuração, não regra do código: sem ela,
   * `com_decidir_solicitacao_cadastro` recusa aprovar — nunca abre chamado num lugar adivinhado.
   */
  cadastroCategoriaId?: string;
}

export interface TenantSettings {
  modules?: {
    inventory?: boolean;
    contracts?: boolean;
    licenses?: boolean;
    maintenances?: boolean;
    helpdesk?: boolean;
  };
  alerts?: {
    slaWarningPercentage?: number;
    contractAlertDays?: number;
    licenseAlertDays?: number;
    emailNotifications?: boolean;
  };
  lyra?: LyraSettings;
  helpdesk?: HelpdeskSettings;
  comercial?: ComercialSettings;
}

export function useTenantSettings() {
  const { profile, tenantId } = useAuth();

  return useQuery({
    queryKey: ['tenant-settings', tenantId],
    queryFn: async (): Promise<TenantSettings> => {
      if (!profile?.tenant_id) return {};

      const { data, error } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', profile.tenant_id)
        .single();

      if (error) throw error;
      return (data?.settings as TenantSettings) || {};
    },
    enabled: !!profile?.tenant_id,
  });
}

interface UpdateSettingsVars {
  settings: TenantSettings;
  silent?: boolean;
}

export function useUpdateTenantSettings() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (vars: TenantSettings | UpdateSettingsVars) => {
      if (!profile?.tenant_id) throw new Error('No tenant');

      // Backwards-compat: accept raw TenantSettings or { settings, silent }
      const settings: TenantSettings =
        'settings' in (vars as UpdateSettingsVars) && (vars as UpdateSettingsVars).settings
          ? (vars as UpdateSettingsVars).settings
          : (vars as TenantSettings);

      const current = unwrap(await supabase
        .from('tenants')
        .select('settings')
        .eq('id', profile.tenant_id)
        .single());

      const mergedSettings = {
        ...(current?.settings as TenantSettings || {}),
        ...settings,
      };

      expectRows(await supabase
        .from('tenants')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ settings: mergedSettings as any })
        .eq('id', profile.tenant_id)
        .select('id'), 'as configurações');

      return { silent: 'silent' in (vars as UpdateSettingsVars) ? (vars as UpdateSettingsVars).silent : false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-settings'] });
      if (!result?.silent) {
        toast.success('Configurações salvas');
      }
    },
    onError: (error) => {
      toast.error('Erro ao salvar configurações: ' + error.message);
    },
  });
}
