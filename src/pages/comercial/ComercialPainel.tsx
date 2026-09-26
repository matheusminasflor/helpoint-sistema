// Vendas (L6a, fundida com a Curva ABC na Frente 3) — a porta do módulo.
// Sobe as planilhas do Forteplus e vê o faturamento aparecer; ver
// `.scratch/plano-painel-comercial.md` e `.scratch/plano-frente3-
// organizacao.md`.
//
// §11 do documento do dono descreve UMA página, em rolagem, com um filtro
// no topo — nunca abas. Antes desta leva, Vendas e Curva ABC eram rotas
// (visões) separadas: o "ficar entrando em cada aba" que ele reclamou
// nasceu daí. Esta página junta as duas: indicadores, o ano mês a mês,
// maiores compradores, a curva completa (Pareto) e todos os produtos por
// faixa, nesta ordem — como no painel original dele.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { CaixasDoPeriodo } from '@/components/comercial/CaixasDoPeriodo';
import {
  useAnoComVenda, useCaixas, useCurvaAbc, useCurvaAbcFaixas, useFaturamentoMensal, usePeriodoComercial,
  usePeriodoImportado, useRankingClientes, useUltimasImportacoes,
} from '@/hooks/useComercialPainel';
import { useTenantPath } from '@/hooks/useTenantPath';
import { CfopForaDaCurva } from '@/components/comercial/CfopForaDaCurva';
import { FAIXA_BADGE, NOTA_CURVA_POR_QUANTIDADE, linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, competenceLabel, formatDateBR } from '@/types/financeiro';
import type { CriterioCurva, FaixaCurva, Filial, Serie } from '@/types/comercial';

const FAIXA_TITULO: Record<FaixaCurva, string> = {
  A: 'A — até 80% do acumulado',
  B: 'B — até 95% do acumulado',
  C: 'C — acima de 95%',
  '-': 'Fora da curva (saldo líquido ≤ 0 no período)',
};

