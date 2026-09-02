import { useTenantSettings } from '@/hooks/useTenantSettings';

export const DEFAULT_ASSISTANT_NAME = 'Lyra';

/**
 * Nome do assistente de IA exibido ao usuário dentro do tenant.
 * Usa tenants.settings.lyra.customName, com fallback "Lyra".
 */
export function useAssistantName(): string {
  const { data: settings } = useTenantSettings();
  const name = settings?.lyra?.customName;
  return typeof name === 'string' && name.trim() ? name.trim() : DEFAULT_ASSISTANT_NAME;
}
