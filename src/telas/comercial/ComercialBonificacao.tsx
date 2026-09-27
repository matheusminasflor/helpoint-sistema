// A visão "Bonificação" do Insights do Comercial (L6b): bonificação por
// cliente e pedidos em condição. Ver `.scratch/plano-l6b-curva-e-condicao.md`.
//
// A seção de condição abre no filtro "venda" (§13 do INSTRUCOES v7, item 4
// do plano) — nos arquivos de hoje a venda em condição é R$ 0,00; a tela
// mostra zero, não esconde o filtro nem troca o padrão por causa disso.
//
// ── Farol (2026-09-25) ──────────────────────────────────────────────────
// O dono pediu, em 2026-09-24: "na aba bonificação um farol geral". A
// apuração que veio depois mostrou o que o farol tem de perguntar — a
// bonificação da INBRAS saiu de 6-11% da venda (começo de 2025) para mais de
// 100% em alguns meses de 2026, e dentro disso havia 10 clientes que
// receberam R$ 117.799,63 sem comprar NADA.
//
// A visão SIMPLIFICADA é o farol: só quem pede decisão. A ANALÍTICA são as
// duas tabelas que esta tela sempre teve, inteiras.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Gift, PackageX } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import {
  useAnoComVenda, useBonificacaoFarolClientes, useBonificacaoFarolProdutos,
  useBonificacaoPorCliente, useFaturamentoMensal, usePedidosEmCondicao, usePeriodoComercial,
} from '@/hooks/useComercialPainel';
import { linkFichaCliente } from '@/config/comercial-insights';
import { BlocoFarol } from '@/components/comercial/BlocoFarol';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { opcoesDeSerie } from '@/lib/series-do-filtro';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { BonificacaoFarolCliente, BonificacaoFarolProduto, Filial, Serie } from '@/types/comercial';

type FiltroCondicao = 'venda' | 'bonificacao' | 'ambos';

