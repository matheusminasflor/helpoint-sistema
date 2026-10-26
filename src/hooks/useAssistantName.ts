import { useTenantSettings } from '@/hooks/useTenantSettings';
import { iaLigada } from '@/lib/ia-ligada';

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

/** A IA está ligada para a empresa (`settings.lyra.enabled`). Enquanto carrega, ou sem empresa (telas públicas), é false:
 *  sem chave de IA nada disso funciona, e esconder é o seguro. ponytail: as telas públicas do SAC nunca mostram o
 *  "melhorar texto" enquanto não houver leitura pública do interruptor; a saída é expor o flag numa RPC pública. */
export function useIALigada(): boolean {
  const { data: settings } = useTenantSettings();
  return iaLigada(settings);
}
