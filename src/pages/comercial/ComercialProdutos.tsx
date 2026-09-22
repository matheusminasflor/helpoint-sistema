// A visão "Produtos" do Insights do Comercial (L6e): tendência produto a
// produto e o detalhe de um produto escolhido. Ver `docs/instrucoes-painel-
// comercial.md` §14 itens 2 e 3, e `.scratch/plano-l6e-simulador-e-
// tendencia.md` §2/§3.
//
// A classificação (situação, variação, concentração, faixa) mora no banco
// (`com_tendencia_produtos`) — esta tela nunca reclassifica nada. A "leitura
// em texto" do detalhe usa a MESMA linha da tendência (`leituraDoProduto`,
// `@/lib/leitura-produto`), nunca uma segunda conta.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useDetalheProduto, usePeriodoComercial, useTendenciaProdutos } from '@/hooks/useComercialPainel';
import { leituraDoProduto } from '@/lib/leitura-produto';
import { formatBRL } from '@/types/financeiro';
import type { CriterioCurva, Filial, SituacaoProduto, TendenciaProduto } from '@/types/comercial';

const SITUACOES: SituacaoProduto[] = ['Novo', 'Descontinuado', 'Esporádico', 'Crescendo', 'Caindo', 'Estável'];

const SITUACAO_BADGE: Record<SituacaoProduto, string> = {
  Novo: 'badge-neutral',
  Descontinuado: 'badge-danger',
  Esporádico: 'badge-warning',
  Crescendo: 'badge-success',
  Caindo: 'badge-danger',
  Estável: 'badge-neutral',
};

