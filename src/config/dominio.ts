// O endereço do Helpoint (decisão do dono, 2026-09-30): um subdomínio da Minasflor — o Helpoint é o
// sistema dela (ADR-010) e não terá domínio próprio. O mesmo valor mora em
// `supabase/functions/_shared/app-hosts.ts` (servidor) e em `supabase/config.toml` (login).
export const DOMINIO_DO_APP = 'helpoint.minasflor.com.br';

/** Os endereços que são o próprio sistema, e não o domínio próprio de uma empresa. */
export function ehEnderecoDoApp(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === DOMINIO_DO_APP
    || host === 'helpoint.com.br' || host === 'www.helpoint.com.br'
    || (host.startsWith('helpoint-') && host.endsWith('.vercel.app'));
}
