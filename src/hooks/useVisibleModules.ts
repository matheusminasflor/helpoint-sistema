import { useAuth } from '@/contexts/AuthContext';
import { useMyModules } from './useUserModules';

export interface VisibleModules {
  // Mundo 1 - Demandas
  showNewRequest: boolean;
  showMyQueue: boolean;
  showKanban: boolean;
  
  // Mundo 2 - Conhecimento
  showPortal: boolean;
  showSAC: boolean;
  
  // Mundo 3 - Gestão (module-based)
  showTI: boolean;
  showInventory: boolean;
  showSettings: boolean;
  showMarketing: boolean;
  showQuality: boolean;
  showRH: boolean;
  showFinanceiro: boolean;
  showComercial: boolean;
  showCRM: boolean;
  showExpedicao: boolean;
  showEducacional: boolean;
  showDiretoria: boolean;

  // Meta
  isOwnerOrAdmin: boolean;
  isManagerOrHigher: boolean;
  isMemberOrHigher: boolean;
  isLoading: boolean;
}

export function useVisibleModules(): VisibleModules {
  const { role } = useAuth();
  const { data: userModules, isLoading } = useMyModules();
  
  // New role hierarchy
  const isOwner = role === 'owner';
  const isAdmin = role === 'admin' || isOwner;
  const isOwnerOrAdmin = isOwner || role === 'admin';
  const isManagerOrHigher = isOwnerOrAdmin || role === 'manager';
  const isMemberOrHigher = isManagerOrHigher || role === 'member';
  
  // Helper to check if user has access to a module
  // Owner/Admin always have access to all modules
  const hasModuleAccess = (moduleId: string): boolean => {
    if (isOwnerOrAdmin) return true;
    return userModules?.includes(moduleId as any) ?? false;
  };
  
  return {
    // Mundo 1 - Available to all authenticated users
    showNewRequest: true,
    showMyQueue: true,
    showKanban: isMemberOrHigher,
    
    // Mundo 2 - Knowledge
    showPortal: true,
    showSAC: hasModuleAccess('qualidade'),
    
    // Mundo 3 - Active modules only: TI, Marketing, Qualidade
    showTI: hasModuleAccess('ti'),
    showInventory: hasModuleAccess('ti'),
    showSettings: isOwnerOrAdmin,
    showMarketing: hasModuleAccess('marketing'),
    showQuality: hasModuleAccess('qualidade'),
    showRH: hasModuleAccess('rh'),
    showFinanceiro: hasModuleAccess('financeiro'),
    showComercial: hasModuleAccess('comercial'),
    /**
     * **CRM está em construção** (decisão do dono, 2026-09-21): sai do menu
     * enquanto o Comercial é retrabalhado em cima do painel de verdade.
     *
     * `false` fixo, e não concessão retirada, de propósito: retirar a concessão
     * apagaria quem tinha acesso, e no dia de religar ninguém lembraria de
     * quem era. Nada foi apagado — as tabelas, as telas, os fluxos e as provas
     * do CRM continuam de pé; só não há porta para eles no menu. Voltar é
     * trocar esta linha de volta.
     *
     * Quem digitar `/crm/...` na barra cai numa tela dizendo que está em
     * construção, em vez de numa tela pela metade.
     */
    showCRM: false,
    showExpedicao: hasModuleAccess('expedicao'),
    showEducacional: hasModuleAccess('educacional'),
    showDiretoria: hasModuleAccess('diretoria'),

    // Meta
    isOwnerOrAdmin,
    isManagerOrHigher,
    isMemberOrHigher,
    isLoading,
  };
}
