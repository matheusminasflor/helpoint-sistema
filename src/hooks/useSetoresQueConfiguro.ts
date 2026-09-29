import { useMemo } from 'react';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { SETORES_DE_CONFIGURACAO, type SetorDeConfiguracao } from '@/config/setores-de-configuracao';

export interface SetorComAcesso extends SetorDeConfiguracao {
  /** Abre as configurações do setor (cartão ativo, rota liberada). */
  abre: boolean;
  /** Altera o que está lá — a mesma pergunta de `pode_configurar_setor` no banco. */
  altera: boolean;
}

/**
 * Os setores de Configurações › Setores com o acesso da pessoa logada (LEVA P). Setor com perfil
 * de acesso segue a chave `settings` do perfil; a Expedição, que não tem perfil, segue o módulo.
 * Dono e admin abrem e alteram todos.
 */
export function useSetoresQueConfiguro() {
  const { abre, altera, isLoading, isError } = useConfiguracaoDosSetores();
  const modulos = useVisibleModules();
  const setores = useMemo<SetorComAcesso[]>(() => SETORES_DE_CONFIGURACAO.map((s) => {
    if (s.setor) return { ...s, abre: abre(s.setor), altera: altera(s.setor) };
    const expedicao = modulos.showSettings || modulos.showExpedicao;
    return { ...s, abre: expedicao, altera: expedicao };
  }), [abre, altera, modulos.showSettings, modulos.showExpedicao]);
  return { setores, isLoading: isLoading || modulos.isLoading, isError, algum: setores.some((s) => s.abre) };
}
