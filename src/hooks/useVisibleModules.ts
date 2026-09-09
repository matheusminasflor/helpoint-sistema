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
  showEducacional: boolean;

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
    showEducacional: hasModuleAccess('educacional'),

    // Meta
    isOwnerOrAdmin,
    isManagerOrHigher,
    isMemberOrHigher,
    isLoading,
  };
}