export default function ComercialBonificacao() {
  const [visao, setVisao] = useVisaoRelatorio('comercial-bonificacao');
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [filtroCondicao, setFiltroCondicao] = useState<FiltroCondicao>('venda');
  // Seletor de período do §14 (correção D2): Bonificação é uma das três
  // telas cuja RPC já aceita p_de/p_ate — ver docs/nao-funciona.md para as
  // que ficaram só no ano.
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);

  const { data: bonificacao, isLoading: carregandoBonificacao } = useBonificacaoPorCliente(de, ate, filial, serie);
  const { data: condicao, isLoading: carregandoCondicao } = usePedidosEmCondicao(de, ate, filial);
  const farolClientes = useBonificacaoFarolClientes(de, ate, filial);
  const farolProdutos = useBonificacaoFarolProdutos(de, ate, filial);

  // AS SÉRIES DO FILTRO SAEM DO DADO (leva F), e NÃO de `bonificacao.linhas`:
  // aquela consulta já vem filtrada por `serie`, então escolher a série 1 faria a
  // série 1 ser a única opção — o filtro se trancaria sozinho. `useFaturamentoMensal`
  // com `serie = null` devolve o ano inteiro, sem filtro, e é a mesma consulta que
  // a tela de Vendas já faz (então o cache costuma estar quente). São 12 a 24
  // linhas: reaproveitar sai mais barato que uma RPC nova só para listar séries.
  const { data: mesesDoAno } = useFaturamentoMensal(ano, filial, null);
  const opcoesSerie = opcoesDeSerie(mesesDoAno ?? []);

  const linhasBonificacao = bonificacao?.linhas ?? [];
  const linhasCondicao = condicao?.linhas ?? [];
  const valorCondicao = (p: (typeof linhasCondicao)[number]) =>
    filtroCondicao === 'venda' ? p.venda : filtroCondicao === 'bonificacao' ? p.bonificacao : p.total;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Bonificação</h1>
          <p className="text-[13px] text-muted-foreground">
            {visao === 'simplificado'
              ? 'Só o que pede decisão: quem recebe sem comprar, quem recebe mais do que compra, e o que sai mais de graça do que vendido.'
              : 'Bonificação por cliente e os pedidos em condição (série 75, cliente em condição).'}
          </p>
        </div>
        <SeletorVisao visao={visao} onChange={setVisao} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais
          ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
          periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
        />
        {/* O seletor de série só existe no ANALÍTICO. O farol conta sempre as
            DUAS séries — tudo que saiu sem cobrança —, então ali ele não
            mudaria número nenhum, e seletor que não muda o que está na tela é
            pior que nenhum (mesma lição do farol de chamados, na Diretoria). */}
        {visao === 'analitico' && (
          <Select value={serie ?? 'todas'} onValueChange={(v) => setSerie(v === 'todas' ? null : (v as Serie))}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Série" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">
                {opcoesSerie.length > 2 ? 'Todas as séries' : 'As duas séries'}
              </SelectItem>
              {opcoesSerie.map((o) => (
                <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {visao === 'simplificado' ? (
        <Farol clientes={farolClientes} produtos={farolProdutos} />
      ) : (
      <>
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Gift className="w-4 h-4" aria-hidden="true" />
          Bonificação por cliente no período selecionado
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Comprado</th>
              <th className="px-3 py-1.5 font-semibold text-right">Bonificado</th>
              <th className="px-3 py-1.5 font-semibold text-right">% sobre o comprado</th>
            </tr>
          </thead>
          <tbody>
            {linhasBonificacao.map((b) => (
              <tr key={b.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(b.cliente_codigo)} className="text-primary hover:underline" title={b.nome}>{limparNomeCliente(b.nome)}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{b.tabela_preco ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.bonificado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{b.percentual !== null ? `${b.percentual.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {!carregandoBonificacao && linhasBonificacao.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Sem bonificação no período selecionado.</td></tr>
            )}
          </tbody>
        </table>
        {bonificacao?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial ou a série para ver o restante.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">Pedidos em condição</span>
          <Select value={filtroCondicao} onValueChange={(v) => setFiltroCondicao(v as FiltroCondicao)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="bonificacao">Bonificação</SelectItem>
              <SelectItem value="ambos">Os dois</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          Estes pedidos já estão no faturamento total — somar conta duas vezes.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Competência</th>
              <th className="px-3 py-1.5 font-semibold text-right">
                {filtroCondicao === 'venda' ? 'Venda' : filtroCondicao === 'bonificacao' ? 'Bonificação' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasCondicao.map((p, idx) => (
              <tr key={`${p.cliente_codigo}-${p.competencia}-${idx}`} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(p.cliente_codigo)} className="text-primary hover:underline" title={p.nome}>{limparNomeCliente(p.nome)}</Link>
                </td>
                <td className="px-3 py-1.5">{competenceLabel(p.competencia)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(valorCondicao(p))}</td>
              </tr>
            ))}
            {!carregandoCondicao && linhasCondicao.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem pedido em condição no período selecionado.</td></tr>
            )}
          </tbody>
        </table>
        {condicao?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
          </p>
        )}
      </div>
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O FAROL — três blocos, cada um uma pergunta que muda uma decisão.
// ═══════════════════════════════════════════════════════════════════════════
function Farol({
  clientes, produtos,
}: {
  clientes: { data?: BonificacaoFarolCliente[]; isLoading: boolean; isError: boolean };
  produtos: { data?: BonificacaoFarolProduto[]; isLoading: boolean; isError: boolean };
}) {
  // Falha de leitura NÃO pode virar "nada a apontar" — num farol isso é pior
  // que em qualquer outra tela: o silêncio dele é a mensagem. Regra 1 das
  // cinco, um degrau acima do `unwrap`.
  if (clientes.isError || produtos.isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
        <strong>Não consegui ler a bonificação do período.</strong> Isto não quer dizer que não haja
        nada a apontar — recarregue a página.
      </div>
    );
  }
  if (clientes.isLoading || produtos.isLoading) return <Skeleton className="h-64 w-full" />;

  const semCompra = (clientes.data ?? []).filter((c) => c.motivo === 'sem_compra');
  const recebeMais = (clientes.data ?? []).filter((c) => c.motivo === 'recebe_mais');
  const totalSemCompra = semCompra.reduce((s, c) => s + c.bonificacao, 0);
  const listaProdutos = produtos.data ?? [];

  const nada = semCompra.length === 0 && recebeMais.length === 0 && listaProdutos.length === 0;
  if (nada) {
    return (
      <p className="text-[13px] text-muted-foreground rounded-lg border border-dashed border-border p-4">
        Nenhum cliente recebeu bonificação acima do que comprou, e nenhum produto saiu mais de graça
        do que vendido, no período selecionado.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <BlocoFarol
        icone={<AlertTriangle className="w-4 h-4 text-status-danger" aria-hidden="true" />}
        titulo={`Recebeu sem comprar — ${semCompra.length} ${semCompra.length === 1 ? 'cliente' : 'clientes'}`}
        subtitulo={semCompra.length > 0 ? `${formatBRL(totalSemCompra)} de produto saiu sem nenhuma compra no período.` : undefined}
        vazio="Nenhum cliente recebeu bonificação sem comprar."
      >
        {semCompra.map((c) => (
          <li key={c.cliente_codigo} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">
              <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                {limparNomeCliente(c.nome)}
              </Link>
              {c.tabela_preco && <span className="ml-1.5 text-[10px] text-muted-foreground">{c.tabela_preco}</span>}
            </span>
            <span className="font-mono shrink-0">{formatBRL(c.bonificacao)}</span>
          </li>
        ))}
      </BlocoFarol>

      <BlocoFarol
        icone={<Gift className="w-4 h-4 text-status-warning" aria-hidden="true" />}
        titulo={`Recebeu mais do que comprou — ${recebeMais.length} ${recebeMais.length === 1 ? 'cliente' : 'clientes'}`}
        vazio="Nenhum cliente recebeu mais do que comprou."
      >
        {recebeMais.map((c) => (
          <li key={c.cliente_codigo} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">
              <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                {limparNomeCliente(c.nome)}
              </Link>
              {c.tabela_preco && <span className="ml-1.5 text-[10px] text-muted-foreground">{c.tabela_preco}</span>}
            </span>
            <span className="font-mono shrink-0 text-muted-foreground">
              {formatBRL(c.bonificacao)} contra {formatBRL(c.comprado)}
              {c.percentual !== null && <span className="ml-1.5 text-foreground">{c.percentual.toFixed(0)}%</span>}
            </span>
          </li>
        ))}
      </BlocoFarol>

      <BlocoFarol
        icone={<PackageX className="w-4 h-4 text-status-warning" aria-hidden="true" />}
        titulo={`Sai mais de graça do que vendido — ${listaProdutos.length} ${listaProdutos.length === 1 ? 'produto' : 'produtos'}`}
        subtitulo="Comparação por UNIDADE, não por valor: a nota de bonificação sai a preço de tabela, e o valor sozinho não diz se foi muito produto barato ou pouco produto caro."
        vazio="Nenhum produto saiu mais de graça do que vendido."
      >
        {listaProdutos.map((p) => (
          <li key={p.produto_codigo} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate" title={p.nome}>{p.nome}</span>
            <span className="font-mono shrink-0 text-muted-foreground">
              {p.quantidade_bonificada} dadas contra {p.quantidade_vendida} vendidas
              {/* `vezes` nulo = nunca vendido no período. "Nunca vendido" e
                  "vendeu pouco" são fatos diferentes, e o número não
                  distingue os dois — a palavra distingue. */}
              <span className="ml-1.5 text-foreground">
                {p.vezes === null ? 'nunca vendido' : `${p.vezes.toFixed(1)}×`}
              </span>
            </span>
          </li>
        ))}
      </BlocoFarol>
    </div>
  );
}

// `BlocoFarol` saiu deste arquivo na leva D, para `@/components/comercial/
// BlocoFarol` — o farol do cashback precisou do mesmo cartão, e duas cópias do
// mesmo bloco divergem na primeira vez que alguém ajustar uma.
