// Visão "Clientes" da Diretoria (§14 itens 4 e 5 do documento do dono,
// item 3 do plano da Frente 3): faturamento por cliente (todos, sem filtro
// de faixa) e evolução por faixa A/B/C mês a mês — as duas são "todos os
// clientes", e por isso vivem juntas aqui. Clicar num cliente abre a ficha
// AQUI DENTRO (`?cliente=CODIGO`), não no Comercial — achado da correção da
// auditoria: um diretor puro não tem "Insights do Comercial" no menu, então
// a porta única não pode jogar a navegação para um módulo que ele não vê.
// `FichaClienteSecao` é o mesmo componente que `ComercialClientes.tsx`
// usa, extraído para `@/components/comercial/FichaCliente` — mesma ficha
// dos dois lados, nunca uma cópia.
//
// Backend já existia (`com_faturamento_por_cliente`, `com_evolucao_por_
// faixa`) — esta leva constrói a tela. Cor/intensidade e o layout de barra
// empilhada da evolução são a Frente 4; aqui a tabela é texto, funcional.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { FichaClienteSecao } from '@/components/comercial/FichaCliente';
// §3 do plano da Frente 4 (e a correção da auditoria, item 1): a mesma
// correspondência faixa → cor que o Comercial já usa, importada em vez de
// duplicada — duas cópias da mesma tabela é como A e B viraram a mesma cor
// da primeira vez. FAIXA_BARRA (não FAIXA_BADGE) porque a barra precisa da
// metade escura do par para ter contraste — ver comercial-insights.ts.
import { FAIXA_BARRA } from '@/config/comercial-insights';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { Skeleton } from '@/components/ui/skeleton';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import {
  useAnoComVenda, useEvolucaoPorFaixa, useFaturamentoPorCliente, usePeriodoComercial, useRankingClientes,
} from '@/hooks/useComercialPainel';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL } from '@/types/financeiro';
import type { CriterioCurva, EvolucaoPorFaixaMes, FaixaCurva, Filial, RankingCliente } from '@/types/comercial';

