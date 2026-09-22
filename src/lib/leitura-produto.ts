// A "leitura em texto" do detalhe do produto (§14 item 3 do
// docs/instrucoes-painel-comercial.md: "uma leitura em texto"). Ver
// .scratch/plano-l6e-simulador-e-tendencia.md §3.
//
// Regra pura com Vitest, montada de um switch sobre a situação — nunca
// concatenação solta dentro do JSX. Os números vêm da MESMA linha que
// `com_tendencia_produtos` já calculou para este produto (situação,
// variação, concentração, clientes): recalcular aqui seria a segunda
// implementação que a regra 11 do CLAUDE.md pede para nunca existir.
//
// Módulo sem import — nenhum `@/integrations/supabase` — pelo mesmo motivo
// de `src/lib/acesso-diretoria.ts` (regra 9 do CLAUDE.md).

export type SituacaoProduto = 'Novo' | 'Descontinuado' | 'Esporádico' | 'Crescendo' | 'Caindo' | 'Estável';

export interface DadosLeituraProduto {
  /** Nulo quando o período tem um único mês — ressalva 1 do §14: não existe tendência para ler. */
  situacao: SituacaoProduto | null;
  /** Nulo pela mesma razão de `situacao`, ou quando a 1ª metade é zero. */
  variacao: number | null;
  /** Ressalva 2 do §14: mais da metade do faturamento saiu num único mês. */
  concentrado: boolean;
  clientes: number;
}

function formatarVariacao(variacao: number): string {
  const percentual = Math.round(variacao * 100);
  return `${percentual >= 0 ? '+' : ''}${percentual}%`;
}

function fraseClientes(clientes: number): string {
  return `${clientes} ${clientes === 1 ? 'cliente' : 'clientes'} no período`;
}

/** A ressalva de concentração (§14), embutida em toda frase quando se aplica — nunca um adendo solto. */
function comConcentracao(frase: string, concentrado: boolean): string {
  if (!concentrado) return frase;
  return `${frase} Mais da metade do faturamento saiu num único mês — pode ser sazonalidade ou pedido pontual, não tendência.`;
}

/**
 * Monta a frase de leitura do produto. Com `situacao` nula (período de um
 * único mês, ressalva 1 do §14), a frase diz que não há tendência para
 * calcular — nunca inventa "Estável".
 */
export function leituraDoProduto(dados: DadosLeituraProduto): string {
  const clientesTexto = fraseClientes(dados.clientes);

  if (dados.situacao === null) {
    return comConcentracao(
      `Com um único mês selecionado não há tendência para calcular. ${clientesTexto}.`,
      dados.concentrado,
    );
  }

  const variacaoTexto = dados.variacao !== null ? formatarVariacao(dados.variacao) : null;

  switch (dados.situacao) {
    case 'Novo':
      return comConcentracao(
        `Produto novo: sem venda na 1ª metade do período e com venda na 2ª. ${clientesTexto}.`,
        dados.concentrado,
      );
    case 'Descontinuado':
      return comConcentracao(
        `Produto descontinuado: vendia na 1ª metade do período e zerou na 2ª. ${clientesTexto}.`,
        dados.concentrado,
      );
    case 'Esporádico':
      return comConcentracao(
        `Venda esporádica: poucos meses com movimento no período. ${clientesTexto}.`,
        dados.concentrado,
      );
    case 'Crescendo':
      return comConcentracao(
        `Crescendo: a 2ª metade do período ficou ${variacaoTexto} em relação à 1ª. ${clientesTexto}.`,
        dados.concentrado,
      );
    case 'Caindo':
      return comConcentracao(
        `Caindo: a 2ª metade do período ficou ${variacaoTexto} em relação à 1ª. ${clientesTexto}.`,
        dados.concentrado,
      );
    case 'Estável':
      return comConcentracao(
        `Estável: variação de ${variacaoTexto} entre as duas metades do período. ${clientesTexto}.`,
        dados.concentrado,
      );
  }
}