export function ComercialPainel() {
  // Os anos que existem de verdade (pedido do dono, 2026-09-21): nunca uma
  // janela fixa — o go-live importa de 2022 até hoje, e uma janela fixa
  // deixaria os anos mais antigos gravados e inalcançáveis na tela. Sem
  // nenhuma importação ainda, a lista volta vazia e o seletor mostra só o
  // ano corrente. `useAnoComVenda` (achado 7 da auditoria da L6c) reúne o
  // ano, a lista e o reajuste — a mesma cópia existia nas cinco telas do
  // Insights.
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  // O seletor de período (§14, correção D2 da L6e) chega em Vendas com a
  // Frente 3: a migration deu p_de/p_ate para com_painel_totais e
  // com_faturamento_mensal justamente para isto — sem ele, fundir com a
  // Curva ABC deixaria o topo da página (indicadores) surdo ao período que
  // o meio (a curva) já respondia.
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);
  // Frente 6 (.scratch/plano-frente6-importacoes.md §2): os botões de
  // importar saíram desta tela — só resta o caminho para quem procurar
  // aqui e não achar mais o botão (abaixo, no rodapé e no estado vazio).
  const tenantPath = useTenantPath();

  // "O ano mês a mês" (seção 2 do §11) é sempre o ANO INTEIRO, com o período
  // escolhido destacado — não filtrado por ele. Filtrar aqui faria a tabela
  // do meio da página sumir com os meses fora do período, que é exatamente
  // o gráfico que a seção pede ("com o período selecionado destacado").
  const { data: meses, isLoading } = useFaturamentoMensal(ano, filial, serie);
  const { data: ultimas } = useUltimasImportacoes();
  // §5 da Frente 1 (pedido do dono): a verdade sobre o que está PUBLICADO,
  // nunca sobre a última importação — as duas linhas do rodapé respondem
  // perguntas diferentes.
  const { data: periodoImportado } = usePeriodoImportado(filial);

  const ultimaVendas = ultimas?.find((i) => i.tipo === 'vendas');

  // Maiores compradores agora segue o período escolhido, não mais o ano
  // inteiro fixo — é a mesma correção que esta leva aplica ao resto da
  // página: uma seleção de período que só metade da tela escuta é pior que
  // não ter seletor nenhum.
  const { data: ranking } = useRankingClientes(de, ate, filial, serie, 20);

  // Os indicadores do topo vêm de `com_caixas`, nunca somados a partir de
  // `meses` (achado 1 da auditoria: `count(distinct …)` não se soma entre grupos
  // de mês/filial/série — somar dava 129 clientes onde a verdade era 58), e
  // respondem ao período (seção 1 do §11: "Indicadores do período").
  //
  // Era `usePainelTotais` até 2026-09-25. As duas funções concordam — o pgTAP
  // prende isso em `comercial_caixas_fecham.test.sql` — e `com_painel_totais`
  // continua existindo para quem precisa de uma série só. O que a nova traz e a
  // antiga não: a venda separada por série, as duas classes que não tinham caixa
  // em tela nenhuma, e o total importado da janela para conferir a soma.
  //
  // Repare que `serie` NÃO entra aqui. É a mesma decisão do gráfico do ano
  // inteiro: a série destaca, não filtra — ver o comentário de `CaixasDoPeriodo`.
  const { data: caixas } = useCaixas(ano, filial, de, ate);
  // O rótulo da janela na linha de fechamento, na linguagem do seletor: "no ano
  // de 2026" quando é o ano inteiro, "no período escolhido" quando não é.
  const rotuloDaJanela = periodo === 'ano' ? `no ano de ${ano}` : 'no período escolhido';

  // A curva (antiga visão própria, fundida aqui): mesma conta do banco,
  // nunca somada ou classificada em TypeScript (§4.7 do plano da L6a).
  const { data: curva, isLoading: carregandoCurva } = useCurvaAbc(de, ate, filial, criterio);
  const { data: faixas } = useCurvaAbcFaixas(de, ate, filial, criterio);
  const linhasCurva = curva?.linhas ?? [];
  const classificadas = linhasCurva.filter((l) => l.faixa !== '-');
  const contagemPorFaixa: Record<FaixaCurva, number> = { A: 0, B: 0, C: 0, '-': 0 };
  for (const f of faixas ?? []) contagemPorFaixa[f.faixa] = f.produtos;
  const dadosGrafico = classificadas.slice(0, 20).map((l) => ({
    nome: l.nome.length > 18 ? `${l.nome.slice(0, 18)}…` : l.nome,
    metrica: criterio === 'valor' ? l.valor : l.quantidade,
    acumulado: l.acumulado ?? 0,
  }));
  const formatarMetrica = (v: number) => (criterio === 'valor' ? formatBRL(v) : v.toLocaleString('pt-BR'));

  const semImportacaoNenhuma = !isLoading && (meses ?? []).length === 0 && !ultimaVendas;

  // Destaque do período escolhido na tabela do ano inteiro — comparação de
  // string funciona porque as duas pontas são datas ISO (`YYYY-MM-DD`).
  const dentroDoPeriodo = (competencia: string) => competencia >= de && competencia <= ate;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Vendas</h1>
          <p className="text-[13px] text-muted-foreground">Faturamento, curva ABC e clientes — a partir do relatório do Forteplus.</p>
        </div>
      </div>

      {semImportacaoNenhuma ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Nenhuma planilha importada ainda. Importe o relatório de vendas do Forteplus em{' '}
          <Link to={tenantPath('/configuracoes/importacoes')} className="font-medium text-primary hover:underline">
            Configurações → Importações
          </Link>{' '}
          para o painel aparecer.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <FiltrosComerciais
              ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
              periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
            />
            <Select value={serie ?? 'todas'} onValueChange={(v) => setSerie(v === 'todas' ? null : (v as Serie))}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Série" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">As duas séries</SelectItem>
                <SelectItem value="1">Série 1 (venda faturada)</SelectItem>
                <SelectItem value="75">Série 75 (o talão especial)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="valor">Curva por valor</SelectItem>
                <SelectItem value="quantidade">Curva por quantidade</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* A ressalva do filtro de série, escrita só quando ele está em uso.
              Os indicadores do topo mostram SEMPRE as duas séries, porque é a
              soma delas que fecha contra o total importado — o filtro destaca
              a metade escolhida e recorta a curva e as listas. Sem esta frase,
              a pessoa vê "Faturamento" com as duas séries e a tabela logo
              abaixo com uma, e conclui que um dos dois está errado.

              A CURVA NÃO ENTRA na lista abaixo porque ela não escuta o filtro:
              `com_curva_abc` não tem `p_serie` (conferido em 2026-09-25, e
              anotado em docs/nao-funciona.md). Escrever "e a curva" aqui faria
              a tela prometer um recorte que não acontece. */}
          {serie != null && (
            <p className="text-[11px] text-muted-foreground -mt-3">
              A série {serie} está <strong>destacada</strong> nos indicadores, não filtrada: eles mostram sempre as duas,
              porque a soma das duas é o que fecha com o total importado. O filtro vale para a tabela mês a mês e para os
              maiores compradores.
            </p>
          )}

          {/* 1. Indicadores do período (§11 seção 1) — AS CAIXAS, desenhadas
              pelo componente que a Diretoria usa também. O que mudou nesta
              leva: a venda aparece separada por série (com nota × sem nota) sem
              precisar mexer no filtro, e o dinheiro que não é venda nem
              bonificação — industrialização e CFOP desconhecido — deixou de ser
              invisível. Ver `com_caixas` e o comentário do componente. */}
          <CaixasDoPeriodo caixas={caixas} serieDestacada={serie} janela={rotuloDaJanela} />

          {/* 2. O ano mês a mês, com o período destacado (§11 seção 2). */}
          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">O ano mês a mês</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Competência</th>
                  <th className="px-3 py-1.5 font-semibold">Filial</th>
                  <th className="px-3 py-1.5 font-semibold">Série</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Venda</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Devolução</th>
                  <th
                    className="px-3 py-1.5 font-semibold text-right"
                    title="Remessa gratuita — cashback e publicidade estão dentro, sem como separar."
                  >
                    Bonificação
                  </th>
                  <th className="px-3 py-1.5 font-semibold text-right">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {(meses ?? []).map((m, idx) => (
                  <tr key={idx} className={`border-t border-border ${dentroDoPeriodo(m.competencia) ? 'bg-primary/5' : ''}`}>
                    <td className="px-3 py-1.5">{competenceLabel(m.competencia)}</td>
                    <td className="px-3 py-1.5">{m.filial}</td>
                    {/* Achado 9 da auditoria: o rótulo mentia para série
                        diferente de '1'/'75' — `serie` é texto livre vindo
                        do arquivo, sem check no banco. Rotular pelo valor
                        real: uma série nova aparece como "Série X", nunca
                        como "Série 1" mentido. */}
                    <td className="px-3 py-1.5">{`Série ${m.serie}`}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.venda)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.devolucao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(m.bonificacao)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatBRL(m.liquido)}</td>
                  </tr>
                ))}
                {(meses ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-4 text-center text-muted-foreground">Sem movimento em {ano}.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Maiores compradores</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Cliente</th>
                  <th className="px-3 py-1.5 font-semibold">Tabela</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
                </tr>
              </thead>
              <tbody>
                {(ranking ?? []).map((r) => (
                  <tr key={r.cliente_codigo} className="border-t border-border">
                    {/* Item 2 do plano: todo nome de cliente é a porta única para a ficha. */}
                    <td className="px-3 py-1.5">
                      <Link to={linkFichaCliente(r.cliente_codigo)} className="text-primary hover:underline" title={r.nome}>{limparNomeCliente(r.nome)}</Link>
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.tabela_preco ?? '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(r.faturamento)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{r.participacao.toFixed(1)}%</td>
                  </tr>
                ))}
                {(ranking ?? []).length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <CfopForaDaCurva de={de} ate={ate} />

          {criterio === 'quantidade' && (
            <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
              {NOTA_CURVA_POR_QUANTIDADE}
            </p>
          )}

          {/* 4. A curva completa — Pareto com todos os SKUs do período (§11 seção 4). */}
          {!carregandoCurva && linhasCurva.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
              Sem venda no período selecionado para a curva.
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {(['A', 'B', 'C', '-'] as FaixaCurva[]).map((faixa) => (
                  <div key={faixa} className="rounded-lg border border-border bg-card p-4">
                    <div className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${FAIXA_BADGE[faixa]}`}>
                      {faixa === '-' ? 'Fora da curva' : `Faixa ${faixa}`}
                    </div>
                    <div className="mt-1 text-xl font-semibold font-mono">{contagemPorFaixa[faixa]}</div>
                    <div className="text-[11px] text-muted-foreground">{FAIXA_TITULO[faixa]}</div>
                  </div>
                ))}
              </div>

              {dadosGrafico.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <div className="text-[13px] font-semibold mb-3">Pareto — os produtos que mais pesam no período</div>
                  <ResponsiveContainer width="100%" height={280}>
                    <ComposedChart data={dadosGrafico}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="nome" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
                      <YAxis yAxisId="metrica" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <YAxis yAxisId="acumulado" orientation="right" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                      <Tooltip
                        formatter={(value: number, name: string) => (name === 'acumulado' ? `${value.toFixed(1)}%` : formatarMetrica(value))}
                        contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                      />
                      <Bar yAxisId="metrica" dataKey="metrica" name={criterio === 'valor' ? 'Valor' : 'Quantidade'} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      <Line yAxisId="acumulado" type="monotone" dataKey="acumulado" name="acumulado" stroke="hsl(var(--status-warning))" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* 5. Todos os produtos por faixa (§11 seção 5). */}
              <div className="rounded-lg border border-border overflow-x-auto">
                <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Todos os produtos por faixa</div>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="bg-secondary/60 text-left text-muted-foreground">
                      <th className="px-3 py-1.5 font-semibold">Produto</th>
                      <th className="px-3 py-1.5 font-semibold text-right">{criterio === 'valor' ? 'Valor' : 'Quantidade'}</th>
                      <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
                      <th className="px-3 py-1.5 font-semibold text-right">Acumulado</th>
                      <th className="px-3 py-1.5 font-semibold text-center">Faixa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhasCurva.map((l) => (
                      <tr key={l.produto_codigo} className="border-t border-border">
                        <td className="px-3 py-1.5">{l.nome}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{formatarMetrica(criterio === 'valor' ? l.valor : l.quantidade)}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{l.participacao !== null ? `${l.participacao.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-1.5 text-right font-mono">{l.acumulado !== null ? `${l.acumulado.toFixed(1)}%` : '—'}</td>
                        <td className="px-3 py-1.5 text-center">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${FAIXA_BADGE[l.faixa]}`}>{l.faixa}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {curva?.cortou && (
                  <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                    Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
                  </p>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* Pedido do dono, 2026-09-21: o sistema é a fonte a partir de agora —
          o painel HTML gerado por fora antes desta leva não é mais
          referência de nada (o go-live reimporta 2022 até hoje do zero).
          Achado 6.1 da auditoria de 2026-09-22: o período coberto por ESTA
          importação (competencia_de/ate), gravado desde a Frente 1 e nunca
          lido até agora — sem ele, o rodapé dizia só o nome do arquivo. */}
      {ultimaVendas && (
        <p className="text-[11px] text-muted-foreground border-t border-border pt-3">
          Última importação de vendas: {ultimaVendas.file_name} ({ultimaVendas.filial ?? '—'}),
          de {competenceLabel(ultimaVendas.competencia_de)} a {competenceLabel(ultimaVendas.competencia_ate)},
          em {formatDateBR(ultimaVendas.created_at)}.
        </p>
      )}

      {/* §5 da Frente 1 (pedido do dono): o período coberto de verdade
          (com_periodo_importado), não o da última importação — as duas
          linhas respondem perguntas diferentes. */}
      <p className="text-[11px] text-muted-foreground">
        {periodoImportado && periodoImportado.competencias > 0
          ? `O sistema tem vendas de ${competenceLabel(periodoImportado.competencia_de)} a ${competenceLabel(periodoImportado.competencia_ate)} (${periodoImportado.competencias} ${periodoImportado.competencias === 1 ? 'mês' : 'meses'}).`
          : 'Nenhuma venda importada ainda.'}
      </p>

      {/* Frente 6 (.scratch/plano-frente6-importacoes.md §2): os botões de
          "Importar vendas"/"Importar clientes" saíram desta tela — a
          importação de vendas, clientes e metas mora agora em Configurações
          → Importações, atualizando os painéis Comercial e Diretoria de um
          lugar só. Quem procurava o botão aqui encontra o caminho, em vez
          de concluir que a função desapareceu. */}
      <p className="text-[11px] text-muted-foreground border-t border-border pt-3 flex items-center gap-1.5">
        <Upload className="w-3.5 h-3.5" aria-hidden="true" />
        Importar vendas ou clientes agora é em{' '}
        <Link to={tenantPath('/configuracoes/importacoes')} className="font-medium text-primary hover:underline">
          Configurações → Importações
        </Link>.
      </p>
    </div>
  );
}

export default ComercialPainel;
