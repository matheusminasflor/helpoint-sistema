// AS CAIXAS do faturamento, desenhadas UMA vez — o Comercial (Vendas) e a
// Diretoria (Conciliação) mostram este mesmo bloco, lendo a mesma função
// (`com_caixas`).
//
// Pedido do dono, 2026-09-25: "o relatório de insights comercial e diretor
// precisa estar 100% preciso e funcional. Me preocupo com os dados fugirem da
// realidade. O diretor e o comercial precisam saber quanto foi faturado, o que
// foi de bonificação, o que foi de cashback."
//
// POR QUE UM COMPONENTE, E NÃO DUAS CÓPIAS. O dono não pergunta "quanto deu no
// Comercial" e "quanto deu na Diretoria" — ele pergunta quanto deu. Duas telas
// desenhando as mesmas caixas por conta própria divergem na primeira vez que
// alguém corrigir uma só, e a divergência não aparece como erro: aparece como
// dois números, os dois plausíveis. Foi assim que a curva e o painel
// discordaram antes (docs/nao-funciona.md).
//
// O QUE ESTE BLOCO GARANTE QUE NENHUMA TELA GARANTIA: nada de dinheiro fica
// invisível. `industrializacao` e `outros` existiam no banco e não tinham caixa
// em tela nenhuma — R$ 243.989,69 na base de teste. Aqui elas aparecem quando
// são diferentes de zero, e a linha de fechamento diz o total importado para
// quem quiser conferir com a soma.
import { AlertTriangle, BarChart3, Gift, TrendingUp, Users } from 'lucide-react';
import { formatBRL } from '@/types/financeiro';
import type { CaixasDoFaturamento, Serie } from '@/types/comercial';

interface Props {
  caixas: CaixasDoFaturamento | undefined;
  /**
   * A série escolhida no filtro da tela, quando ela tem um. NÃO filtra número
   * nenhum aqui — apenas DESTACA a metade da venda que a pessoa escolheu.
   *
   * É de propósito, e é a mesma decisão que o gráfico do ano inteiro já tomou
   * ("com o período selecionado destacado", §11 do documento do dono): filtrar
   * por série zeraria uma das duas caixas de venda e as caixas deixariam de
   * somar o total importado — que é a única coisa que este bloco existe para
   * provar na tela.
   */
  serieDestacada?: Serie | null;
  /** O rótulo da janela, para a linha de fechamento ("neste período", "em 2026"). */
  janela?: string;
}

