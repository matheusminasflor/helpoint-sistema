// A regra da casa, em uma linha: TODO relatório do Comercial e da Diretoria
// tem duas visões — simplificada (faróis e gráficos, para decidir) e
// analítica (a tabela inteira, para conferir). O dono, 2026-09-24: "Todos os
// relatórios Comercial e Diretoria ter opção simplório com dashboards e etc
// e analítico".
//
// A ficha do cliente é a primeira; as outras telas herdam este arquivo em vez
// de inventar cada uma o seu botãozinho. Por isso a escolha é guardada por
// CHAVE: cada relatório lembra a sua, e mudar a ficha não muda a Curva ABC.
//
// Onde fica guardada: `localStorage` do navegador de quem usa. É preferência
// de leitura, não dado do sistema — não vai para o banco, não atravessa
// dispositivos e, se o navegador recusar (janela anônima, storage bloqueado),
// a tela abre na visão padrão e segue funcionando. Toda leitura e escrita
// passa por try/catch por isso: `localStorage` LANÇA quando o site está sem
// permissão, e uma preferência de exibição não pode derrubar um relatório.

export type VisaoRelatorio = 'simplificado' | 'analitico';

/** Abre simplificado (decisão do dono, pergunta 1 do desenho de 2026-09-25): quem precisa do detalhe clica. */
export const VISAO_PADRAO: VisaoRelatorio = 'simplificado';

const PREFIXO = 'helpoint:visao:';

function ehVisao(valor: unknown): valor is VisaoRelatorio {
  return valor === 'simplificado' || valor === 'analitico';
}

export function lerVisao(chave: string): VisaoRelatorio {
  try {
    const bruto = window.localStorage.getItem(PREFIXO + chave);
    // Valor estranho (versão antiga, edição manual, outro sistema no mesmo
    // domínio) não vira erro nem tela vazia: vira o padrão.
    return ehVisao(bruto) ? bruto : VISAO_PADRAO;
  } catch {
    return VISAO_PADRAO;
  }
}

export function gravarVisao(chave: string, visao: VisaoRelatorio): void {
  try {
    window.localStorage.setItem(PREFIXO + chave, visao);
  } catch {
    // Sem permissão de storage a escolha vale só enquanto a tela estiver
    // aberta — aceitável para uma preferência de leitura, e melhor do que
    // quebrar o relatório.
  }
}
