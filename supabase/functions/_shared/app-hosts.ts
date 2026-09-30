// Os endereços do próprio Helpoint, num lugar só.
//
// DECISÃO DO DONO (2026-09-30): o Helpoint é da Minasflor (ADR-010) e não vai ter domínio próprio —
// mora num subdomínio da empresa, `helpoint.minasflor.com.br` (DNS na Hostinger, front na Vercel).
// Até aqui o padrão era `helpoint.com.br`, espalhado por seis funções; ele continua aceito, para o
// dia em que a Minasflor quiser o domínio, mas o endereço que o sistema usa é o de baixo.
export const APP_HOST = 'helpoint.minasflor.com.br';
const OUTROS_HOSTS_DO_APP = ['helpoint.com.br', 'www.helpoint.com.br'];

// Previews do front na Vercel: `helpoint-<hash|git-branch>-<time>.vercel.app`.
// O prefixo importa: `*.vercel.app` inteiro seria qualquer projeto de qualquer
// dono, e esta regra decide redirect de OAuth e host padrão do SAC.
export function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return h.startsWith('helpoint-') && h.endsWith('.vercel.app');
}

/** O endereço é o do próprio sistema (produção, localhost ou prévia da Vercel)? */
export function isAppHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return h === 'localhost' || h === '127.0.0.1' || h === APP_HOST || OUTROS_HOSTS_DO_APP.includes(h) || isPreviewHost(h);
}

/** O endereço do app para links em e-mail (convite): o secret `APP_BASE_URL`, ou o padrão. */
export const appBaseUrl = () => Deno.env.get('APP_BASE_URL') || `https://${APP_HOST}`;

/**
 * O remetente padrão, quando o secret do remetente não foi configurado. A caixa é da Hostinger e
 * mora em `avisos.`, não em `helpoint.`: o endereço do site é um CNAME para a Vercel, e CNAME não
 * convive com o MX da caixa no mesmo nome (criar a caixa em `helpoint.` tirou o site do ar).
 */
export const REMETENTE_PADRAO = 'nao-responda@avisos.minasflor.com.br';
