// A visão "Cashback" do Insights do Comercial (L6c): a apuração mês a mês,
// por cliente. Ver `docs/instrucoes-painel-comercial.md` (INSTRUCOES v7)
// §12 — a especificação desta tela.
//
// A conta mora no banco (regra do CLAUDE.md): esta tela nunca soma
// apuração, nunca escolhe faixa e nunca classifica cliente em TypeScript —
// `com_cashback_mensal`, `com_cashback_resumo` e `com_cashback_indicadores`
// já devolvem tudo pronto.
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronRight, PhoneCall, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { BlocoFarol } from '@/components/comercial/BlocoFarol';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import {
  useCashbackFarolClientes, useCashbackFarolTabelas, useCashbackIndicadores,
  useCashbackMensal, useCashbackResumo, useFaixasCashback,
} from '@/hooks/useComercialCashback';
import { useAnoComVenda, usePeriodoComercial } from '@/hooks/useComercialPainel';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useQueryState } from '@/hooks/useQueryState';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { avisoDeMesesInteiros, rotuloDoIntervalo } from '@/lib/period';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { CashbackFarolCliente, CashbackFarolTabela, CashbackResumo, Filial, SituacaoCashback } from '@/types/comercial';
import { rotuloSituacaoCashback as rotuloSituacao } from '@/lib/situacao-cashback';
import { clientesDoCashback, geraramCashback, type ClienteDoCashback, type FiltroSituacao } from '@/lib/cashback-por-cliente';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';


/** "sem tabela" (§8, anomalia) na coluna, nunca um traço genérico — achado 3 da auditoria. */
function rotuloTabela(c: { tabela_base: string | null; sem_tabela: boolean }): string {
  return c.sem_tabela ? 'sem tabela' : (c.tabela_base ?? '—');
}

