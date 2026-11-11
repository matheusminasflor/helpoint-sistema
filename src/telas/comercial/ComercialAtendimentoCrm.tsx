// Comercial › Atendimento do CRM (projeto do Kommo, parte 4b; tela aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/9b6cYeC6VFZFvtwXttya6H, com a lista de leads, o valor e o bloco da Lyra de 2026-11-10).
// Desenho de 2026-11-11 (dono, https://claude.ai/artifact/YTvjHrndVfG5dmoiNS9RxZ), pelas Leis de UX:
//   * Proximidade: cada número que pede ação traz a lista dele no próprio quadro (antes a lista ficava no fim da página).
//   * Von Restorff: só o que pede ação tem borda colorida. Vermelho = cliente esperando; âmbar = dado a acertar no Kommo.
//   * Hick: um funil único, do cliente à resposta, com a Lyra dentro ("Só Lyra" e "Na fila" viraram etapas dele); os
//     quatro quadros de "onde" ficam em abas, um de cada vez.
//   * Jakob: fila de quem espera no alto e relatórios embaixo, como Zendesk, Intercom e as conversas do HubSpot.
// O dono, o admin e o gestor comercial veem todas; a atendente, só o dela (o banco recorta).
import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ExternalLink, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { useCrmAtendimento, useCrmAtualizadoEm } from '@/hooks/useCrmAtendimento';
import { useComissao } from '@/hooks/useComissao';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PERIODOS_DA_REUNIAO, intervaloDoPeriodoRapido, rotuloDoIntervalo } from '@/lib/period';
import { dataHora, diaCurto } from '@/lib/dates';
import {
  CAMPO_OBRIGATORIO, FALTA, LYRA_NO_AR, SEM_ESTADO, contagemDosCampos, dentroDaMeta, foraDeVenda, leadsSemSegmento, minutos,
  nomeDoEstado, nomeDoFunil, contarPorSegmento, leadsDaLinha, leadsDoRecorte, porEstado, porOrigem, porSegmento,
  type FiltroDosLeads, type LinhaDaLyra, type SituacaoDoLead,
} from '@/lib/crm-atendimento';
import { formatBRL } from '@/lib/crm';
import { cn } from '@/lib/utils';

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : '—');
const LILAS = 'bg-[hsl(var(--monday-purple))]';

/** O título de um bloco ou coluna com a explicação ao passar o mouse. */
function Nome({ id, children }: { id: IdDaExplicacao; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}<ExplicacaoDoIndicador id={id} /></span>;
}

const SITUACAO: Record<SituacaoDoLead, [string, string]> = {
  no_prazo: ['No prazo', 'badge-success'], fora_do_prazo: ['Fora do prazo', 'badge-warning'],
  sem_resposta: ['Sem resposta', 'badge-danger'], so_lyra: ['Só com a Lyra', 'badge-info'],
};
const FILTROS: [FiltroDosLeads, string][] = [
  ['todos', 'Todos'], ['sem_resposta', 'Sem resposta'], ['fora_do_prazo', 'Fora do prazo'], ['no_prazo', 'No prazo'],
  ['so_lyra', 'Só com a Lyra'], ['venda', 'Com venda'], ['perdida', 'Perdidas'],
];
const LINHAS_DA_LYRA: [LinhaDaLyra, string, string][] = [
  ['atendidos', 'Atendidos pela Lyra', 'na hora'], ['triados', 'Triados', 'ganharam segmento'],
  ['passou', 'Passou para atendente', 'com a triagem pronta'], ['resolveu', 'Resolveu sozinha', 'link da loja'],
  ['parou', 'Parou no meio', 'o cliente não respondeu'],
];
const oQueALyraFez = (l: { triado: boolean; passou: boolean; resolveu: boolean }) =>
  l.resolveu ? 'Resolveu sozinha' : l.passou ? (l.triado ? 'Triou e passou' : 'Passou sem triagem') : l.triado ? 'Triou e parou' : 'Parou no meio';
type Aba = 'segmento' | 'estado' | 'origem' | 'atendente';
const ABAS: [Aba, string][] = [['segmento', 'Por segmento'], ['estado', 'Por estado'], ['origem', 'Por origem'], ['atendente', 'Por atendente']];

function Tempo({ n, meta }: { n: number | null; meta: number }) {
  return (
    <span className={cn('font-semibold tabular-nums', n !== null && (dentroDaMeta(n, meta) ? 'text-status-success' : 'text-status-danger'))}>
      {minutos(n)}
    </span>
  );
}