export default function ComercialProdutos() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  const [situacaoFiltro, setSituacaoFiltro] = useState<SituacaoProduto | 'todas'>('todas');
  const [params, setParams] = useSearchParams();
  const produtoSelecionado = params.get('produto');
  // Seletor de período do §14 (correção D2): Produtos é uma das três telas
  // cuja RPC já aceita p_de/p_ate — ver docs/nao-funciona.md para as que
  // ficaram só no ano.
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);

  const { data, isLoading } = useTendenciaProdutos(de, ate, filial, criterio);
  const linhas = data?.linhas ?? [];
  // Filtro é sobre uma lista já pequena (teto de 500, `buscarComTeto`) — não
  // precisa de useMemo, e evitá-lo evita o aviso do lint sobre `linhas ??
  // []` criar um array novo por render.
  const linhasFiltradas = situacaoFiltro === 'todas' ? linhas : linhas.filter((l) => l.situacao === situacaoFiltro);

  const escolherProduto = (codigo: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set('produto', codigo);
    setParams(proximos, { replace: true });
  };
  const limparProduto = () => {
    const proximos = new URLSearchParams(params);
    proximos.delete('produto');
    setParams(proximos, { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Produtos</h1>
        <p className="text-[13px] text-muted-foreground">
          Tendência de cada produto no período — histórico, faturamento, faixa, meses com venda, clientes e situação.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
        <Select value={situacaoFiltro} onValueChange={(v) => setSituacaoFiltro(v as SituacaoProduto | 'todas')}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as situações</SelectItem>
            {SITUACOES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {produtoSelecionado && (
        <DetalheProdutoSecao
          codigo={produtoSelecionado}
          linhaTendencia={linhas.find((l) => l.produto_codigo === produtoSelecionado) ?? null}
          de={de}
          ate={ate}
          filial={filial}
          onFechar={limparProduto}
        />
      )}

      {!isLoading && linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Sem venda no período selecionado.
        </div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Produto</th>
                <th className="px-3 py-1.5 font-semibold">Histórico</th>
                <th className="px-3 py-1.5 font-semibold text-right">{criterio === 'valor' ? 'Faturamento' : 'Quantidade'}</th>
                <th className="px-3 py-1.5 font-semibold text-center">Faixa</th>
                <th className="px-3 py-1.5 font-semibold text-right">Meses c/ venda</th>
                <th className="px-3 py-1.5 font-semibold text-right">Clientes</th>
                <th className="px-3 py-1.5 font-semibold text-right">Variação</th>
                <th className="px-3 py-1.5 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {linhasFiltradas.map((l) => (
                <tr
                  key={l.produto_codigo}
                  className="border-t border-border cursor-pointer hover:bg-secondary/40"
                  onClick={() => escolherProduto(l.produto_codigo)}
                >
                  <td className="px-3 py-1.5">{l.nome}</td>
                  <td className="px-3 py-1.5">
                    <MiniSparkline
                      serie={l.serie_mensal}
                      primeiraMetade={l.primeira_metade}
                      segundaMetade={l.segunda_metade}
                      formatar={criterio === 'valor' ? formatBRL : (v: number) => v.toLocaleString('pt-BR')}
                    />
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {criterio === 'valor' ? formatBRL(l.faturamento) : l.quantidade.toLocaleString('pt-BR')}
                  </td>
                  <td className="px-3 py-1.5 text-center">{l.faixa}</td>
                  <td className="px-3 py-1.5 text-right">{l.meses_com_venda}</td>
                  <td className="px-3 py-1.5 text-right">{l.clientes}</td>
                  <td className="px-3 py-1.5 text-right font-mono">
                    {l.variacao !== null ? `${l.variacao >= 0 ? '+' : ''}${Math.round(l.variacao * 100)}%` : '—'}
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {l.situacao !== null ? (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${SITUACAO_BADGE[l.situacao]}`}>
                          {l.situacao}
                        </span>
                      ) : '—'}
                      {l.concentrado && (
                        <AlertTriangle
                          className="w-3.5 h-3.5 text-status-warning"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {linhasFiltradas.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Nenhum produto nessa situação.</td></tr>
              )}
            </tbody>
          </table>
          {data?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Miniatura do histórico mensal — uma linha, sem eixo: é para dar o formato
 * de olhada, não para ler valor exato. SVG puro, sem lib de gráfico: doze
 * pontos não precisam de Recharts (ponytail).
 *
 * `primeira_metade`/`segunda_metade` voltam de `com_tendencia_produtos` e
 * são o que explica a `situacao` da linha — sem tela nenhuma lendo (achado
 * 5.7 da auditoria), iam ou para uma tela ou para fora. Aqui é o `title`
 * nativo do SVG: um atributo de plataforma resolve, sem lib de tooltip.
 */
function MiniSparkline({
  serie, primeiraMetade, segundaMetade, formatar,
}: {
  serie: number[];
  primeiraMetade: number | null;
  segundaMetade: number | null;
  formatar: (v: number) => string;
}) {
  const titulo = primeiraMetade !== null && segundaMetade !== null
    ? `1ª metade do período: ${formatar(primeiraMetade)} · 2ª metade: ${formatar(segundaMetade)}`
    : 'Um único mês no período — sem duas metades para comparar.';

  if (serie.length === 0 || serie.every((v) => v === 0)) {
    return <span className="text-muted-foreground" title={titulo}>—</span>;
  }
  const largura = 80;
  const altura = 20;
  const max = Math.max(...serie);
  const min = Math.min(...serie);
  const amplitude = max - min || 1;
  const pontos = serie
    .map((v, i) => {
      const x = (i / (serie.length - 1)) * largura;
      const y = altura - ((v - min) / amplitude) * altura;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={largura} height={altura} className="text-primary" role="img" aria-label={titulo}>
      <title>{titulo}</title>
      <polyline points={pontos} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/**
 * O detalhe do produto (§14 item 3): a leitura em texto, o gráfico mensal
 * com clientes distintos sobreposto, e a lista de quem compra.
 */
function DetalheProdutoSecao({
  codigo, linhaTendencia, de, ate, filial, onFechar,
}: {
  codigo: string;
  linhaTendencia: TendenciaProduto | null;
  de: string;
  ate: string;
  filial: Filial | null;
  onFechar: () => void;
}) {
  const { data: detalhe, isLoading } = useDetalheProduto(codigo, de, ate, filial);

  const leitura = linhaTendencia
    ? leituraDoProduto({
        situacao: linhaTendencia.situacao,
        variacao: linhaTendencia.variacao,
        concentrado: linhaTendencia.concentrado,
        clientes: linhaTendencia.clientes,
      })
    : null;

  return (
    <div className="rounded-lg border border-border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">{linhaTendencia?.nome ?? codigo}</h2>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          <X className="w-3.5 h-3.5 mr-1" /> Fechar
        </Button>
      </div>

      {leitura && <p className="text-[12px] text-muted-foreground">{leitura}</p>}

      {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}

      {detalhe && (
        <>
          <div className="rounded-md border border-border p-3">
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={detalhe.mensal} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="competencia" fontSize={11} tickFormatter={(v: string) => v.slice(5, 7)} />
                <YAxis yAxisId="faturamento" fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                <YAxis yAxisId="clientes" orientation="right" fontSize={11} allowDecimals={false} />
                <Tooltip formatter={(v: number, name: string) => (name === 'clientes_distintos' ? v : formatBRL(v))} />
                <Bar yAxisId="faturamento" dataKey="faturamento" name="Faturamento" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
                <Line yAxisId="clientes" type="monotone" dataKey="clientes_distintos" name="Clientes" stroke="hsl(var(--status-warning))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-md border border-border overflow-x-auto">
            <div className="px-3 py-2 border-b border-border text-[12px] font-semibold">Quem compra</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Cliente</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {detalhe.clientes.map((c) => (
                  <tr key={c.cliente_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{c.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.valor)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{c.quantidade.toLocaleString('pt-BR')}</td>
                  </tr>
                ))}
                {detalhe.clientes.length === 0 && (
                  <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente no período.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
