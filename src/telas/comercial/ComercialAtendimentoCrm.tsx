// Comercial › Atendimento do CRM (projeto do Kommo, parte 4b; tela nova aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/9b6cYeC6VFZFvtwXttya6H). Três perguntas, nesta ordem: o que precisa de ação agora, como foi o
// atendimento (do cliente que escreveu à resposta no prazo) e onde (segmento × estado). Nomes de uma ou duas palavras; a
// explicação de cada um aparece ao passar o mouse (`crm.*` em explicacoes-dos-indicadores.ts).
// Cor com significado: vermelho é o que espera alguém, verde o que está na meta, lilás a Lyra. O dono, o admin e o gestor
// comercial veem todas; a atendente, só o dela (o banco recorta).
import { useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import type { IdDaExplicacao } from '@/config/explicacoes-dos-indicadores';
import { useCrmAtendimento } from '@/hooks/useCrmAtendimento';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PERIODOS_DA_REUNIAO, intervaloDoPeriodoRapido, rotuloDoIntervalo } from '@/lib/period';
import { dataHora, diaCurto } from '@/lib/dates';
import {
  CAMPO_OBRIGATORIO, FALTA, LYRA_NO_AR, SEM_ESTADO, contagemDosCampos, dentroDaMeta, minutos, nomeDoEstado, nomeDoFunil,
  porEstado, porSegmento,
} from '@/lib/crm-atendimento';
import { formatBRL } from '@/lib/crm';
import { cn } from '@/lib/utils';

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : '—');

/** O título de um bloco ou coluna com a explicação ao passar o mouse. */
function Nome({ id, children }: { id: IdDaExplicacao; children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1">{children}<ExplicacaoDoIndicador id={id} /></span>;
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
                    <div className={cn('h-5 rounded', cor)} style={{ width: `${data.conversas ? Math.max(2, (n / data.conversas) * 100) : 0}%` }} />
                  </dd>
                  <dd className="text-right font-bold tabular-nums">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
              <span><Nome id="crm.tempo">Tempo</Nome>: <Tempo n={data.primeira_resposta} meta={data.meta} /> <span className="text-muted-foreground">(meta {data.meta} min · {pct(data.no_prazo, data.respondidas)} no prazo)</span></span>
              <span>Vendas: <b className="tabular-nums">{data.ganhas}</b> · <b className="tabular-nums">{formatBRL(data.valor_ganho)}</b></span>
              <span>Perdas: <b className="tabular-nums">{data.perdidas}</b></span>
            </p>
          </Card>

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
                      <th className="py-2 pl-2 font-semibold text-right">Vendas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {segmentos.map((s) => (
                      <tr key={s.chave} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-semibold">{s.nome}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{s.conversas}</td>
                        <td className={cn('py-2 px-2 text-right tabular-nums', s.sem_resposta && 'font-bold text-status-danger')}>{s.sem_resposta}</td>
                        <td className="py-2 px-2 text-right"><Tempo n={s.tempo} meta={data.meta} /></td>
                        <td className="py-2 pl-2 text-right tabular-nums">{s.vendas || '—'}</td>
                      </tr>
                    ))}
                    {!segmentos.length && <tr><td colSpan={5} className="py-4 text-muted-foreground">Nenhuma conversa no período.</td></tr>}
                  </tbody>
                </table>
              </div>
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
              <p className="mt-3 text-xs text-muted-foreground">Clique num estado para ver os segmentos só dele.</p>
            </Card>
          </div>

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
                    <th className="py-2 pl-2 font-semibold text-right">Perdas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.atendentes.map((a) => (
                    <tr key={a.kommo_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">{a.nome}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{a.respondidos}</td>
                      <td className="py-2 px-2 text-right"><Tempo n={a.primeira_resposta} meta={data.meta} /></td>
                      <td className="py-2 px-2 text-right tabular-nums">{pct(a.no_prazo, a.respondidos)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{a.ativos}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{a.tarefas}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{a.ganhas}</td>
                      <td className="py-2 pl-2 text-right tabular-nums">{a.perdidas}</td>
                    </tr>
                  ))}
                  {data.todos && (
                    <tr className="text-[hsl(var(--monday-purple))]">
                      <td className="py-2 pr-3 font-semibold"><Nome id="crm.lyra">Lyra</Nome></td>
                      <td className="py-2 px-2 text-right tabular-nums">{data.robo ? data.so_lyra : '—'}</td>
                      <td className="py-2 px-2 text-right">{data.robo ? 'na hora' : '—'}</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 px-2 text-right">—</td>
                      <td className="py-2 pl-2 text-right">—</td>
                    </tr>
                  )}
                  {!data.atendentes.length && !data.todos && (
                    <tr><td colSpan={8} className="py-4 text-muted-foreground">Seu usuário do Kommo ainda não está ligado ao seu login. Peça ao administrador.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {data.todos && (
              <p className="mt-3 text-xs text-muted-foreground">
                {data.robo
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
            Equipe, fornecedores e artistas (etiquetas no Kommo) não entram. As conversas são lidas a cada 10 minutos.
          </p>
        </>
      )}
    </div>
  );
}