export function CaixasDoPeriodo({ caixas, serieDestacada = null, janela = 'neste período' }: Props) {
  const c = caixas;
  const venda = c?.venda_total ?? 0;
  const bonificacao = c?.bonificacao ?? 0;
  // A régua do painel antigo do dono: "acima de 25% sobre a venda merece
  // conversa". O numerador é TODA a remessa gratuita, das duas séries — o
  // cashback e o que a Minasflor chama de publicidade estão dentro, e não há
  // como separá-los no que o Forteplus exporta (medido na base inteira em
  // 2026-09-25; ver a migration 20261026050000_publicidade_sai.sql).
  const bonificacaoSobreVenda = venda > 0 ? (bonificacao / venda) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <TrendingUp className="w-4 h-4" aria-hidden="true" />Faturamento
          </div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(venda)}</div>
          {/* As duas metades da venda, sempre as duas. A série 75 é venda sem
              nota fiscal e é COBRADA do mesmo jeito (regra do dono,
              2026-09-25) — as duas são faturamento. Na planilha que o diretor
              mantém à mão só entra a primeira: em 2026 são R$ 401.302,64 de
              venda real que ele não registra, e é por isso que este número
              não pode aparecer escondido atrás de um filtro. */}
          <div className="mt-1 grid grid-cols-2 gap-1 text-[11px]">
            <MetadeDaVenda
              rotulo="com nota"
              valor={c?.venda_com_nota ?? 0}
              destacada={serieDestacada === '1'}
            />
            <MetadeDaVenda
              rotulo="sem nota"
              valor={c?.venda_sem_nota ?? 0}
              destacada={serieDestacada === '75'}
            />
          </div>
          {/* A devolução só aparece quando existe. A base da Minasflor não tem
              NENHUMA em quatro anos (confirmado pelo dono, 2026-09-25), então
              hoje esta linha nunca desenha — e no dia em que a primeira chegar,
              ela aparece sem ninguém precisar mexer aqui. */}
          {(c?.devolucao ?? 0) > 0 && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              − {formatBRL(c!.devolucao)} em devolução · líquido {formatBRL(c!.faturamento_liquido)}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div
            className="flex items-center gap-2 text-[12px] text-muted-foreground"
            title="Remessa gratuita, nas duas séries — o cashback e a publicidade estão dentro, e o relatório do Forteplus não traz como separar."
          >
            <Gift className="w-4 h-4" aria-hidden="true" />Bonificação
          </div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(bonificacao)}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {bonificacaoSobreVenda.toFixed(1)}% sobre a venda
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <Users className="w-4 h-4" aria-hidden="true" />Clientes ativos
          </div>
          <div className="mt-1 text-xl font-semibold font-mono">{c?.clientes_ativos ?? 0}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">quem comprou — receber de graça não conta</div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
            <BarChart3 className="w-4 h-4" aria-hidden="true" />SKUs vendidos
          </div>
          <div className="mt-1 text-xl font-semibold font-mono">{c?.skus_vendidos ?? 0}</div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            {(c?.unidades_vendidas ?? 0).toLocaleString('pt-BR')} unidades vendidas
          </div>
        </div>
      </div>

      {/* A LINHA DE FECHAMENTO. Diz o total que entrou pela importação e nomeia
          o que não é venda nem bonificação, quando existe. Sem ela, uma pessoa
          que some as caixas e não chegue ao total não tem como saber se falta
          uma caixa ou se ela somou errado. */}
      <p className="text-[11px] text-muted-foreground">
        Do relatório do Forteplus entraram <span className="font-mono">{formatBRL(c?.total_importado ?? 0)}</span> {janela}
        {(c?.industrializacao ?? 0) > 0 && (
          <>, dos quais <span className="font-mono">{formatBRL(c!.industrializacao)}</span> de industrialização (remessa para industrializar, que não é venda)</>
        )}
        {(c?.outros ?? 0) > 0 && (
          <>, e <span className="font-mono">{formatBRL(c!.outros)}</span> em CFOP que o sistema não reconhece</>
        )}
        . As caixas acima somam exatamente esse total.
      </p>

      {/* A SOBRA. Zero em todo cenário conhecido — e é por isso que ela está
          aqui: o teste `comercial_caixas_fecham.test.sql` reprova antes de
          chegar nesta tela, então se este aviso aparecer é porque alguém mudou
          o banco por fora da migration. Melhor gritar do que esconder. */}
      {(c?.fora_das_caixas ?? 0) !== 0 && (
        <p className="flex items-start gap-1.5 text-[11px] text-status-danger">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" aria-hidden="true" />
          <span>
            <span className="font-mono">{formatBRL(Math.abs(c!.fora_das_caixas))}</span> importados não entraram em
            nenhuma caixa. O número acima está incompleto — avise a TI antes de usar este relatório.
          </span>
        </p>
      )}
    </div>
  );
}

function MetadeDaVenda({ rotulo, valor, destacada }: { rotulo: string; valor: number; destacada: boolean }) {
  return (
    <div className={`rounded px-1.5 py-0.5 ${destacada ? 'bg-primary/10 text-foreground font-medium' : 'text-muted-foreground'}`}>
      <div>{rotulo}</div>
      <div className="font-mono">{formatBRL(valor)}</div>
    </div>
  );
}
