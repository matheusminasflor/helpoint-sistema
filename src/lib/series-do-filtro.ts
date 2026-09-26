// As séries que o filtro oferece — tiradas do DADO, não escritas na tela.
//
// Leva F (2026-09-26). O `<Select>` de série do Painel e da Bonificação tinha as
// duas séries escritas à mão:
//
//   <SelectItem value="1">Série 1 (venda faturada)</SelectItem>
//   <SelectItem value="75">Série 75 (o talão especial)</SelectItem>
//
// Hoje a base só tem essas duas, e por isso nada aparecia errado. Mas a coluna
// `serie` de `com_vendas_itens` é **texto livre** — ela vem do relatório do
// Forteplus, sem CHECK nenhum. No dia em que a Minasflor abrir um talão novo, a
// série nova aparece na tabela mês a mês e **não** no filtro: a pessoa vê a linha
// e não consegue isolá-la. Pior, o rótulo mentiria — "Série 1 (venda faturada)"
// escrito à mão continuaria ali mesmo se o significado mudasse.
//
// O achado 9 da auditoria da L6a já tinha registrado o parente disso: o rótulo da
// TABELA mentia para série diferente de 1/75. Ali foi corrigido; o filtro ficou.
//
// Por que um módulo próprio e não duas linhas em cada tela: porque são DUAS telas
// (`ComercialPainel` e `ComercialBonificacao`), e duas cópias da mesma lista é
// como a próxima série entra numa e não na outra. Regra pura, sem dependência,
// com Vitest — o mesmo motivo de `acesso-comercial.ts` e `ficha-resumo.ts`.

/** O que o dono chama cada série, quando é uma das duas conhecidas. */
const APELIDO: Record<string, string> = {
  '1': 'com nota fiscal',
  '75': 'sem nota fiscal, e cobrada',
};

export interface OpcaoDeSerie {
  /** O valor que vai para a RPC (`p_serie`). */
  valor: string;
  /** O que a pessoa lê no filtro. */
  rotulo: string;
}

/**
 * As opções do filtro de série, a partir das séries que APARECEM no período
 * carregado.
 *
 * Recebe as linhas do mês a mês (que já vêm com `serie`) em vez de fazer consulta
 * própria: a lista tem de ser a das séries que existem NA TELA, senão o filtro
 * oferece uma série que não tem linha nenhuma e a pessoa escolhe para ver vazio.
 *
 * Ordena por número quando dá, e alfabeticamente quando não dá — série é texto
 * livre, então `'1'`, `'75'` e `'ESPECIAL'` podem conviver. Ordem alfabética pura
 * poria `'75'` antes de `'1'`; ordem numérica pura quebraria em `'ESPECIAL'`.
 *
 * Série conhecida leva o apelido do dono; série nova aparece como "Série X", sem
 * inventar o que ela significa. Nomear o que não se sabe é como o rótulo da
 * tabela passou a mentir antes.
 */
export function opcoesDeSerie(linhas: { serie: string | null }[]): OpcaoDeSerie[] {
  const vistas = new Set<string>();
  for (const l of linhas) {
    const s = (l.serie ?? '').trim();
    if (s) vistas.add(s);
  }

  return [...vistas]
    .sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      const aNum = Number.isFinite(na);
      const bNum = Number.isFinite(nb);
      if (aNum && bNum) return na - nb;
      // Número antes de texto: '1' e '75' vêm antes de 'ESPECIAL'.
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b, 'pt-BR');
    })
    .map((valor) => ({
      valor,
      rotulo: APELIDO[valor] ? `Série ${valor} (${APELIDO[valor]})` : `Série ${valor}`,
    }));
}