export default function ComercialCashback() {
  // Simplificado × analítico (leva D + item de Cashback da leva E). Esta tela é
  // de LER, não de trabalhar — abre no farol, que é o padrão de `VISAO_PADRAO`.
  const [visao, setVisao] = useVisaoRelatorio('comercial-cashback');
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  // O período (pedido do dono, 2026-10-03). "Ano todo" é o padrão e é a tela de antes — nem
  // manda intervalo ao banco. Nos outros, a apuração usa os MESES INTEIROS que o período toca
  // (a faixa é mensal; nunca rateio), e a frase de `aviso` diz quais.
  const { periodo, setPeriodo, mes, setMes, de, ate, setIntervalo } = usePeriodoComercial(ano);
  const intervalo = periodo === 'ano' ? null : { de, ate };
  const aviso = avisoDeMesesInteiros('O cashback é apurado por mês', intervalo);
  // "em 2026" / "no período de …" nas frases; "no ano" / "no período" nos rótulos das colunas.
  const recorte = intervalo ? `no período de ${rotuloDoIntervalo(intervalo)}` : `em ${ano}`;
  const noRecorte = intervalo ? 'no período' : 'no ano';

  // A carteira (pedido do dono, 2026-10-06). Quem gere carteiras e a Diretoria veem todas e
  // filtram por uma (`?carteira=`); as outras pessoas veem só a própria — quem garante é o banco
  // (`com_cashback_mensal`, migration 20261209010000), que ignora a carteira alheia no filtro.
  const podeGerir = usePodeGerirCarteiras();
  const { showDiretoria } = useVisibleModules();
  const veTodas = podeGerir || showDiretoria;
  const { data: carteiras = [] } = useCarteiras();
  const [carteiraNaUrl, setCarteira] = useQueryState<string>('carteira', '');
  const carteira = veTodas && carteiraNaUrl ? carteiraNaUrl : null;

  const { data: indicadores } = useCashbackIndicadores(ano, filial, intervalo, carteira);
  const { data: resumo, isLoading: carregandoResumo } = useCashbackResumo(ano, filial, intervalo, carteira);
  const { data: mensal, isLoading: carregandoMensal } = useCashbackMensal(ano, filial, intervalo, carteira);
  const { data: faixas } = useFaixasCashback();
  const farolClientes = useCashbackFarolClientes(ano, filial, intervalo, carteira);
  const farolTabelas = useCashbackFarolTabelas(ano, filial, intervalo, carteira);

  const linhasResumo = resumo?.linhas ?? [];
  const naoAtingiram = linhasResumo
    .filter((l) => !l.sem_programa && (l.cashback ?? 0) === 0 && l.comprado > 0)
    .sort((a, b) => (a.menor_distancia ?? Infinity) - (b.menor_distancia ?? Infinity));

  const faixasPorTabela = useMemo(() => {
    const grupos = new Map<string, typeof faixas>();
    for (const f of faixas ?? []) {
      const lista = grupos.get(f.tabela_base) ?? [];
      lista.push(f);
      grupos.set(f.tabela_base, lista);
    }
    return grupos;
  }, [faixas]);

  // A tela nova (dono, 2026-10-07): um cliente por linha que abre nos meses dele, com os filtros
  // "Com direito a cashback" e "Situação" na URL. Substitui as tabelas "Com direito" e "Evolução
  // mês a mês", que despejavam tudo de uma vez. O ano é o filtro de ano que já existia.
  const [direitoNaUrl, setDireito] = useQueryState<'sim' | 'todos'>('direito', 'sim');
  const [situacao, setSituacao] = useQueryState<FiltroSituacao>('situacao', 'todas');
  const clientes = useMemo(
    () => clientesDoCashback(resumo?.linhas ?? [], mensal?.linhas ?? [], { soComDireito: direitoNaUrl === 'sim', situacao }),
    [resumo, mensal, direitoNaUrl, situacao],
  );

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Cashback</h1>
          <p className="text-[14px] text-muted-foreground">
            {visao === 'simplificado'
              ? 'Só o que pede uma ligação ou uma decisão: quem está perto de bater a faixa, quem ficou de fora por cadastro, e as tabelas sem faixa.'
              : 'A apuração mês a mês, por cliente — nunca o percentual sobre o acumulado do período.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <TutorialDoRelatorio id="comercial-cashback" />
          <SeletorVisao visao={visao} onChange={setVisao} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais
          ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
          periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
          intervalo={{ de, ate }} onIntervaloChange={setIntervalo}
        />
        {veTodas ? (
          <Select value={carteiraNaUrl || 'todas'} onValueChange={(v) => setCarteira(v === 'todas' ? '' : v)}>
            <SelectTrigger className="w-[200px] h-9" aria-label="Carteira">
              <SelectValue placeholder="Carteira" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as carteiras</SelectItem>
              {carteiras.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <span className="text-[13px] text-muted-foreground">Mostrando os clientes da sua carteira.</span>
        )}
      </div>
      {aviso && <p className="text-[13px] text-muted-foreground">{aviso}</p>}

      {visao === 'simplificado' ? (
        <>
          {/* Dono, 2026-10-07: o simplificado mostra quem GEROU cashback no período, com a situação. */}
          <GeraramCashbackLista linhas={geraramCashback(linhasResumo)} carregando={carregandoResumo} recorte={recorte} />
          <Farol recorte={recorte} clientes={farolClientes} tabelas={farolTabelas} />
        </>
      ) : (
      <>

      {/* Indicadores — os cinco números do topo (§12), somados no banco.
          Achado 3 da auditoria: "sem tabela" (cliente sem correspondência
          no CLIENTESXTABELA, §8) ganhou cartão próprio — antes saía
          escondido dentro de "sem programa" (REVENDA/SALÃO REF/DIRETORIA,
          que TÊM tabela, só não têm grade), e ninguém via a diferença. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Cashback gerado</div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(indicadores?.cashback_total ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Liberado (o mês seguinte bateu a metade)</div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(indicadores?.cashback_liberado_total ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Aguardando o mês seguinte</div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(indicadores?.cashback_aguardando_total ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Percentual sobre a compra</div>
          <div className="mt-1 text-xl font-semibold font-mono">
            {indicadores?.percentual !== null && indicadores?.percentual !== undefined ? `${indicadores.percentual.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Não atingiram o mínimo</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_nao_atingiram ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Sem programa</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_programa ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[12px] text-muted-foreground">Sem tabela</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_tabela ?? 0}</div>
        </div>
      </div>

      {(indicadores?.clientes_sem_tabela ?? 0) > 0 && (
        <p className="text-[13px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
          {indicadores!.clientes_sem_tabela} clientes não estão no cadastro de tabela de preço — confira o CLIENTESXTABELA mais recente.
        </p>
      )}

      {/* Legenda das faixas — as grades visíveis, ou o aviso de que não há nenhuma cadastrada. */}
      <SecaoQueAbre titulo="Grades de cashback" quantos={faixasPorTabela.size}>
        <div className="p-4">
        {faixasPorTabela.size === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nenhuma grade de cashback cadastrada. Cadastre em{' '}
            <Link to="/comercial/configuracoes" className="text-primary underline underline-offset-2">Comercial → Configurações → Cashback</Link>.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(faixasPorTabela.entries()).map(([tabela, degraus]) => (
              <div key={tabela} className="rounded-md border border-dashed border-border p-3">
                <div className="text-[13px] font-semibold mb-2">{tabela}</div>
                <ul className="space-y-1 text-[13px] text-muted-foreground">
                  {degraus!.map((d) => (
                    <li key={d.id} className="flex justify-between font-mono">
                      <span>{formatBRL(d.valor_minimo)}</span>
                      <span>{d.percentual}%</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        </div>
      </SecaoQueAbre>

      {/* Com direito — cliente, tabela, compra, meses com direito, última faixa, cashback, meta e o que falta. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[14px] font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4" aria-hidden="true" />
          Clientes {recorte}
        </div>
        {/* CADA COLUNA DIZ DE QUAL RECORTE ELA É (leva D, 2026-09-26). As três
            semânticas estavam documentadas na migration desde outubro — `compra` e
            o cashback são do ANO; `meta_para_ativar` (metade, desde 2026-10-06) e `falta_proxima_faixa` são do ÚLTIMO mês
            com movimento — e a tela nunca disse qual era qual. Ler as três como se
            fossem do mesmo período é a conta errada que ninguém percebe. */}
        <p className="px-4 py-2 text-[13px] text-muted-foreground border-b border-border">
          A faixa é <strong>mensal</strong>. Cada coluna de valor diz de que recorte ela é — as {intervalo ? 'do período' : 'do ano'}
          {' '}e as do mês não se somam.
        </p>
        {/* A regra do dono (2026-10-06, docs/regra-cashback.md), dita na tela. */}
        <p className="px-4 py-2 text-[13px] text-muted-foreground border-b border-border">
          Conta só nota com <strong>CFOP de venda</strong> (série 1 ou 75), menos devolução — bonificação, publicidade
          e cashback não contam. O cashback do mês é a compra × a porcentagem da faixa da tabela, e só é{' '}
          <strong>liberado</strong> se no mês seguinte o cliente comprar pelo menos a <strong>metade</strong> do que comprou.
        </p>
        {/* Os filtros (dono, 2026-10-07). O ano é o filtro de ano lá de cima. */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border">
          <Select value={direitoNaUrl} onValueChange={(v) => setDireito(v as 'sim' | 'todos')}>
            <SelectTrigger className="w-[230px] h-9" aria-label="Quem mostrar"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="sim">Com direito a cashback</SelectItem>
              <SelectItem value="todos">Todos os clientes que compraram</SelectItem>
            </SelectContent>
          </Select>
          <Select value={situacao} onValueChange={(v) => setSituacao(v as FiltroSituacao)}>
            <SelectTrigger className="w-[230px] h-9" aria-label="Situação"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as situações</SelectItem>
              <SelectItem value="liberado">Liberado</SelectItem>
              <SelectItem value="aguardando">Aguardando o mês seguinte</SelectItem>
              <SelectItem value="nao_liberado">Não liberado</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[13px] text-muted-foreground">
            {clientes.length} {clientes.length === 1 ? 'cliente' : 'clientes'} · clique no cliente para ver os meses
          </span>
        </div>
        {carregandoResumo || carregandoMensal ? (
          <Skeleton className="h-40 m-4" />
        ) : clientes.length === 0 ? (
          <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Nenhum cliente com esses filtros {recorte}.</p>
        ) : (
          <ul>
            {clientes.map((c) => <LinhaDoCliente key={c.resumo.cliente_codigo} cliente={c} noRecorte={noRecorte} />)}
          </ul>
        )}
        {resumo?.cortou && (
          <p className="px-4 py-2 text-[12px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>

      {/* Não atingiram — quem comprou e nunca chegou ao mínimo, mais perto primeiro.
          ── Leva D (2026-09-26): OS RÓTULOS MENTIAM POR OMISSÃO ───────────────
          Diziam "Compra no período" e "Faltou (menor distância)", lado a lado. O
          primeiro é o ANO; o segundo é o que faltou num MÊS — a faixa de cashback
          é mensal. Para 12 dos 20 clientes de 2026 os dois não somam a faixa, e o
          pior caso é o RONDINELLY: R$ 2.461,76 no ano (em cinco meses) ao lado de
          "faltou R$ 4.160,26" — some, e dá R$ 6.622, não os R$ 5.000 da faixa.
          Dois números verdadeiros lado a lado contando uma história falsa.
          Os rótulos passaram a dizer QUAL recorte cada um é, e a nota abaixo
          aponta para a tabela de evolução, onde o valor de cada mês já está. */}
      <SecaoQueAbre titulo="Não atingiram o mínimo" quantos={naoAtingiram.length}>
        <p className="px-4 py-2 text-[13px] text-muted-foreground border-b border-border">
          A faixa é <strong>mensal</strong>: as duas colunas de valor são recortes diferentes e não se
          somam. O que o cliente comprou em cada mês está na lista de clientes, acima (escolha "Todos os clientes que compraram").
        </p>
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Compra {noRecorte}</th>
              <th className="px-3 py-1.5 font-semibold text-right">Faltou, no melhor mês</th>
            </tr>
          </thead>
          <tbody>
            {naoAtingiram.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>{limparNomeCliente(c.nome)}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{rotuloTabela(c)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.menor_distancia !== null ? formatBRL(c.menor_distancia) : '—'}</td>
              </tr>
            ))}
            {!carregandoResumo && naoAtingiram.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Ninguém comprou sem atingir o mínimo {recorte}.</td></tr>
            )}
          </tbody>
        </table>
      </SecaoQueAbre>

      {mensal?.cortou && (
        <p className="text-[12px] text-muted-foreground">
          A apuração mês a mês é maior que o mostrado aqui — estreite a filial ou a carteira para ver o restante.
        </p>
      )}
      </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O FAROL — leva D (2026-09-26), desenhado com o dono sobre os dados de 2026.
//
// Três blocos, três ações. O analítico desta tela já estava completo; o que
// faltava era o CORTE: a tabela "não atingiram o mínimo" tinha 20 nomes
// ordenados por distância, e 17 deles faltaram de 44% a 99% da faixa — um
// comprou R$ 33 contra R$ 5.000. Lista de 20 ordenada não é farol, é relatório.
// ═══════════════════════════════════════════════════════════════════════════
function Farol({
  recorte, clientes, tabelas,
}: {
  /** "em 2026" ou "no período de 10/03/2026 a 25/04/2026". */
  recorte: string;
  clientes: { data?: CashbackFarolCliente[]; isLoading: boolean; isError: boolean };
  tabelas: { data?: CashbackFarolTabela[]; isLoading: boolean; isError: boolean };
}) {
  // Falha de leitura NÃO pode virar "nada a apontar" — num farol isso é pior que
  // em qualquer outra tela, porque o silêncio dele É a mensagem. Mesma defesa do
  // farol da bonificação, e é a regra 1 das cinco um degrau acima do `unwrap`.
  if (clientes.isError || tabelas.isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[14px]">
        <strong>Não consegui ler a apuração de cashback {recorte}.</strong> Isto não quer dizer que não
        haja nada a apontar — recarregue a página.
      </div>
    );
  }
  if (clientes.isLoading || tabelas.isLoading) return <Skeleton className="h-64 w-full" />;

  const lista = clientes.data ?? [];
  const perto = lista.filter((c) => c.motivo === 'perto_de_bater');
  const semTabela = lista.filter((c) => c.motivo === 'sem_tabela');
  const listaTabelas = tabelas.data ?? [];

  return (
    <div className="space-y-4">
      <BlocoFarol
        icone={<PhoneCall className="w-4 h-4 text-status-warning" aria-hidden="true" />}
        titulo={`Perto de bater a faixa — ${perto.length} ${perto.length === 1 ? 'cliente' : 'clientes'}`}
        subtitulo="Faltou até um quarto da primeira faixa, no melhor mês dele. Uma ligação resolve."
        vazio={`Ninguém chegou perto da faixa sem bater, ${recorte}.`}
      >
        {perto.map((c) => (
          <li key={c.cliente_codigo} className="px-4 py-2 text-[13px] border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                  {limparNomeCliente(c.nome)}
                </Link>
                {c.tabela_base && <span className="ml-1.5 text-[12px] text-muted-foreground">{c.tabela_base}</span>}
                {/* O MÊS, sempre. É ele que fecha com o que faltou — ver o
                    cabeçalho da migration: a compra do ANO ao lado do que faltou
                    num MÊS não soma a faixa, e para 12 dos 20 clientes de 2026
                    os dois números contavam histórias diferentes. */}
                {c.competencia && (
                  <span className="ml-1.5 text-[12px] text-muted-foreground">{competenceLabel(c.competencia)}</span>
                )}
              </span>
              <span className="font-mono shrink-0 font-semibold">
                {c.comprou_da_faixa !== null ? `${c.comprou_da_faixa.toFixed(0)}%` : '—'}
              </span>
            </div>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              comprou <span className="font-mono">{formatBRL(c.comprado_no_mes ?? 0)}</span>
              {' · faltou '}<span className="font-mono text-foreground">{formatBRL(c.faltou ?? 0)}</span>
              {' para a faixa de '}<span className="font-mono">{formatBRL(c.minimo ?? 0)}</span>
            </p>
          </li>
        ))}
      </BlocoFarol>

      <BlocoFarol
        icone={<AlertTriangle className="w-4 h-4 text-status-danger" aria-hidden="true" />}
        titulo={`Sem tabela no cadastro — ${semTabela.length} ${semTabela.length === 1 ? 'cliente' : 'clientes'}`}
        subtitulo="Comprou e nem entrou na conta do cashback: não é que não bateu, é que não foi medido. O conserto é de cadastro."
        vazio="Todos os clientes que compraram têm tabela de preço no cadastro."
      >
        {semTabela.map((c) => (
          <li key={c.cliente_codigo} className="px-4 py-1.5 text-[13px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">
              <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                {limparNomeCliente(c.nome)}
              </Link>
            </span>
            <span className="font-mono shrink-0 text-muted-foreground">
              comprou {formatBRL(c.comprado_no_ano)} {recorte}
            </span>
          </li>
        ))}
      </BlocoFarol>

      {/* DISCRETO, não alerta — decisão do dono (2026-09-26): DIRETORIA é interno
          e REVENDA/SALÃO REF podem ser decisão comercial. Cobrar isso em vermelho
          todo dia, sobre uma decisão já tomada, é como se ensina alguém a ignorar
          o farol inteiro. Fica cinza, para conferir. */}
      <BlocoFarol
        discreto
        icone={<Wallet className="w-4 h-4" aria-hidden="true" />}
        titulo={`Tabela sem faixa de cashback — ${listaTabelas.length}`}
        subtitulo="Cliente comprou, a tabela dele não tem faixa nenhuma cadastrada. Se for de propósito, ignore."
        vazio="Toda tabela com cliente comprando tem faixa cadastrada."
      >
        {listaTabelas.map((t) => (
          <li key={t.tabela_base} className="px-4 py-1.5 text-[13px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">{t.tabela_base}</span>
            <span className="font-mono shrink-0 text-muted-foreground">
              {t.clientes} {t.clientes === 1 ? 'cliente' : 'clientes'} · {formatBRL(t.comprado)}
            </span>
          </li>
        ))}
      </BlocoFarol>

      {/* A ponte para o analítico. Sem ela, o corte do farol pareceria perda de
          informação — e o que ele faz é guardar os 17 do outro lado da porta. */}
      <p className="text-[12px] text-muted-foreground">
        Quem faltou mais de um quarto da faixa, a apuração mês a mês e as grades completas estão no
        analítico.
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// A TELA QUE ABRE (dono, 2026-10-07): "muito ruim de visualizar" — as tabelas
// despejavam tudo de uma vez. Agora cada cliente é uma linha que abre nos meses
// dele, e as seções de apoio (grades, não atingiram) começam fechadas.
// ═══════════════════════════════════════════════════════════════════════════

/** A situação com TEXTO e cor (nunca só cor). */
const SELO: Record<SituacaoCashback, string> = {
  liberado: 'badge-success',
  aguardando: 'badge-warning',
  nao_liberado: 'badge-danger',
};

function SeloSituacao({ situacao }: { situacao: SituacaoCashback | null }) {
  if (!situacao) return <span className="text-[12px] text-muted-foreground">—</span>;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap ${SELO[situacao]}`}>
      {rotuloSituacao(situacao)}
    </span>
  );
}

function SecaoQueAbre({ titulo, quantos, children }: { titulo: string; quantos: number; children: ReactNode }) {
  return (
    <Collapsible className="rounded-lg border border-border overflow-hidden">
      <CollapsibleTrigger className="group flex w-full items-center gap-2 px-4 py-3 text-left text-[14px] font-semibold hover:bg-secondary/40">
        <ChevronRight className="w-4 h-4 transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
        {titulo}
        <span className="text-[13px] font-normal text-muted-foreground">({quantos})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t border-border overflow-x-auto">{children}</CollapsibleContent>
    </Collapsible>
  );
}

function LinhaDoCliente({ cliente, noRecorte }: { cliente: ClienteDoCashback; noRecorte: string }) {
  const { resumo: r, meses } = cliente;
  return (
    <li className="border-t border-border first:border-t-0">
      <Collapsible>
        <CollapsibleTrigger className="group grid w-full grid-cols-[auto_1fr] sm:grid-cols-[auto_minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-secondary/40">
          <ChevronRight className="w-4 h-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" aria-hidden="true" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-medium text-foreground" title={r.nome}>{limparNomeCliente(r.nome)}</span>
            <span className="block text-[12px] text-muted-foreground">{rotuloTabela(r)}</span>
          </span>
          <Valor rotulo={`Compra ${noRecorte}`} valor={r.comprado} />
          <Valor rotulo="Gerado" valor={r.cashback ?? 0} />
          <Valor rotulo="Liberado" valor={r.cashback_liberado ?? 0} />
          <Valor rotulo="Aguardando" valor={r.cashback_aguardando ?? 0} />
          <span className="col-start-2 sm:col-start-auto"><SeloSituacao situacao={r.ultima_situacao} /></span>
        </CollapsibleTrigger>
        <CollapsibleContent className="bg-secondary/20 px-4 pb-3 overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1.5 pr-3 font-semibold">Mês</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Compra que conta</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Faixa</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Gerado</th>
                <th className="py-1.5 pr-3 font-semibold text-right" title="Metade da compra deste mês">Compra para ativar</th>
                <th className="py-1.5 pr-3 font-semibold text-right">Compra do mês seguinte</th>
                <th className="py-1.5 font-semibold">Situação</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.competencia} className="border-t border-border">
                  <td className="py-1.5 pr-3">{competenceLabel(m.competencia)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatBRL(m.comprado)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{m.percentual !== null ? `${m.percentual}%` : '—'}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{formatBRL(m.cashback ?? 0)}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{m.situacao ? formatBRL(m.compra_para_ativar) : '—'}</td>
                  <td className="py-1.5 pr-3 text-right font-mono">{m.situacao ? formatBRL(m.compra_mes_seguinte) : '—'}</td>
                  <td className="py-1.5"><SeloSituacao situacao={m.situacao} /></td>
                </tr>
              ))}
              {meses.length === 0 && (
                <tr><td colSpan={7} className="py-3 text-center text-muted-foreground">Sem compra que conte no período.</td></tr>
              )}
            </tbody>
          </table>
          <Link to={linkFichaCliente(r.cliente_codigo)} className="mt-2 inline-block text-[13px] text-primary hover:underline">
            Abrir a ficha do cliente
          </Link>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function Valor({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <span className="hidden sm:block text-right">
      <span className="block text-[12px] text-muted-foreground">{rotulo}</span>
      <span className="block font-mono text-[13px]">{formatBRL(valor)}</span>
    </span>
  );
}

function GeraramCashbackLista({ linhas, carregando, recorte }: { linhas: CashbackResumo[]; carregando: boolean; recorte: string }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="px-4 py-2 border-b border-border text-[14px] font-semibold flex items-center gap-2">
        <Wallet className="w-4 h-4" aria-hidden="true" />
        Geraram cashback {recorte}
        <span className="text-[13px] font-normal text-muted-foreground">({linhas.length})</span>
      </div>
      {carregando ? (
        <Skeleton className="h-32 m-4" />
      ) : linhas.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">Ninguém gerou cashback {recorte}.</p>
      ) : (
        <ul>
          {linhas.map((r) => (
            <li key={r.cliente_codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border first:border-t-0 px-4 py-2.5">
              <Link to={linkFichaCliente(r.cliente_codigo)} className="min-w-0 flex-1 truncate text-[14px] text-primary hover:underline" title={r.nome}>
                {limparNomeCliente(r.nome)}
              </Link>
              <SeloSituacao situacao={r.ultima_situacao} />
              <span className="w-28 text-right font-mono text-[14px] font-semibold">{formatBRL(r.cashback ?? 0)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
