// Comercial › Atendimento do CRM (projeto do Kommo, parte 4b; tela nova aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/9b6cYeC6VFZFvtwXttya6H). Três perguntas, nesta ordem: o que precisa de ação agora, como foi o
// atendimento (do cliente que escreveu à resposta no prazo) e onde (segmento × estado). Nomes de uma ou duas palavras; a
// explicação de cada um aparece ao passar o mouse (`crm.*` em explicacoes-dos-indicadores.ts).
// Cor com significado: vermelho é o que espera alguém, verde o que está na meta, lilás a Lyra. O dono, o admin e o gestor
// comercial veem todas; a atendente, só o dela (o banco recorta).
// 2026-11-10 (dono, https://claude.ai/artifact/Cb9s4F1Tt2CbJ9cxebSp6k): Venda total no alto, Valor por segmento e a lista
// de quem são os leads, que segue o estado e o segmento clicados e abre cada lead no Kommo. Depois (proposta v2,
// https://claude.ai/artifact/V3CCSk1ZWAuL1YUShGQi2R): o bloco da Lyra, o valor por atendente e as perdas na lista.
import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { useCrmAtendimento, useCrmAtualizadoEm } from '@/hooks/useCrmAtendimento';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PERIODOS_DA_REUNIAO, intervaloDoPeriodoRapido, rotuloDoIntervalo } from '@/lib/period';
import { dataHora, diaCurto } from '@/lib/dates';
import {
  CAMPO_OBRIGATORIO, FALTA, LYRA_NO_AR, SEM_ESTADO, contagemDosCampos, dentroDaMeta, minutos, nomeDoEstado, nomeDoFunil,
  contarPorSegmento, leadsDaLinha, leadsDoRecorte, porEstado, porOrigem, porSegmento, type FiltroDosLeads, type LinhaDaLyra, type SituacaoDoLead,
} from '@/lib/crm-atendimento';
import { formatBRL } from '@/lib/crm';
import { cn } from '@/lib/utils';

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : '—');

/** O título de um bloco ou coluna com a explicação ao passar o mouse. */
function Nome({ id, children }: { id: IdDaExplicacao; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}<ExplicacaoDoIndicador id={id} /></span>;
}

const SITUACAO: Record<SituacaoDoLead, [string, string]> = {
  no_prazo: ['No prazo', 'badge-success'], fora_do_prazo: ['Fora do prazo', 'badge-warning'],
  sem_resposta: ['Sem resposta', 'badge-danger'], so_lyra: ['Só Lyra', 'badge-info'],
};
const FILTROS: [FiltroDosLeads, string][] = [
  ['todos', 'Todos'], ['sem_resposta', 'Sem resposta'], ['fora_do_prazo', 'Fora do prazo'], ['venda', 'Com venda'], ['perdida', 'Perdidas'],
];
const LINHAS_DA_LYRA: [LinhaDaLyra, string, string][] = [
  ['atendidos', 'Atendidos pela Lyra', 'na hora'], ['triados', 'Triados', 'ganharam segmento'],
  ['passou', 'Passou para atendente', 'com a triagem pronta'], ['resolveu', 'Resolveu sozinha', 'link da loja'],
  ['parou', 'Parou no meio', 'o cliente não respondeu'],
];
const oQueALyraFez = (l: { triado: boolean; passou: boolean; resolveu: boolean }) =>
  l.resolveu ? 'Resolveu sozinha' : l.passou ? (l.triado ? 'Triou e passou' : 'Passou sem triagem') : l.triado ? 'Triou e parou' : 'Parou no meio';

/** "Atualizado às": verde enquanto as leituras estão em dia, âmbar quando uma delas atrasou (conversas 30 min, vendas 2 h). */
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

function Tempo({ n, meta }: { n: number | null; meta: number }) {
  return (
    <span className={cn('font-semibold tabular-nums', n !== null && (dentroDaMeta(n, meta) ? 'text-status-success' : 'text-status-danger'))}>
      {minutos(n)}
    </span>
  );
}

