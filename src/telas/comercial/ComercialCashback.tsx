// A visão "Cashback" do Insights do Comercial (L6c): a apuração mês a mês,
// por cliente. Ver `docs/instrucoes-painel-comercial.md` (INSTRUCOES v7)
// §12 — a especificação desta tela.
//
// A conta mora no banco (regra do CLAUDE.md): esta tela nunca soma
// apuração, nunca escolhe faixa e nunca classifica cliente em TypeScript —
// `com_cashback_mensal`, `com_cashback_resumo` e `com_cashback_indicadores`
// já devolvem tudo pronto.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, PhoneCall, Wallet } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { BlocoFarol } from '@/components/comercial/BlocoFarol';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import {
  useCashbackFarolClientes, useCashbackFarolTabelas, useCashbackIndicadores,
  useCashbackMensal, useCashbackResumo, useFaixasCashback,
} from '@/hooks/useComercialCashback';
import { useAnoComVenda } from '@/hooks/useComercialPainel';
import { linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { CashbackFarolCliente, CashbackFarolTabela, Filial } from '@/types/comercial';

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const MES_LABEL = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

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

  const { data: indicadores } = useCashbackIndicadores(ano, filial);
  const { data: resumo, isLoading: carregandoResumo } = useCashbackResumo(ano, filial);
  const { data: mensal, isLoading: carregandoMensal } = useCashbackMensal(ano, filial);
  const { data: faixas } = useFaixasCashback();
  const farolClientes = useCashbackFarolClientes(ano, filial);
  const farolTabelas = useCashbackFarolTabelas(ano, filial);

  const linhasResumo = resumo?.linhas ?? [];
  const comDireito = linhasResumo.filter((l) => (l.meses_com_direito ?? 0) > 0);
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

  // Pivô cliente × mês para a "evolução mês a mês" — só os clientes com
  // pelo menos um mês de cashback (mesmo conjunto de "com direito").
  const evolucao = useMemo(() => {
    const porCliente = new Map<string, { nome: string; meses: Record<string, number | null> }>();
    for (const m of mensal?.linhas ?? []) {
      if (!porCliente.has(m.cliente_codigo)) porCliente.set(m.cliente_codigo, { nome: m.nome, meses: {} });
      const chave = m.competencia.slice(5, 7);
      porCliente.get(m.cliente_codigo)!.meses[chave] = m.cashback;
    }
    return Array.from(porCliente.entries())
      .filter(([codigo]) => comDireito.some((c) => c.cliente_codigo === codigo))
      .map(([codigo, v]) => ({ cliente_codigo: codigo, ...v }))
      .sort((a, b) => a.nome.localeCompare(b.nome));
  }, [mensal, comDireito]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Cashback</h1>
          <p className="text-[13px] text-muted-foreground">
            {visao === 'simplificado'
              ? 'Só o que pede uma ligação ou uma decisão: quem está perto de bater a faixa, quem ficou de fora por cadastro, e as tabelas sem faixa.'
              : 'A apuração mês a mês, por cliente — nunca o percentual sobre o acumulado do período.'}
          </p>
        </div>
        <SeletorVisao visao={visao} onChange={setVisao} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
      </div>

      {visao === 'simplificado' ? (
        <Farol ano={ano} clientes={farolClientes} tabelas={farolTabelas} />
      ) : (
      <>

      {/* Indicadores — os cinco números do topo (§12), somados no banco.
          Achado 3 da auditoria: "sem tabela" (cliente sem correspondência
          no CLIENTESXTABELA, §8) ganhou cartão próprio — antes saía
          escondido dentro de "sem programa" (REVENDA/SALÃO REF/DIRETORIA,
          que TÊM tabela, só não têm grade), e ninguém via a diferença. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Cashback do período</div>
          <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(indicadores?.cashback_total ?? 0)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Percentual sobre a compra</div>
          <div className="mt-1 text-xl font-semibold font-mono">
            {indicadores?.percentual !== null && indicadores?.percentual !== undefined ? `${indicadores.percentual.toFixed(1)}%` : '—'}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Não atingiram o mínimo</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_nao_atingiram ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Sem programa</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_programa ?? 0}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-[11px] text-muted-foreground">Sem tabela</div>
          <div className="mt-1 text-xl font-semibold font-mono">{indicadores?.clientes_sem_tabela ?? 0}</div>
        </div>
      </div>

      {(indicadores?.clientes_sem_tabela ?? 0) > 0 && (
        <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
          {indicadores!.clientes_sem_tabela} clientes não estão no cadastro de tabela de preço — confira o CLIENTESXTABELA mais recente.
        </p>
      )}

      {/* Legenda das faixas — as grades visíveis, ou o aviso de que não há nenhuma cadastrada. */}
      <div className="rounded-lg border border-border p-4">
        <div className="text-[13px] font-semibold mb-3">Grades de cashback</div>
        {faixasPorTabela.size === 0 ? (
          <p className="text-[12px] text-muted-foreground">
            Nenhuma grade de cashback cadastrada. Cadastre em{' '}
            <Link to="/comercial/configuracoes" className="text-primary underline underline-offset-2">Comercial → Configurações → Cashback</Link>.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from(faixasPorTabela.entries()).map(([tabela, degraus]) => (
              <div key={tabela} className="rounded-md border border-dashed border-border p-3">
                <div className="text-[12px] font-semibold mb-2">{tabela}</div>
                <ul className="space-y-1 text-[12px] text-muted-foreground">
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

      {/* Com direito — cliente, tabela, compra, meses com direito, última faixa, cashback, meta e o que falta. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Wallet className="w-4 h-4" aria-hidden="true" />
          Com direito a cashback em {ano}
        </div>
        {/* CADA COLUNA DIZ DE QUAL RECORTE ELA É (leva D, 2026-09-26). As três
            semânticas estavam documentadas na migration desde outubro — `compra` e
            `meta_para_ativar` são do ANO, `falta_proxima_faixa` é do ÚLTIMO mês
            com movimento — e a tela nunca disse qual era qual. Ler as três como se
            fossem do mesmo período é a conta errada que ninguém percebe. */}
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          A faixa é <strong>mensal</strong>. Cada coluna de valor diz de que recorte ela é — as do ano
          e as do mês não se somam.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Compra no ano</th>
              <th className="px-3 py-1.5 font-semibold text-right">Meses com direito</th>
              <th className="px-3 py-1.5 font-semibold text-right">Faixa do último mês</th>
              <th className="px-3 py-1.5 font-semibold text-right">Cashback do ano</th>
              <th className="px-3 py-1.5 font-semibold text-right" title="50% da compra do ano (§12 do documento do dono)">
                Meta para ativar (ano)
              </th>
              <th className="px-3 py-1.5 font-semibold text-right" title="A partir do que ele comprou no último mês com movimento">
                Falta p/ próxima faixa (último mês)
              </th>
            </tr>
          </thead>
          <tbody>
            {comDireito.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>{limparNomeCliente(c.nome)}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{rotuloTabela(c)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.meses_com_direito}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.ultima_faixa !== null ? `${c.ultima_faixa}%` : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.cashback ?? 0)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.meta_para_ativar !== null ? formatBRL(c.meta_para_ativar) : '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{c.falta_proxima_faixa !== null ? formatBRL(c.falta_proxima_faixa) : '—'}</td>
              </tr>
            ))}
            {!carregandoResumo && comDireito.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente com direito a cashback em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {resumo?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
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
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Não atingiram o mínimo</div>
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          A faixa é <strong>mensal</strong>: as duas colunas de valor são recortes diferentes e não se
          somam. O que o cliente comprou em cada mês está na evolução, abaixo.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Compra no ano</th>
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
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Ninguém comprou sem atingir o mínimo em {ano}.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Evolução mês a mês — cashback de cada cliente em cada mês do ano. Traço para "sem dado" (nenhuma venda no mês), nunca confundido com R$ 0,00 (tem programa, não atingiu). */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Evolução mês a mês em {ano}</div>
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          Traço: sem venda naquele mês. R$ 0,00: comprou, mas não atingiu o mínimo daquele mês.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              {MES_LABEL.map((m) => <th key={m} className="px-3 py-1.5 font-semibold text-right">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {evolucao.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>{limparNomeCliente(c.nome)}</Link>
                </td>
                {MESES.map((mm) => (
                  <td key={mm} className="px-3 py-1.5 text-right font-mono">
                    {c.meses[mm] !== undefined ? formatBRL(c.meses[mm] ?? 0) : '—'}
                  </td>
                ))}
              </tr>
            ))}
            {!carregandoMensal && evolucao.length === 0 && (
              <tr><td colSpan={13} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente com cashback em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {mensal?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>
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
  ano, clientes, tabelas,
}: {
  ano: number;
  clientes: { data?: CashbackFarolCliente[]; isLoading: boolean; isError: boolean };
  tabelas: { data?: CashbackFarolTabela[]; isLoading: boolean; isError: boolean };
}) {
  // Falha de leitura NÃO pode virar "nada a apontar" — num farol isso é pior que
  // em qualquer outra tela, porque o silêncio dele É a mensagem. Mesma defesa do
  // farol da bonificação, e é a regra 1 das cinco um degrau acima do `unwrap`.
  if (clientes.isError || tabelas.isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
        <strong>Não consegui ler a apuração de cashback de {ano}.</strong> Isto não quer dizer que não
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
        vazio={`Ninguém chegou perto da faixa sem bater, em ${ano}.`}
      >
        {perto.map((c) => (
          <li key={c.cliente_codigo} className="px-4 py-2 text-[12px] border-t border-border">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate">
                <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                  {limparNomeCliente(c.nome)}
                </Link>
                {c.tabela_base && <span className="ml-1.5 text-[10px] text-muted-foreground">{c.tabela_base}</span>}
                {/* O MÊS, sempre. É ele que fecha com o que faltou — ver o
                    cabeçalho da migration: a compra do ANO ao lado do que faltou
                    num MÊS não soma a faixa, e para 12 dos 20 clientes de 2026
                    os dois números contavam histórias diferentes. */}
                {c.competencia && (
                  <span className="ml-1.5 text-[10px] text-muted-foreground">{competenceLabel(c.competencia)}</span>
                )}
              </span>
              <span className="font-mono shrink-0 font-semibold">
                {c.comprou_da_faixa !== null ? `${c.comprou_da_faixa.toFixed(0)}%` : '—'}
              </span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
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
          <li key={c.cliente_codigo} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">
              <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline" title={c.nome}>
                {limparNomeCliente(c.nome)}
              </Link>
            </span>
            <span className="font-mono shrink-0 text-muted-foreground">
              comprou {formatBRL(c.comprado_no_ano)} em {ano}
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
          <li key={t.tabela_base} className="px-4 py-1.5 text-[12px] flex items-center justify-between gap-2 border-t border-border">
            <span className="truncate">{t.tabela_base}</span>
            <span className="font-mono shrink-0 text-muted-foreground">
              {t.clientes} {t.clientes === 1 ? 'cliente' : 'clientes'} · {formatBRL(t.comprado)}
            </span>
          </li>
        ))}
      </BlocoFarol>

      {/* A ponte para o analítico. Sem ela, o corte do farol pareceria perda de
          informação — e o que ele faz é guardar os 17 do outro lado da porta. */}
      <p className="text-[11px] text-muted-foreground">
        Quem faltou mais de um quarto da faixa, a apuração mês a mês e as grades completas estão no
        analítico.
      </p>
    </div>
  );
}
