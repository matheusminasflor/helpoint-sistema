// Previews do front na Vercel: `helpoint-<hash|git-branch>-<time>.vercel.app`.
// O prefixo importa: `*.vercel.app` inteiro seria qualquer projeto de qualquer
// dono, e esta regra decide redirect de OAuth e host padrão do SAC.
export function isPreviewHost(host: string): boolean {
  const h = host.toLowerCase().split(':')[0];
  return h.startsWith('helpoint-') && h.endsWith('.vercel.app');
}