export default function ComercialAtendimentoCrm() {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<string>('esta_semana');
  const recorte = intervalo ?? intervaloDoPeriodoRapido('esta_semana');
  const { data, isLoading, error } = useCrmAtendimento(recorte.de, recorte.ate);
  const [uf, setUf] = useState<string | null>(null);
  const estados = useMemo(() => (data ? porEstado(data.cruzado) : []), [data]);
  const segmentos = useMemo(() => (data ? porSegmento(data.cruzado, data.vendas_cruzado, uf) : []), [data, uf]);
  const [segmento, setSegmento] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroDosLeads>('todos');
  const [origem, setOrigem] = useState<string | null>(null);
  const origens = useMemo(() => porOrigem(data?.leads ?? []), [data]);
  const leads = useMemo(() => (data ? leadsDoRecorte(data.leads ?? [], uf, segmento, filtro, origem) : []), [data, uf, segmento, filtro, origem]);
  const verOrigem = (o: string) => { setOrigem(origem === o ? null : o); if (origem !== o) document.getElementById('leads')?.scrollIntoView({ behavior: 'smooth' }); };
  const nomeDoSegmento = segmentos.find((s) => s.chave === segmento)?.nome;
  const [linhaDaLyra, setLinhaDaLyra] = useState<LinhaDaLyra>('atendidos');
  const leadsDaLyra = data?.lyra ? leadsDaLinha(data.lyra.leads, linhaDaLyra) : [];
  const [atendente, setAtendente] = useState<string | null>(null);
  const vendasDela = (data?.leads ?? []).filter((l) => l.venda === 'ganha' && l.atendente === atendente);
  const verPerdidas = () => { setFiltro('perdida'); document.getElementById('leads')?.scrollIntoView({ behavior: 'smooth' }); };
  const contagem = data ? contagemDosCampos(data.campos_faltando) : [];
  const naFila = data ? data.conversas - data.so_lyra : 0;
  const maiorEstado = Math.max(1, ...estados.map((e) => e.conversas));

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
          <section aria-label="Agora" className="grid gap-4 sm:grid-cols-2">
            <ExplicacaoDoIndicador id="crm.aguardando">
              <a href="#aguardando" className={cn('block rounded-xl border p-4 bg-card', data.para_responder.length && 'border-status-danger bg-status-danger/10')}>
                <p className={cn('text-3xl font-extrabold tabular-nums', data.para_responder.length ? 'text-status-danger' : 'text-status-success')}>
                  {data.para_responder.length}
                </p>
                <p className="font-bold">Aguardando resposta</p>
                <p className="text-xs text-muted-foreground">
                  {data.para_responder.length ? `o mais antigo desde ${dataHora(data.para_responder[0].desde)}` : 'ninguém esperando agora'}
                </p>
              </a>
            </ExplicacaoDoIndicador>
            <ExplicacaoDoIndicador id="crm.cadastro">
              <a href="#cadastro" className={cn('block rounded-xl border p-4 bg-card', data.campos_faltando.length && 'border-status-danger bg-status-danger/10')}>
                <p className={cn('text-3xl font-extrabold tabular-nums', data.campos_faltando.length ? 'text-status-danger' : 'text-status-success')}>
                  {data.campos_faltando.length}
                </p>
                <p className="font-bold">Cadastro incompleto</p>
                <p className="text-xs text-muted-foreground">vendas sem CNPJ, valor ou motivo</p>
              </a>
            </ExplicacaoDoIndicador>
          </section>

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
            <button type="button" onClick={verPerdidas} disabled={!data.perdidas}
              className="rounded-xl border p-4 bg-card text-left enabled:hover:bg-muted">
              <p className="text-3xl font-extrabold tabular-nums">{data.perdidas}</p>
              <p className="font-bold">Perdas</p>
              <p className="text-xs text-muted-foreground">{data.perdidas ? 'ver quem são na lista de leads' : 'leads fechados como perdidos'}</p>
            </button>
          </section>

          <Card className="p-4 sm:p-6 space-y-3">
            <h2 className="text-base font-bold">Atendimento</h2>
            <dl className="grid gap-2 text-sm">
              {([
                ['crm.conversas', 'Conversas', data.conversas, 'bg-primary'],
                ['crm.so_lyra', 'Só Lyra', data.so_lyra, 'bg-[hsl(var(--monday-purple))]'],
                ['crm.na_fila', 'Na fila', naFila, 'bg-primary'],
                ['crm.respondidos', 'Respondidos', data.respondidas, 'bg-status-success'],
                ['crm.no_prazo', 'No prazo', data.no_prazo, 'bg-status-success'],
                ['crm.sem_resposta', 'Sem resposta', data.sem_resposta, 'bg-status-danger'],
              ] as const).map(([id, nome, n, cor]) => (
                <div key={id} className="grid grid-cols-[8.5rem_1fr_3rem] items-center gap-3">
                  <dt><Nome id={id}>{nome}</Nome></dt>
                  <dd className="h-5 rounded bg-muted" aria-hidden="true">
                    <div className={cn('h-5 rounded', cor)} style={{ width: `${data.conversas ? (n ? Math.max(2, (n / data.conversas) * 100) : 0) : 0}%` }} />
                  </dd>
                  <dd className="text-right font-bold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
              <span><Nome id="crm.tempo">Tempo</Nome>: <Tempo n={data.primeira_resposta} meta={data.meta} /> <span className="text-muted-foreground">(meta {data.meta} min · {pct(data.no_prazo, data.respondidas)} no prazo)</span></span>
            </p>
          </Card>

          {data.lyra && (
            <Card className="p-4 sm:p-6 min-w-0 space-y-4 border-2 border-[hsl(var(--monday-purple))]">
              <h2 className="text-base font-bold"><Nome id="crm.lyra">Lyra</Nome></h2>
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
                            <span className="block h-4 rounded bg-[hsl(var(--monday-purple))]"
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
                        <td className="py-2 pr-3">
                          {l.link ? (
                            <a href={l.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                              {l.nome ?? `Lead ${l.lead_id}`} <ExternalLink className="h-3 w-3" aria-label="abrir no Kommo" />
                            </a>
                          ) : <span className="font-semibold">{l.nome ?? `Lead ${l.lead_id}`}</span>}
                        </td>
                        <td className="py-2 px-2 whitespace-nowrap">{nomeDoFunil(l.segmento, l.funil)}</td>
                        <td className="py-2 px-2 whitespace-nowrap"><span className="badge-info">{oQueALyraFez(l)}</span></td>
                        <td className="py-2 pl-2 whitespace-nowrap text-muted-foreground">{l.etapa ?? '—'}</td>
                      </tr>
                    ))}
                    {!leadsDaLyra.length && <tr><td colSpan={4} className="py-4 text-muted-foreground">Nenhum lead nesta linha.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">Clique numa linha para ver os leads dela. Quem já é cliente num funil não passa pela Lyra: vai direto para a atendente.</p>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4 sm:p-6 min-w-0">
              <h2 className="text-base font-bold mb-3 flex flex-wrap items-center gap-2">
                <Nome id="crm.segmento">Por segmento</Nome>
                {uf && (
                  <button type="button" onClick={() => setUf(null)} className="badge-info inline-flex items-center gap-1">
                    {nomeDoEstado(uf === SEM_ESTADO ? null : uf)} <X className="h-3 w-3" aria-label="tirar o filtro" />
                  </button>
                )}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr className="border-b">
                      <th className="py-2 pr-3 font-semibold">Segmento</th>
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
              <p className="mt-3 text-xs text-muted-foreground">Clique num segmento para ver os leads dele.</p>
            </Card>

            <Card className="p-4 sm:p-6 min-w-0">
              <h2 className="text-base font-bold mb-3"><Nome id="crm.estado">Por estado</Nome></h2>
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
              <p className="mt-3 text-xs text-muted-foreground">Clique num estado para ver os segmentos e os leads só dele.</p>
            </Card>
          </div>

          {/* De onde veio cada lead (dono, 2026-11-10, https://claude.ai/artifact/LsvUjrtiW1gJUV1DUbgMuS). */}
          <Card className="p-4 sm:p-6 min-w-0">
            <h2 className="text-base font-bold mb-3"><Nome id="crm.origem">Por origem</Nome></h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-semibold">Origem</th>
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
                      <td className="py-2 pr-3">
                        {l.link ? (
                          <a href={l.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                            {l.nome ?? `Lead ${l.lead_id}`} <ExternalLink className="h-3 w-3" aria-label="abrir no Kommo" />
                          </a>
                        ) : <span className="font-semibold">{l.nome ?? `Lead ${l.lead_id}`}</span>}
                      </td>
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

          <Card className="p-4 sm:p-6">
            <h2 className="text-base font-bold mb-3">Por atendente</h2>
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
                    <th className="py-2 pl-2 font-semibold text-right">Perdas</th>
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
                      <td className="py-2 pl-2 text-right tabular-nums">{a.perdidas}</td>
                    </tr>
                  ))}
                  {data.todos && (
                    <tr className="text-[hsl(var(--monday-purple))]">
                      <td className="py-2 pr-3 font-semibold"><Nome id="crm.lyra">Lyra</Nome></td>
                      <td className="py-2 px-2 text-right tabular-nums">{data.lyra?.atendidos || '—'}</td>
                      <td className="py-2 px-2 text-right">{data.robo?.mensagens ? 'na hora' : '—'}</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 pl-2 text-right">—</td>
                    </tr>
                  )}
                  {!data.atendentes.length && !data.todos && (
                    <tr><td colSpan={10} className="py-4 text-muted-foreground">Seu usuário do Kommo ainda não está ligado ao seu login. Peça ao administrador.</td></tr>
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
                      {l.link ? (
                        <a href={l.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                          {l.nome ?? `Lead ${l.lead_id}`} <ExternalLink className="h-3 w-3" aria-label="abrir no Kommo" />
                        </a>
                      ) : <span className="font-semibold">{l.nome ?? `Lead ${l.lead_id}`}</span>}
                      <span className="text-xs text-muted-foreground">
                        {nomeDoFunil(l.segmento, l.funil)} · <b className="tabular-nums text-foreground">{l.valor ? formatBRL(l.valor) : 'sem valor'}</b>
                      </span>
                    </li>
                  ))}
                  {!vendasDela.length && <li className="py-2 text-muted-foreground">Nenhuma venda no período.</li>}
                </ul>
              </div>
            )}
            {data.todos && (
              <p className="mt-3 text-xs text-muted-foreground">
                {data.robo?.mensagens
                  ? `A Lyra mandou ${data.robo.mensagens} mensagens para ${data.robo.leads} leads no período.`
                  : `A Lyra entrou no ar em ${LYRA_NO_AR}: antes disso não havia robô, e toda resposta é da atendente.`}
              </p>
            )}
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card id="aguardando" className="p-4 sm:p-6 min-w-0 scroll-mt-4">
              <h2 className="text-base font-bold mb-1">
                <Nome id="crm.aguardando">Aguardando resposta</Nome> <span className="text-status-danger tabular-nums">· {data.para_responder.length}</span>
              </h2>
              <p className="text-xs text-muted-foreground mb-3">Os mais antigos primeiro; cada nome abre o lead no Kommo.</p>
              {data.para_responder.length ? (
                <ul className="divide-y text-sm max-h-96 overflow-y-auto">
                  {data.para_responder.map((l) => (
                    <li key={l.lead_id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
                      <a href={l.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        {l.nome} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {nomeDoFunil(l.segmento, l.funil)}{l.uf ? ` · ${l.uf}` : ''} · desde {dataHora(l.desde)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Ninguém esperando resposta.</p>
              )}
            </Card>

            <Card id="cadastro" className="p-4 sm:p-6 min-w-0 scroll-mt-4">
              <h2 className="text-base font-bold mb-1"><Nome id="crm.cadastro">Cadastro incompleto</Nome></h2>
              <p className="text-xs text-muted-foreground mb-3">Complete no Kommo: os indicadores saem dele.</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {contagem.filter((c) => c.quantos).map((c) => (
                  <span key={c.campo} className="badge-danger">{CAMPO_OBRIGATORIO[c.campo]}: {c.quantos}</span>
                ))}
              </div>
              {data.campos_faltando.length ? (
                <ul className="divide-y text-sm max-h-96 overflow-y-auto">
                  {data.campos_faltando.map((v) => (
                    <li key={v.lead_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        <a href={v.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                          {v.nome} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </a>
                        <span className="text-xs text-muted-foreground"> · {nomeDoFunil(v.funil, null)} · {v.situacao === 'ganha' ? 'venda' : 'perda'} em {diaCurto(v.fechou)}</span>
                      </span>
                      <span className="flex flex-wrap gap-1">
                        {v.faltam.map((c) => <span key={c} className={c === 'valor_kommo' ? 'badge-warning' : 'badge-danger'}>{FALTA[c]}</span>)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Todas as vendas do período estão completas.</p>
              )}
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            {data.todos ? 'Cada atendente vê só a linha dela; dono, admin e gestor comercial veem todas. ' : 'Você vê só os seus leads e a sua linha. '}
            Equipe, fornecedores e artistas (etiquetas no Kommo) não entram. As conversas são lidas a cada 10 minutos; as vendas e os cadastros, de hora em hora. Conversa encerrada no Kommo e lead apagado não ficam esperando resposta.
          </p>
        </>
      )}
    </div>
  );
}
