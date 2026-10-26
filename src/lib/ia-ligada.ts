/** Regra pura do interruptor da IA (`tenants.settings.lyra.enabled`). Fica fora do hook porque o hook importa o cliente do Supabase. */
export const iaLigada = (settings: { lyra?: { enabled?: boolean } } | undefined | null) =>
  !!settings && settings.lyra?.enabled !== false;
