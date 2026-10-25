// Para onde vai quem entra pelo código no e-mail (as telas do SAC): o Portal do Distribuidor usa a mesma entrada
// (etapa 6) e chega com `?destino=distribuidor` no link; o resto é cliente do SAC.
export function telaDepoisDeEntrar(destino: string | null, tenant: string | null): string {
  const base = destino === 'distribuidor' ? '/distribuidor' : '/sac/meus-chamados';
  return tenant ? `${base}?tenant=${tenant}` : base;
}
