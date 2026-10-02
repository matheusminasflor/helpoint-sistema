import type { VisibleModules } from '@/hooks/useVisibleModules';

// O módulo que abre cada endereço de setor — a régua de `GuardaDoSetor` (2026-10-01).
const MODULO_DO_PREFIXO: Record<string, keyof VisibleModules> = {
  ti: 'showTI',
  inventario: 'showInventory',
  mkt: 'showMarketing',
  qualidade: 'showQuality',
  rh: 'showRH',
  financeiro: 'showFinanceiro',
  compras: 'showCompras',
  comercial: 'showComercial',
  educacional: 'showEducacional',
  expedicao: 'showExpedicao',
  diretoria: 'showDiretoria',
};

/** O flag que abre o endereço, ou null quando o endereço não é de setor (ou é detalhe de chamado). */
export function moduloDoEndereco(pathname: string): keyof VisibleModules | null {
  if (/^\/[^/]+\/chamados\/[^/]+\/?$/.test(pathname)) return null;
  const prefixo = pathname.split('/').filter(Boolean)[0] ?? '';
  return MODULO_DO_PREFIXO[prefixo] ?? null;
}