/** "Atualizado": verde enquanto as leituras estão em dia, âmbar quando uma delas atrasou (conversas 30 min, vendas 2 h). */
function Atualizado() {
  const { data } = useCrmAtualizadoEm();
  if (!data?.conversas && !data?.vendas) return null;
  const atrasou = (iso: string | null | undefined, min: number) => !iso || Date.now() - Date.parse(iso) > min * 60_000;
  const emDia = !atrasou(data.conversas, 30) && !atrasou(data.vendas, 120);
  return (
    <p role="status" className={cn('text-[13px] font-semibold', emDia ? 'text-status-success' : 'text-status-warning')}>
      ● Conversas atualizadas em {data.conversas ? dataHora(data.conversas) : '—'} · vendas e cadastros em {data.vendas ? dataHora(data.vendas) : '—'}
      {!emDia && ' · o Kommo está atrasado, os números podem estar velhos'}
    </p>
  );
}

/** Link do lead no Kommo, ou só o nome. */
function LinkDoLead({ nome, link }: { nome: string; link: string | null | undefined }) {
  return link ? (
    <a href={link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1 min-w-0">
      <span className="truncate">{nome}</span> <ExternalLink className="h-3 w-3 shrink-0" aria-label="abrir no Kommo" />
    </a>
  ) : <span className="font-semibold">{nome}</span>;
}

/**
 * Um quadro que pede ação, com o número e a lista dele (Lei da proximidade). Mostra os 5 primeiros; "ver todos" abre o
 * resto no mesmo lugar. Sem nada, fica verde.
 */
function CartaoDeAcao<T>({ id, ancora, titulo, dica, tom, itens, vazio, linha }: {
  id: IdDaExplicacao; ancora: string; titulo: string; dica: string; tom: 'perigo' | 'aviso';
  itens: T[]; vazio: string; linha: (item: T) => React.ReactNode;
}) {
  const [todos, setTodos] = useState(false);
  const n = itens.length;
  const visiveis = todos ? itens : itens.slice(0, 5);
  return (
    <section id={ancora} aria-label={titulo} className={cn('rounded-xl border bg-card p-4 min-w-0 flex flex-col gap-2 scroll-mt-4',
      n && (tom === 'perigo' ? 'border-2 border-status-danger' : 'border-2 border-status-warning'))}>
      <div className="flex items-baseline gap-3">
        <p className={cn('text-3xl font-extrabold tabular-nums', !n ? 'text-status-success' : tom === 'perigo' ? 'text-status-danger' : 'text-status-warning')}>{n}</p>
        <div className="min-w-0">
          <p className="font-bold"><Nome id={id}>{titulo}</Nome></p>
          <p className="text-xs text-muted-foreground">{dica}</p>
        </div>
      </div>
      {n ? (
        <ul className={cn('divide-y text-sm', todos && 'max-h-96 overflow-y-auto')}>
          {visiveis.map((item, i) => <li key={i} className="py-1.5">{linha(item)}</li>)}
        </ul>
      ) : (
        <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> {vazio}</p>
      )}
      {n > 5 && (
        <button type="button" onClick={() => setTodos((v) => !v)} className="self-start text-[13px] font-semibold text-primary hover:underline">
          {todos ? 'Mostrar só os 5 primeiros' : `Ver os ${n}`}
        </button>
      )}
    </section>
  );
}

export default function ComercialAtendimentoCrm() {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<string>('esta_semana');
  const recorte = intervalo ?? intervaloDoPeriodoRapido('esta_semana');
  const { data, isLoading, error } = useCrmAtendimento(recorte.de, recorte.ate);
  const { data: comissao = [] } = useComissao(recorte.de, recorte.ate);
  const [uf, setUf] = useState<string | null>(null);
  const estados = useMemo(() => (data ? porEstado(data.cruzado) : []), [data]);
  const segmentos = useMemo(() => (data ? porSegmento(data.cruzado, data.vendas_cruzado, uf) : []), [data, uf]);
  const [segmento, setSegmento] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDosLeads>('todos');
  const [origem, setOrigem] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>('segmento');
  const origens = useMemo(() => porOrigem(data?.leads ?? []), [data]);
  const leads = useMemo(() => (data ? leadsDoRecorte(data.leads ?? [], uf, segmento, filtro, origem) : []), [data, uf, segmento, filtro, origem]);
  const semSegmento = useMemo(() => leadsSemSegmento(data?.leads ?? []), [data]);
  const irParaLeads = () => document.getElementById('leads')?.scrollIntoView({ behavior: 'smooth' });
  const verOrigem = (o: string) => { setOrigem(origem === o ? null : o); if (origem !== o) irParaLeads(); };
  const verFiltro = (f: FiltroDosLeads) => { setFiltro(f); irParaLeads(); };
  const nomeDoSegmento = segmentos.find((s) => s.chave === segmento)?.nome;
  const [linhaDaLyra, setLinhaDaLyra] = useState<LinhaDaLyra>('atendidos');
  const [verLyra, setVerLyra] = useState(false);
  const leadsDaLyra = data?.lyra ? leadsDaLinha(data.lyra.leads, linhaDaLyra) : [];
  const [atendente, setAtendente] = useState<string | null>(null);
  const vendasDela = (data?.leads ?? []).filter((l) => l.venda === 'ganha' && l.atendente === atendente);
  const contagem = data ? contagemDosCampos(data.campos_faltando) : [];
  const naFila = data ? data.conversas - data.so_lyra : 0;
  const maiorEstado = Math.max(1, ...estados.map((e) => e.conversas));

  // O funil: cada etapa com a cor do que ela quer dizer; clicar filtra a lista de leads (as lilases abrem a Lyra).
  const funil = data ? ([
    { nome: 'Clientes que escreveram', id: 'crm.conversas', n: data.conversas, cor: 'bg-primary', filtro: 'todos' },
    ...(data.lyra ? [{ nome: 'Atendidos pela Lyra', id: 'crm.lyra', n: data.lyra.atendidos, cor: LILAS, lyra: true }] : []),
    { nome: 'Ficaram só com a Lyra', id: 'crm.so_lyra', n: data.so_lyra, cor: LILAS, filtro: 'so_lyra', recuo: true },
    { nome: 'Chegaram à atendente', id: 'crm.na_fila', n: naFila, cor: 'bg-primary' },
    { nome: 'Respondidos no prazo', id: 'crm.no_prazo', n: data.no_prazo, cor: 'bg-status-success', filtro: 'no_prazo', recuo: true },
    { nome: 'Respondidos fora do prazo', id: 'crm.respondidos', n: data.respondidas - data.no_prazo, cor: 'bg-status-warning', filtro: 'fora_do_prazo', recuo: true },
    { nome: 'Sem resposta', id: 'crm.sem_resposta', n: data.sem_resposta, cor: 'bg-status-danger', filtro: 'sem_resposta', recuo: true },
  ] as { nome: string; id: IdDaExplicacao; n: number; cor: string; filtro?: FiltroDosLeads; lyra?: boolean; recuo?: boolean }[]) : [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Atendimento do CRM"
        subtitle={`WhatsApp e Instagram no Kommo · ${rotuloDoIntervalo(recorte)}`}
        period={periodo}
        onPeriodChange={(v) => escolher(v, recorte)}
        intervalo={intervalo}
        onIntervaloChange={definirIntervalo}
        periodOptions={PERIODOS_DA_REUNIAO}
      />
      <Atualizado />

      {error && (
        <Card className="p-4 text-sm text-status-danger" role="alert">Não deu para ler o Atendimento do CRM: {(error as Error).message}</Card>
      )}
      {isLoading && <Card className="p-6 text-sm text-muted-foreground">Lendo as conversas…</Card>}

      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-3" aria-label="Agora">
            <CartaoDeAcao id="crm.aguardando" ancora="aguardando" titulo="Aguardando resposta" tom="perigo"
              dica={data.para_responder.length ? `o mais antigo desde ${dataHora(data.para_responder[0].desde)}` : 'agora, com a conversa aberta'}
              itens={data.para_responder} vazio="Ninguém esperando resposta."
              linha={(l) => (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <LinkDoLead nome={l.nome} link={l.link} />
                  <span className="text-xs text-muted-foreground">
                    {foraDeVenda(l) && <span className="badge-info mr-1">Fora de venda</span>}
                    {nomeDoFunil(l.segmento, l.funil)}{l.uf ? ` · ${l.uf}` : ''} · desde {dataHora(l.desde)}
                  </span>
                </div>
              )} />
            <CartaoDeAcao id="crm.sem_segmento" ancora="sem-segmento" titulo="Sem segmento" tom="aviso"
              dica="mova para o funil certo no Kommo" itens={semSegmento} vazio="Todos os clientes do período têm segmento."
              linha={(l) => (
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <LinkDoLead nome={l.nome ?? `Lead ${l.lead_id}`} link={l.link} />
                  <span className="text-xs text-muted-foreground">Entrada · {l.etapa ?? '—'}{l.atendente ? ` · ${l.atendente}` : ''}</span>
                </div>
              )} />
            <CartaoDeAcao id="crm.cadastro" ancora="cadastro" titulo="Cadastro incompleto" tom="aviso"
              dica="venda ou perda com dado faltando: complete no Kommo" itens={data.campos_faltando}
              vazio="Todas as vendas e perdas do período estão completas."
              linha={(v) => (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <LinkDoLead nome={v.nome} link={v.link} />
                    <span className="text-xs text-muted-foreground"> · {nomeDoFunil(v.funil, null)} · {v.situacao === 'ganha' ? 'venda' : 'perda'} em {diaCurto(v.fechou)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {v.faltam.map((c) => <span key={c} className={c === 'valor_kommo' ? 'badge-warning' : 'badge-danger'}>{FALTA[c]}</span>)}
                  </span>
                </div>
              )} />
          </div>
          {data.campos_faltando.length > 0 && (
            <p className="-mt-3 flex flex-wrap gap-2 text-xs">
              {contagem.filter((c) => c.quantos).map((c) => (
                <span key={c.campo} className="badge-danger">{CAMPO_OBRIGATORIO[c.campo]}: {c.quantos}</span>
              ))}
            </p>
          )}

          <section aria-label="Vendas" className="grid gap-4 sm:grid-cols-3">
            <ExplicacaoDoIndicador id="crm.venda_total">
              <div className="rounded-xl border-2 border-primary p-4 bg-card">
                <p className="text-3xl font-extrabold tabular-nums">{formatBRL(data.valor_ganho)}</p>
                <p className="font-bold">Venda total</p>
                <p className="text-xs text-muted-foreground">{data.ganhas} {data.ganhas === 1 ? 'venda' : 'vendas'} no período</p>
              </div>
            </ExplicacaoDoIndicador>
            <div className="rounded-xl border p-4 bg-card">
              <p className="text-3xl font-extrabold tabular-nums">{data.ganhas ? formatBRL(data.valor_ganho / data.ganhas) : '—'}</p>
              <p className="font-bold">Ticket médio</p>
              <p className="text-xs text-muted-foreground">venda total ÷ vendas</p>
            </div>
            <button type="button" onClick={() => verFiltro('perdida')} disabled={!data.perdidas}
              className="rounded-xl border p-4 bg-card text-left enabled:hover:bg-muted">
              <p className="text-3xl font-extrabold tabular-nums">{data.perdidas}</p>
              <p className="font-bold">Perdas</p>
              <p className="text-xs text-muted-foreground">{data.perdidas ? 'ver quem são na lista de leads' : 'leads fechados como perdidos'}</p>
            </button>
          </section>

          <Card className="p-4 sm:p-6 space-y-3 min-w-0">
            <h2 className="text-base font-bold"><Nome id="crm.funil">Do cliente à resposta</Nome></h2>
            <ul className="grid gap-1.5 text-sm">
              {funil.map((e) => (
                <li key={e.nome} className="grid grid-cols-[minmax(9rem,14rem)_1fr_3rem] items-center gap-3 rounded px-1 py-0.5 hover:bg-muted/60">
                  <span className={cn('flex items-center gap-1 min-w-0', e.recuo && 'pl-4 text-muted-foreground')}>
                    {e.recuo && <span aria-hidden="true">·</span>}
                    {e.filtro || e.lyra ? (
                      <button type="button" className="text-left hover:underline inline-flex items-center gap-1"
                        aria-expanded={e.lyra ? verLyra : undefined}
                        onClick={() => (e.lyra ? setVerLyra((v) => !v) : verFiltro(e.filtro!))}>
                        {e.nome}
                        {e.lyra && <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', verLyra && 'rotate-180')} aria-hidden="true" />}
                      </button>
                    ) : e.nome}
                    <ExplicacaoDoIndicador id={e.id} />
                  </span>
                  <span className="h-5 rounded bg-muted" aria-hidden="true">
                    <span className={cn('block h-5 rounded', e.cor)}
                      style={{ width: `${data.conversas ? (e.n ? Math.max(2, (e.n / data.conversas) * 100) : 0) : 0}%` }} />
                  </span>
                  <span className="text-right font-bold tabular-nums">{e.n}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
              <span><Nome id="crm.tempo">Tempo da 1ª resposta</Nome>: <Tempo n={data.primeira_resposta} meta={data.meta} /> <span className="text-muted-foreground">(meta {data.meta} min · {pct(data.no_prazo, data.respondidas)} no prazo)</span></span>
            </p>
            <p className="text-xs text-muted-foreground">
              Clique numa linha para ver os leads dela. {data.lyra ? 'A linha lilás "Atendidos pela Lyra" abre o que ela fez.' : `A Lyra entrou no ar em ${LYRA_NO_AR}.`}
            </p>

            {data.lyra && verLyra && (
              <div className="rounded-lg border-2 border-[hsl(var(--monday-purple))] p-3 sm:p-4 space-y-4">
                <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
                  <ul className="space-y-1 text-sm">
                    {LINHAS_DA_LYRA.map(([k, nome, dica]) => {
                      const n = k === 'atendidos' ? data.lyra!.atendidos : data.lyra![k];
                      return (
                        <li key={k}>
                          <button type="button" aria-pressed={linhaDaLyra === k} onClick={() => setLinhaDaLyra(k)}
                            className={cn('w-full grid grid-cols-[11rem_1fr_2.5rem] items-center gap-3 rounded px-1 py-1 text-left hover:bg-muted',
                              linhaDaLyra === k && 'bg-muted ring-1 ring-[hsl(var(--monday-purple))]')}>
                            <span>{nome}<span className="block text-xs text-muted-foreground">
                              {k === 'atendidos' ? `${dica}, ${data.lyra!.mensagens} mensagens` : dica}
                            </span></span>
                            <span className="h-4 rounded bg-muted" aria-hidden="true">
                              <span className={cn('block h-4 rounded', LILAS)}
                                style={{ width: `${data.lyra!.atendidos ? (n / data.lyra!.atendidos) * 100 : 0}%` }} />
                            </span>
                            <span className="text-right font-bold tabular-nums">{n}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold mb-2">Por segmento</h3>
                    <ul className="divide-y text-sm">
                      {contarPorSegmento(data.lyra.leads).map((s) => (
                        <li key={s.nome} className="py-1.5 flex justify-between gap-3"><span>{s.nome}</span><b className="tabular-nums">{s.n}</b></li>
                      ))}
                      {!data.lyra.leads.length && <li className="py-1.5 text-muted-foreground">A Lyra não atendeu ninguém no período.</li>}
                    </ul>
                  </div>
                </div>
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground sticky top-0 bg-card">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-semibold">Lead</th>
                        <th className="py-2 px-2 font-semibold">Segmento</th>
                        <th className="py-2 px-2 font-semibold">O que a Lyra fez</th>
                        <th className="py-2 pl-2 font-semibold">Agora</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leadsDaLyra.map((l) => (
                        <tr key={l.lead_id} className="border-b last:border-0">
                          <td className="py-2 pr-3"><LinkDoLead nome={l.nome ?? `Lead ${l.lead_id}`} link={l.link} /></td>
                          <td className="py-2 px-2 whitespace-nowrap">{nomeDoFunil(l.segmento, l.funil)}</td>
                          <td className="py-2 px-2 whitespace-nowrap"><span className="badge-info">{oQueALyraFez(l)}</span></td>
                          <td className="py-2 pl-2 whitespace-nowrap text-muted-foreground">{l.etapa ?? '—'}</td>
                        </tr>
                      ))}
                      {!leadsDaLyra.length && <tr><td colSpan={4} className="py-4 text-muted-foreground">Nenhum lead nesta linha.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-muted-foreground">
                  {data.robo?.mensagens ? `A Lyra mandou ${data.robo.mensagens} mensagens para ${data.robo.leads} leads no período. ` : ''}
                  Quem já é cliente num funil não passa pela Lyra: vai direto para a atendente.
                </p>
              </div>
            )}
          </Card>

          <Card className="p-4 sm:p-6 min-w-0 space-y-4">
            <div role="tablist" aria-label="Onde" className="flex flex-wrap items-center gap-2">
              {ABAS.map(([k, rotulo]) => (
                <button key={k} type="button" role="tab" aria-selected={aba === k} onClick={() => setAba(k)}
                  className={cn('rounded-full border px-3 py-1 text-[13px] font-semibold',
                    aba === k ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}>
                  {rotulo}
                </button>
              ))}
              {uf && (
                <button type="button" onClick={() => setUf(null)} className="badge-info inline-flex items-center gap-1">
                  {nomeDoEstado(uf === SEM_ESTADO ? null : uf)} <X className="h-3 w-3" aria-label="tirar o filtro" />
                </button>
              )}
            </div>

            {aba === 'segmento' && (
              <div role="tabpanel" aria-label="Por segmento">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-semibold"><Nome id="crm.segmento">Segmento</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right">Conversas</th>
                        <th className="py-2 px-2 font-semibold text-right">Sem resposta</th>
                        <th className="py-2 px-2 font-semibold text-right">Tempo</th>
                        <th className="py-2 px-2 font-semibold text-right">Vendas</th>
                        <th className="py-2 pl-2 font-semibold text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {segmentos.map((s) => (
                        <tr key={s.chave} className={cn('border-b last:border-0 cursor-pointer hover:bg-muted', segmento === s.chave && 'bg-muted')}
                          onClick={() => setSegmento(segmento === s.chave ? null : s.chave)}>
                          <td className="py-2 pr-3 font-semibold">
                            <button type="button" aria-pressed={segmento === s.chave} className="text-left text-primary hover:underline"
                              onClick={(e) => { e.stopPropagation(); setSegmento(segmento === s.chave ? null : s.chave); }}>
                              {s.nome}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{s.conversas}</td>
                          <td className={cn('py-2 px-2 text-right tabular-nums', s.sem_resposta && 'font-bold text-status-danger')}>{s.sem_resposta}</td>
                          <td className="py-2 px-2 text-right"><Tempo n={s.tempo} meta={data.meta} /></td>
                          <td className="py-2 px-2 text-right tabular-nums">{s.vendas || '—'}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">{s.valor ? formatBRL(s.valor) : '—'}</td>
                        </tr>
                      ))}
                      {!segmentos.length && <tr><td colSpan={6} className="py-4 text-muted-foreground">Nenhuma conversa no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Clique num segmento para ver os leads dele na lista abaixo.</p>
              </div>
            )}

            {aba === 'estado' && (
              <div role="tabpanel" aria-label="Por estado">
                <ul className="space-y-1.5 text-sm">
                  {estados.map((e) => {
                    const clicavel = e.uf !== 'outros';
                    const escolhido = uf === e.uf;
                    return (
                      <li key={e.uf}>
                        <button type="button" disabled={!clicavel} onClick={() => setUf(escolhido ? null : e.uf)}
                          aria-pressed={escolhido}
                          className={cn('w-full grid grid-cols-[8.5rem_1fr_2.5rem] items-center gap-2 rounded px-1 py-0.5 text-left',
                            clicavel && 'hover:bg-muted', escolhido && 'bg-muted ring-1 ring-primary')}>
                          <span className={cn('truncate', e.uf === SEM_ESTADO && 'text-muted-foreground')}>{e.nome}</span>
                          <span className="h-3.5 rounded bg-muted" aria-hidden="true">
                            <span className={cn('block h-3.5 rounded', e.uf === SEM_ESTADO ? 'bg-muted-foreground/40' : 'bg-primary')}
                              style={{ width: `${(e.conversas / maiorEstado) * 100}%` }} />
                          </span>
                          <span className="text-right font-bold tabular-nums">{e.conversas}</span>
                        </button>
                      </li>
                    );
                  })}
                  {!estados.length && <li className="text-muted-foreground">Nenhuma conversa no período.</li>}
                </ul>
                <p className="mt-3 text-xs text-muted-foreground"><Nome id="crm.estado">Clique num estado</Nome> para ver os segmentos e os leads só dele.</p>
              </div>
            )}

            {aba === 'origem' && (
              <div role="tabpanel" aria-label="Por origem">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-semibold"><Nome id="crm.origem">Origem</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right">Leads</th>
                        <th className="py-2 px-2 font-semibold text-right">Vendas</th>
                        <th className="py-2 px-2 font-semibold text-right">Valor</th>
                        <th className="py-2 pl-2 font-semibold text-right">Conversão</th>
                      </tr>
                    </thead>
                    <tbody>
                      {origens.map((o) => (
                        <tr key={o.origem} className={cn('border-b last:border-0 cursor-pointer hover:bg-muted', origem === o.origem && 'bg-muted')}
                          onClick={() => verOrigem(o.origem)}>
                          <td className="py-2 pr-3 font-semibold">
                            <button type="button" aria-pressed={origem === o.origem}
                              className={cn('text-left hover:underline', o.origem === 'Sem origem' ? 'text-muted-foreground' : 'text-primary')}
                              onClick={(e) => { e.stopPropagation(); verOrigem(o.origem); }}>
                              {o.origem}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.leads}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.vendas || '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{o.valor ? formatBRL(o.valor) : '—'}</td>
                          <td className="py-2 pl-2 text-right tabular-nums">{o.leads ? `${Math.round((o.vendas / o.leads) * 100)}%` : '—'}</td>
                        </tr>
                      ))}
                      {!origens.length && <tr><td colSpan={5} className="py-4 text-muted-foreground">Nenhum lead no período.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Clique numa origem para ver os leads dela. A origem começou a ser gravada em 10/11; os leads de antes ficam como "Sem origem".</p>
              </div>
            )}

            {aba === 'atendente' && (
              <div role="tabpanel" aria-label="Por atendente">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr className="border-b">
                        <th className="py-2 pr-3 font-semibold">Quem</th>
                        <th className="py-2 px-2 font-semibold text-right"><Nome id="crm.respondidos">Respondidos</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right"><Nome id="crm.tempo">Tempo</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right"><Nome id="crm.no_prazo">No prazo</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right"><Nome id="crm.ativos">Ativos</Nome></th>
                        <th className="py-2 px-2 font-semibold text-right">Tarefas</th>
                        <th className="py-2 px-2 font-semibold text-right">Vendas</th>
                        <th className="py-2 px-2 font-semibold text-right">Valor</th>
                        <th className="py-2 px-2 font-semibold text-right">Ticket médio</th>
                        <th className="py-2 px-2 font-semibold text-right">Perdas</th>
                        <th className="py-2 pl-2 font-semibold text-right"><Nome id="com.comissao">Comissão</Nome></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.atendentes.map((a) => (
                        <tr key={a.kommo_id} className={cn('border-b last:border-0 cursor-pointer hover:bg-muted', atendente === a.nome && 'bg-muted')}
                          onClick={() => setAtendente(atendente === a.nome ? null : a.nome)}>
                          <td className="py-2 pr-3 font-semibold">
                            <button type="button" aria-pressed={atendente === a.nome} className="text-left text-primary hover:underline"
                              onClick={(e) => { e.stopPropagation(); setAtendente(atendente === a.nome ? null : a.nome); }}>
                              {a.nome}
                            </button>
                          </td>
                          <td className="py-2 px-2 text-right tabular-nums">{a.respondidos}</td>
                          <td className="py-2 px-2 text-right"><Tempo n={a.primeira_resposta} meta={data.meta} /></td>
                          <td className="py-2 px-2 text-right tabular-nums">{pct(a.no_prazo, a.respondidos)}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{a.ativos}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{a.tarefas}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{a.ganhas}</td>
                          <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{a.valor ? formatBRL(a.valor) : '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">{a.ganhas && a.valor ? formatBRL(a.valor / a.ganhas) : '—'}</td>
                          <td className="py-2 px-2 text-right tabular-nums">{a.perdidas}</td>
                          <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
                            {(() => {
                              // A comissão do CRM é por atendente do Kommo (`com_comissao`, tipo 'crm'), pelo nome dela lá.
                              const dela = comissao.filter((c) => c.tipo === 'crm' && c.pessoa_nome === a.nome);
                              const g = dela.reduce((s, c) => s + c.garantida, 0);
                              const p = dela.reduce((s, c) => s + c.a_confirmar, 0);
                              return dela.length ? (
                                <span title={dela.map((c) => `${c.origem}: ${formatBRL(c.garantida)} garantida, ${formatBRL(c.a_confirmar)} a confirmar`).join('\n')}>
                                  <b className="text-primary">{formatBRL(g + p)}</b>
                                  <span className="block text-[11px] text-muted-foreground">{formatBRL(g)} garantida</span>
                                </span>
                              ) : '—';
                            })()}
                          </td>
                        </tr>
                      ))}
                      {data.todos && (
                        <tr className="text-[hsl(var(--monday-purple))]">
                          <td className="py-2 pr-3 font-semibold"><Nome id="crm.lyra">Lyra</Nome></td>
                          <td className="py-2 px-2 text-right tabular-nums">{data.lyra?.atendidos || '—'}</td>
                          <td className="py-2 px-2 text-right">{data.robo?.mensagens ? 'na hora' : '—'}</td>
                          <td className="py-2 px-2 text-right" colSpan={8}>—</td>
                        </tr>
                      )}
                      {!data.atendentes.length && !data.todos && (
                        <tr><td colSpan={11} className="py-4 text-muted-foreground">Seu usuário do Kommo ainda não está ligado ao seu login. Peça ao administrador.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {atendente && (
                  <div className="mt-4 space-y-3">
                    <h3 className="text-sm font-bold">{atendente}: vendas por segmento e por lead</h3>
                    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
                      {contarPorSegmento(vendasDela, (l) => Number(l.valor ?? 0)).map((s) => (
                        <div key={s.nome} className="rounded-lg border p-3">
                          <p className="text-xs text-muted-foreground">{s.nome}</p>
                          <p className="text-lg font-extrabold tabular-nums">{formatBRL(s.total)}</p>
                          <p className="text-xs text-muted-foreground">{s.n} {s.n === 1 ? 'venda' : 'vendas'}</p>
                        </div>
                      ))}
                    </div>
                    <ul className="divide-y text-sm">
                      {vendasDela.map((l) => (
                        <li key={l.lead_id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
                          <LinkDoLead nome={l.nome ?? `Lead ${l.lead_id}`} link={l.link} />
                          <span className="text-xs text-muted-foreground">
                            {nomeDoFunil(l.segmento, l.funil)} · <b className="tabular-nums text-foreground">{l.valor ? formatBRL(l.valor) : 'sem valor'}</b>
                          </span>
                        </li>
                      ))}
                      {!vendasDela.length && <li className="py-2 text-muted-foreground">Nenhuma venda no período.</li>}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card id="leads" className="p-4 sm:p-6 min-w-0 scroll-mt-4">
            <h2 className="text-base font-bold mb-3 flex flex-wrap items-center gap-2">
              <Nome id="crm.leads">Leads</Nome> <span className="tabular-nums text-muted-foreground">· {leads.length}</span>
              {uf && (
                <button type="button" onClick={() => setUf(null)} className="badge-info inline-flex items-center gap-1">
                  {nomeDoEstado(uf === SEM_ESTADO ? null : uf)} <X className="h-3 w-3" aria-label="tirar o filtro" />
                </button>
              )}
              {segmento && (
                <button type="button" onClick={() => setSegmento(null)} className="badge-info inline-flex items-center gap-1">
                  {nomeDoSegmento ?? 'Segmento'} <X className="h-3 w-3" aria-label="tirar o filtro" />
                </button>
              )}
              {origem && (
                <button type="button" onClick={() => setOrigem(null)} className="badge-info inline-flex items-center gap-1">
                  {origem} <X className="h-3 w-3" aria-label="tirar o filtro" />
                </button>
              )}
            </h2>
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar os leads">
              {FILTROS.map(([f, rotulo]) => (
                <button key={f} type="button" aria-pressed={filtro === f} onClick={() => setFiltro(f)}
                  className={cn('rounded-full border px-3 py-1 text-[13px] font-semibold',
                    filtro === f ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted')}>
                  {rotulo}
                </button>
              ))}
            </div>
            <div className="overflow-x-auto max-h-[28rem] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground sticky top-0 bg-card">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-semibold">Lead</th>
                    <th className="py-2 px-2 font-semibold">Segmento</th>
                    <th className="py-2 px-2 font-semibold">Estado</th>
                    <th className="py-2 px-2 font-semibold">Atendente</th>
                    <th className="py-2 px-2 font-semibold">Situação</th>
                    <th className="py-2 px-2 font-semibold text-right">Tempo</th>
                    <th className="py-2 pl-2 font-semibold text-right">Venda</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((l) => (
                    <tr key={l.lead_id} className="border-b last:border-0">
                      <td className="py-2 pr-3"><LinkDoLead nome={l.nome ?? `Lead ${l.lead_id}`} link={l.link} /></td>
                      <td className="py-2 px-2 whitespace-nowrap">{nomeDoFunil(l.segmento, l.funil)}</td>
                      <td className="py-2 px-2">{l.uf ?? '—'}</td>
                      <td className="py-2 px-2 whitespace-nowrap">{l.atendente ?? '—'}</td>
                      <td className="py-2 px-2 whitespace-nowrap">
                        {l.situacao ? <span className={SITUACAO[l.situacao][1]}>{SITUACAO[l.situacao][0]}</span> : <span className="text-muted-foreground">sem conversa</span>}
                      </td>
                      <td className="py-2 px-2 text-right"><Tempo n={l.minutos} meta={data.meta} /></td>
                      <td className="py-2 pl-2 text-right tabular-nums whitespace-nowrap">
                        {l.venda === 'ganha' ? (l.valor ? formatBRL(l.valor) : 'sem valor') : l.venda === 'perdida' ? <span className="text-status-danger">perdida</span> : '—'}
                      </td>
                    </tr>
                  ))}
                  {!leads.length && <tr><td colSpan={7} className="py-4 text-muted-foreground">Nenhum lead com esse filtro.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">Quem conversou no período e quem fechou venda ou perdeu nele. Cada nome abre o lead no Kommo.</p>
          </Card>

          <p className="text-xs text-muted-foreground">
            {data.todos ? 'Cada atendente vê só a linha dela; dono, admin e gestor comercial veem todas. ' : 'Você vê só os seus leads e a sua linha. '}
            Equipe, fornecedores e artistas (etiquetas no Kommo) não entram. As conversas são lidas a cada 10 minutos; as vendas e os
            cadastros, de hora em hora. Conversa encerrada no Kommo e lead apagado não ficam esperando resposta.
          </p>
        </>
      )}
    </div>
  );
}
