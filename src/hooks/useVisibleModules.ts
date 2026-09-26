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
  /**
   * A leitura das concessões FALHOU (leva F, 2026-09-26). Existe porque
   * `useMyModules` deixou de engolir erro do banco: antes ele devolvia `[]` numa
   * falha, e `[]` é indistinguível de "esta pessoa não tem módulo nenhum".
   *
   * Quem consome isto são os guardas de rota. Sem este campo, uma falha de
   * leitura faria `RequireComercial`/`RequireDiretoria` **redirecionarem** a
   * pessoa para `/inicio` — sem aviso, parecendo perda de acesso. Guarda não
   * pode tratar "não sei" como "não pode".
   */
  isError: boolean;
}

export function useVisibleModules(): VisibleModules {
  const { role } = useAuth();
  const { data: userModules, isLoading, isError } = useMyModules();
  
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
    isError,
  };
}

// A porta da Diretoria (`podeAcessarDiretoria`) mora em
// `@/lib/acesso-diretoria`, módulo sem dependência nenhuma. Não a reexporte
// daqui: este arquivo importa `useAuth`, que arrasta o cliente do Supabase, e
// quem importasse a regra por aqui num teste levaria a cadeia inteira junto —
// foi o que deixou o CI #75 vermelho com tudo verde na máquina.
