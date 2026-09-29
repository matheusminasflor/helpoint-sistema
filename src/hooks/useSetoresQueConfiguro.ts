import { useMemo } from 'react';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { SETORES_DE_CONFIGURACAO, type SetorDeConfiguracao } from '@/config/setores-de-configuracao';

export interface SetorComAcesso extends SetorDeConfiguracao {
  /** Abre as configurações do setor (cartão ativo, rota liberada). */
  abre: boolean;
  /** Altera a aba Chamados — a mesma pergunta de `pode_configurar_setor` no banco. */
  altera: boolean;
}

/**
 * Os setores de Configurações › Setores com o acesso da pessoa logada (LEVA P). Setor com perfil
 * de acesso segue a chave `settings` do perfil, ou uma permissão que dá direito a uma aba dele
 * (`tambemAbrePor`); a Expedição, que não tem perfil, segue o módulo. Dono e admin abrem todos.
 */
export function useSetoresQueConfiguro() {
  const { abre, altera, pode, isLoading, isError } = useConfiguracaoDosSetores();
  const modulos = useVisibleModules();
  const setores = useMemo<SetorComAcesso[]>(() => SETORES_DE_CONFIGURACAO.map((s) => {
    if (!s.setor) {
      const expedicao = modulos.showSettings || modulos.showExpedicao;
      return { ...s, abre: expedicao, altera: expedicao };
    }
    const porAba = (s.tambemAbrePor ?? []).some((p) => pode(p.setor, p.modulo, p.acao));
    return { ...s, abre: abre(s.setor) || porAba, altera: altera(s.setor) };
  }), [abre, altera, pode, modulos.showSettings, modulos.showExpedicao]);
  return { setores, isLoading: isLoading || modulos.isLoading, isError, algum: setores.some((s) => s.abre) };
}
