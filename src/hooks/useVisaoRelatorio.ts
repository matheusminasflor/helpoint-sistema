// Estado + memória da escolha "Simplificado | Analítico" — ver
// `src/lib/visao-relatorio.ts` para o porquê e para onde a escolha é
// guardada, e `@/components/comercial/SeletorVisao` para o botão.
//
// Mora em `src/hooks/` e não ao lado do componente por causa do Fast Refresh:
// um arquivo que exporta componente E função perde o recarregamento a quente
// (regra `react-refresh/only-export-components`, que o lint acusa).
import { useCallback, useState } from 'react';
import { gravarVisao, lerVisao, type VisaoRelatorio } from '@/lib/visao-relatorio';

/**
 * `useState` com inicializador de FUNÇÃO (não `useState(lerVisao(chave))`):
 * a leitura do storage acontece na montagem, não a cada render.
 *
 * `lembrar: false` troca a visão SEM mudar o padrão de quem clicou. Existe
 * por causa do "ver todos os 103 no analítico" da ficha: isso é um pedido
 * para ver uma lista agora, não uma decisão sobre como a próxima ficha deve
 * abrir. Só o botão Simplificado/Analítico é uma decisão, e só ele grava
 * (achado da auditoria de 2026-09-25).
 */
export function useVisaoRelatorio(
  chave: string,
  /** Ver `lerVisao`: tela de leitura abre simplificada, tela de trabalho abre analítica. */
  padrao?: VisaoRelatorio,
): [VisaoRelatorio, (v: VisaoRelatorio, opcoes?: { lembrar?: boolean }) => void] {
  const [visao, setVisaoLocal] = useState<VisaoRelatorio>(() => lerVisao(chave, padrao));
  const setVisao = useCallback((v: VisaoRelatorio, opcoes?: { lembrar?: boolean }) => {
    setVisaoLocal(v);
    if (opcoes?.lembrar !== false) gravarVisao(chave, v);
  }, [chave]);
  return [visao, setVisao];
}
