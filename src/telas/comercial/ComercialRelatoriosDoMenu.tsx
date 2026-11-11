// "Relatórios" do menu do Comercial (revisão de 2026-11-12): leva ao primeiro relatório que a pessoa abre; dali, as abas
// (AbasDosRelatorios) levam aos outros.
import { Navigate } from 'react-router-dom';
import { BarChart3 } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { useAbasDosRelatorios } from '@/hooks/useAbasDosRelatorios';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useTenantPath } from '@/hooks/useTenantPath';

export default function ComercialRelatoriosDoMenu() {
  const perfil = useConfiguracaoDosSetores();
  const abas = useAbasDosRelatorios();
  const tenantPath = useTenantPath();
  if (perfil.isLoading) return null;
  if (abas.length === 0) {
    return <div className="p-6"><EmptyState icon={BarChart3} title="Nenhum relatório liberado" description="Peça ao administrador para liberar os relatórios do Comercial no seu perfil." /></div>;
  }
  return <Navigate to={tenantPath(abas[0].to)} replace />;
}
