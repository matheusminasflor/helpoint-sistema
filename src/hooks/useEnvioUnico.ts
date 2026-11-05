import { useCallback, useRef, useState } from 'react';

/**
 * Um envio por vez, do clique até o último passo. Em 2026-11-05 o botão voltou a ficar ativo assim que o chamado nasceu,
 * enquanto 20 anexos ainda subiam: a pessoa clicou de novo e abriu #337 a #340 iguais. A trava é `ref` porque dois cliques
 * seguidos acontecem antes de a tela redesenhar.
 */
export function useEnvioUnico() {
  const emCurso = useRef(false);
  const [enviando, setEnviando] = useState(false);

  const enviarUmaVez = useCallback(async (envio: () => Promise<void>) => {
    if (emCurso.current) return;
    emCurso.current = true;
    setEnviando(true);
    try {
      await envio();
    } finally {
      emCurso.current = false;
      setEnviando(false);
    }
  }, []);

  return { enviando, enviarUmaVez };
}