export default function DiretoriaClientes() {
  // Simplificado × analítico (leva E). Tela de LER: abre simplificada.
  const [visao, setVisao] = useVisaoRelatorio('diretoria-clientes');
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  // §6 do plano da Frente 4: barra é o padrão, números é a alternativa —
  // nunca o contrário, e a coluna Total continua nos dois modos.
  const [modoEvolucao, setModoEvolucao] = useState<'barras' | 'numeros'>('barras');
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get('cliente');

  const { data: faturamento, isLoading: carregandoFaturamento } = useFaturamentoPorCliente(de, ate, filial, criterio);
  const { data: evolucao, isLoading: carregandoEvolucao } = useEvolucaoPorFaixa(de, ate, filial, criterio);
  // O TOP 10 COM A PARTICIPAÇÃO vem de `com_ranking_clientes`, que JÁ calcula a
  // participação de cada cliente sobre o total do período — no banco, sobre a
  // base inteira. Somar `faturamento.linhas` aqui para achar o total daria um
  // número menor sempre que a lista fosse cortada pelo teto de 500, e sem nada
  // acusar: é a família de defeito que este repositório mais persegue. A RPC já
  // existia e alimenta "maiores compradores" na tela de Vendas.
  const ranking = useRankingClientes(de, ate, filial, null, 10);

  const linhasFaturamento = faturamento?.linhas ?? [];
  const linhasEvolucao = evolucao?.linhas ?? [];

  // Montados uma vez; renderizados acima da lista OU dentro da ficha.
  const filtros = (
    <>
      <FiltrosComerciais
        ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
        periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
      />
      <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="valor">Por valor</SelectItem>
          <SelectItem value="quantidade">Por quantidade</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

  const escolherCliente = (codigo: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set('cliente', codigo);
    setParams(proximos, { replace: true });
  };
  const limparCliente = () => {
    const proximos = new URLSearchParams(params);
    proximos.delete('cliente');
    setParams(proximos, { replace: true });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Users}
        title="Clientes"
        description={visao === 'simplificado'
          ? 'Quem carrega o faturamento, e quanto dele depende de poucos nomes.'
          : 'Faturamento por cliente e evolução por faixa A/B/C — todos os clientes, sem filtro de faixa.'}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {/* O seletor de visão só na LISTA: com a ficha aberta, quem manda na
            visão é a ficha, que tem a sua própria chave. */}
        {!clienteSelecionado && (
          <div className="flex justify-end">
            <SeletorVisao visao={visao} onChange={setVisao} />
          </div>
        )}
        {/* Etapa 3: com a ficha aberta os mesmos seletores são renderizados
            DENTRO dela — um estado só, em dois lugares possíveis. */}
        {!clienteSelecionado && <div className="flex flex-wrap items-center gap-3">{filtros}</div>}

        {clienteSelecionado ? (
          <FichaClienteSecao
            codigo={clienteSelecionado}
            de={de}
            ate={ate}
            filial={filial}
            criterio={criterio}
            onFechar={limparCliente}
            filtros={filtros}
          />
        ) : visao === 'simplificado' ? (
          <ResumoDeClientes
            ranking={ranking} criterio={criterio} onEscolher={escolherCliente}
            onVerTudo={() => setVisao('analitico', { lembrar: false })}
          />
        ) : (
          <>
        {/* §14 item 4. */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Faturamento por cliente</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold">Tabela</th>
                <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
                {/* Um número só: tudo que saiu sem cobrança nas duas séries.
                    Cashback e publicidade estão aqui dentro — a série não os
                    separa (98,7% da série 1 é produto que também se vende) e
                    o CFOP também não (5910 e 6910 são dentro/fora do estado,
                    não finalidade). */}
                <th className="px-3 py-1.5 font-semibold text-right" title="Tudo que saiu sem cobrança, nas duas séries">Bonificação</th>
                <th className="px-3 py-1.5 font-semibold text-right">SKUs</th>
                <th className="px-3 py-1.5 font-semibold text-right">Meses ativos</th>
              </tr>
            </thead>
            <tbody>
              {linhasFaturamento.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => escolherCliente(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>{limparNomeCliente(c.nome)}</button>
                    {c.em_condicao && <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.tabela_preco ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.faturamento)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.bonificacao)}</td>
                  <td className="px-3 py-1.5 text-right">{c.skus}</td>
                  <td className="px-3 py-1.5 text-right">{c.meses_ativos}</td>
                </tr>
              ))}
              {!carregandoFaturamento && linhasFaturamento.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {faturamento?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>

        {/* §14 item 5 — barra empilhada A/B/C/fora da curva por mês, com
            alternância para números (Frente 4, §6 do plano). */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-semibold">Evolução por faixa, mês a mês</span>
            <div className="flex rounded-md border border-border overflow-hidden">
              <Button
                type="button"
                variant={modoEvolucao === 'barras' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none h-7 px-3 text-[11px]"
                onClick={() => setModoEvolucao('barras')}
              >
                Barras
              </Button>
              <Button
                type="button"
                variant={modoEvolucao === 'numeros' ? 'default' : 'ghost'}
                size="sm"
                className="rounded-none h-7 px-3 text-[11px]"
                onClick={() => setModoEvolucao('numeros')}
              >
                Números
              </Button>
            </div>
          </div>
          {/* §3 do plano, corrigido pela auditoria (item 3): a legenda
              pinta as amostras do MESMO FAIXA_BARRA que a barra usa, em vez
              de descrever a cor em prosa — legenda que se pinta do mesmo
              mapa não pode mentir sobre a cor; escrita à mão podia. */}
          <div className="px-4 py-2 flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground border-b border-border">
            <span>Cores:</span>
            {FAIXAS_LEGENDA.map(([faixa, rotulo]) => (
              <span key={faixa} className="flex items-center gap-1">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${FAIXA_BARRA[faixa]}`} aria-hidden="true" />
                {rotulo}
              </span>
            ))}
            <span>— as mesmas da tela Vendas. Passe o mouse na barra para os valores do mês.</span>
          </div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
                <th className="px-3 py-1.5 font-semibold">Por mês (A / B / C / fora da curva)</th>
              </tr>
            </thead>
            <tbody>
              {linhasEvolucao.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <button type="button" onClick={() => escolherCliente(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>{limparNomeCliente(c.nome)}</button>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.total)}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {modoEvolucao === 'barras' ? (
                      // §2 do plano, corrigido pela auditoria (item 2): vão
                      // de 2px entre colunas — doze colunas de ~10px dão
                      // ~145px, cabem na célula.
                      <div className="flex flex-wrap items-start gap-0.5">
                        {c.meses.map((m) => <BarraFaixaMes key={m.competencia} mes={m} />)}
                      </div>
                    ) : (
                      c.meses.map((m) => (
                        <span key={m.competencia} className="inline-block mr-3 whitespace-nowrap">
                          {m.competencia.slice(0, 7)}: {formatBRL(m.valor_a)} / {formatBRL(m.valor_b)} / {formatBRL(m.valor_c)}
                          {m.valor_outros !== 0 && ` / ${formatBRL(m.valor_outros)}`}
                        </span>
                      ))
                    )}
                  </td>
                </tr>
              ))}
              {!carregandoEvolucao && linhasEvolucao.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {evolucao?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}

/** As amostras da legenda (item 3 da correção) — mesma ordem da barra. */
const FAIXAS_LEGENDA: [FaixaCurva, string][] = [
  ['A', 'A (verde)'],
  ['B', 'B (âmbar)'],
  ['C', 'C (cinza)'],
  ['-', 'fora da curva (vermelho)'],
];

/**
 * Uma barra empilhada A/B/C/fora da curva de um único mês (§14 item 5;
 * Frente 4, §6 do plano — corrigida pela auditoria, itens 1, 2 e 9).
 *
 * Coluna vertical, não tira horizontal: 22px úteis não cabem quatro
 * segmentos quando uma faixa leva 90% do mês (caso comum) — o navegador
 * arredonda o resto a zero. Uma coluna de ~32px de altura por ~10px de
 * largura, empilhada de cima para baixo (A no topo), tem espaço de sobra.
 *
 * A altura de cada segmento divide pela soma só dos POSITIVOS mostrados,
 * não pelo total com sinal: `valor_outros` pode ser negativo (devolução), e
 * dividir pelo total com sinal fazia as proporções passarem de 100% — o
 * `overflow-hidden` cortava o último segmento em silêncio. O `title`
 * continua com os quatro valores com sinal; é lá que a devolução aparece.
 *
 * Sem ramo `total <= 0` separado e sem `.filter()` antes do `.map()`: o
 * próprio `map` decide por segmento (item 9) — mês sem nenhum positivo
 * mostrado (`somaPositivos <= 0`) some para um fundo neutro, sem dividir
 * por zero.
 *
 * O número do mês (achado 3.9) fica escrito abaixo da coluna — doze
 * quadrados idênticos não dizem qual é janeiro sem o mouse.
 */
/**
 * A VISÃO SIMPLIFICADA da Diretoria → Clientes (leva E, 2026-09-26).
 *
 * A pergunta do diretor não é "quanto cada um dos 113 clientes comprou" — é
 * **de quantas pessoas o faturamento depende**. Um cliente que sai levando 12%
 * da receita é uma conversa; 113 linhas ordenadas não dizem isso em lugar nenhum.
 *
 * Os dez com a participação de cada um, e a soma deles contra o resto. A
 * participação vem de `com_ranking_clientes`, calculada **no banco sobre a base
 * inteira** — somar as linhas carregadas daria menos que a verdade toda vez que a
 * lista fosse cortada pelo teto, sem nada acusar.
 *
 * A barra é a única "figura" desta visão, e é de propósito: ela responde a
 * pergunta inteira de um olhar, e o gráfico de evolução por faixa continua a um
 * clique, no analítico, onde o alternador barras/números dele já mora.
 */
function ResumoDeClientes({
  ranking, criterio, onEscolher, onVerTudo,
}: {
  ranking: { data?: RankingCliente[]; isLoading: boolean; isError: boolean };
  criterio: CriterioCurva;
  onEscolher: (codigo: string) => void;
  onVerTudo: () => void;
}) {
  if (ranking.isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
        <strong>Não consegui ler o faturamento por cliente.</strong> Isto não quer dizer que não houve
        venda no período — recarregue a página.
      </div>
    );
  }
  if (ranking.isLoading) return <Skeleton className="h-72 w-full" />;

  const linhas = ranking.data ?? [];
  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
        Sem venda no período selecionado.
      </div>
    );
  }

  // `participacao` já vem em % do banco. Somar as DEZ é legítimo — são dez
  // percentuais da mesma base, não uma amostra de lista cortada.
  const pesoDosDez = Math.min(linhas.reduce((s, c) => s + c.participacao, 0), 100);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[12px] text-muted-foreground">
          Os {linhas.length} maiores clientes do período
        </div>
        <div className="mt-1 text-xl font-semibold font-mono">{pesoDosDez.toFixed(1)}%</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          do faturamento do período está nestes {linhas.length} nomes
          {criterio === 'quantidade' && ' (por quantidade, não por valor)'}.
        </p>
        {/* A figura: o peso dos dez contra o resto, numa barra só. */}
        <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="bg-status-warning" style={{ width: `${pesoDosDez}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
          <span>os {linhas.length} maiores</span>
          <span>todos os outros — {(100 - pesoDosDez).toFixed(1)}%</span>
        </div>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-4 py-2 text-[13px] font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" aria-hidden="true" />
          Quem carrega o período
        </div>
        <ul>
          {linhas.map((c) => (
            <li key={c.cliente_codigo} className="px-4 py-2 text-[12px] border-t border-border">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  <button type="button" onClick={() => onEscolher(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>
                    {limparNomeCliente(c.nome)}
                  </button>
                  {c.tabela_preco && <span className="ml-1.5 text-[10px] text-muted-foreground">{c.tabela_preco}</span>}
                </span>
                <span className="font-mono shrink-0">
                  {formatBRL(c.faturamento)}
                  <span className="ml-2 text-muted-foreground">{c.participacao.toFixed(1)}%</span>
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                {/* Escala relativa ao PRIMEIRO, não aos 100%: com o maior em 12%
                    todas as barras ficariam invisíveis se a régua fosse o total. */}
                <div className="h-full bg-primary" style={{ width: `${(c.participacao / linhas[0].participacao) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onVerTudo}
          className="w-full px-4 py-2 text-[12px] text-primary hover:underline border-t border-border text-left"
        >
          Ver todos os clientes e a evolução por faixa no analítico
        </button>
      </div>
    </div>
  );
}

function BarraFaixaMes({ mes }: { mes: EvolucaoPorFaixaMes }) {
  const titulo = `${mes.competencia.slice(0, 7)} — A: ${formatBRL(mes.valor_a)} · B: ${formatBRL(mes.valor_b)} · C: ${formatBRL(mes.valor_c)} · Fora da curva: ${formatBRL(mes.valor_outros)}`;
  const numeroMes = Number(mes.competencia.slice(5, 7));

  const segmentos: { faixa: 'A' | 'B' | 'C' | '-'; valor: number }[] = [
    { faixa: 'A', valor: mes.valor_a },
    { faixa: 'B', valor: mes.valor_b },
    { faixa: 'C', valor: mes.valor_c },
    { faixa: '-', valor: mes.valor_outros },
  ];
  const somaPositivos = segmentos.reduce((soma, s) => (s.valor > 0 ? soma + s.valor : soma), 0);

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className={`flex flex-col w-2.5 h-8 rounded-sm overflow-hidden border border-border ${somaPositivos <= 0 ? 'bg-secondary/60' : ''}`}
        title={titulo}
      >
        {somaPositivos > 0 && segmentos.map((s) => s.valor > 0 && (
          <div key={s.faixa} className={FAIXA_BARRA[s.faixa]} style={{ height: `${(s.valor / somaPositivos) * 100}%` }} />
        ))}
      </div>
      <span className="text-[9px] leading-none text-muted-foreground">{numeroMes}</span>
    </div>
  );
}
