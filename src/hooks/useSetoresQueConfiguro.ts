import { useMemo } from 'react';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { SETORES_DE_CONFIGURACAO, type SetorDeConfiguracao } from '@/config/setores-de-configuracao';

export interface SetorComAcesso extends SetorDeConfiguracao {
  /** Alguma aba do setor abre: cartão ativo, rota liberada. */
  abre: boolean;
}

/**
 * Os setores de Configurações › Setores com o acesso da pessoa logada (LEVA P). Setor com perfil
 * de acesso abre se ALGUMA aba dele estiver marcada no perfil (parte 7); setor sem perfil (não há
 * mais nenhum desde 2026-10-02) seguiria quem configura o sistema. Dono e admin abrem todos.
 */
export function useSetoresQueConfiguro() {
  const { abre, isLoading, isError } = useConfiguracaoDosSetores();
  const modulos = useVisibleModules();
  const setores = useMemo<SetorComAcesso[]>(() => SETORES_DE_CONFIGURACAO.map((s) => ({
    ...s,
    abre: s.setor ? abre(s.setor) : modulos.showSettings,
  })), [abre, modulos.showSettings]);
  return { setores, isLoading: isLoading || modulos.isLoading, isError, algum: setores.some((s) => s.abre) };
}
