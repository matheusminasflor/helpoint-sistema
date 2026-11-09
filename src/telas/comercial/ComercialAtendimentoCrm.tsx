// Comercial › Atendimento do CRM (projeto do Kommo, parte 4b, aprovada pelo dono em 2026-11-09,
// https://claude.ai/artifact/XGuhzJXvTEze4kajUNcdvz): por atendente, quem escreveu pelo WhatsApp e pelo Instagram, quem
// foi respondido por uma pessoa e em quanto tempo de expediente, o que virou venda e o que a Lyra fez sozinha. Embaixo,
// as vendas com campo obrigatório vazio no Kommo, para a atendente completar (dono, mesmo dia).
// Cor com significado: vermelho é o que espera alguém (sem resposta, acima da meta, campo vazio), verde o que está em
// dia, lilás a Lyra. O dono, o admin e o gestor comercial veem todas; a atendente, só o dela (o banco recorta).
import { AlertTriangle, Bot, CheckCircle2, Clock, ExternalLink, MessageSquare, ThumbsDown, ThumbsUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { useCrmAtendimento } from '@/hooks/useCrmAtendimento';
import { usePeriodoNaUrl } from '@/hooks/usePeriodoNaUrl';
import { PERIODOS_DA_REUNIAO, intervaloDoPeriodoRapido, rotuloDoIntervalo } from '@/lib/period';
import { dataHora, diaCurto } from '@/lib/dates';
import {
  CAMPO_OBRIGATORIO, META_DA_PRIMEIRA_RESPOSTA, contagemDosCampos, dentroDaMeta, minutos, nomeDoFunil,
} from '@/lib/crm-atendimento';
import { cn } from '@/lib/utils';

const pct = (parte: number, todo: number) => (todo ? `${Math.round((parte / todo) * 100)}%` : '—');

export default function ComercialAtendimentoCrm() {
  const { periodo, intervalo, escolher, definirIntervalo } = usePeriodoNaUrl<string>('esta_semana');
  const recorte = intervalo ?? intervaloDoPeriodoRapido('esta_semana');
  const { data, isLoading, error } = useCrmAtendimento(recorte.de, recorte.ate);
  const contagem = data ? contagemDosCampos(data.campos_faltando) : [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        title="Atendimento do CRM"
        subtitle={`Quem escreveu pelo WhatsApp e pelo Instagram, quem respondeu e em quanto tempo · ${rotuloDoIntervalo(recorte)}`}
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
          <KPIGrid lgCols={5}>
            <KPICard label="Conversas recebidas" value={data.conversas} color="blue" icon={MessageSquare} nota="leads que escreveram no período" />
            <KPICard label="Sem resposta de pessoa" value={data.sem_resposta} color={data.sem_resposta ? 'red' : 'green'} icon={AlertTriangle}
              nota={`${pct(data.sem_resposta, data.conversas)} só falaram com a Lyra ou com ninguém`} notaRuim={data.sem_resposta > 0} />
            <KPICard label="1ª resposta (expediente)" value={minutos(data.primeira_resposta)} icon={Clock}
              color={data.primeira_resposta === null ? 'grey' : dentroDaMeta(data.primeira_resposta) ? 'green' : 'red'}
              nota={`meta: até ${META_DA_PRIMEIRA_RESPOSTA} min · ${data.no_prazo} de ${data.respondidas} no prazo`}
              notaRuim={data.primeira_resposta !== null && !dentroDaMeta(data.primeira_resposta)} />
            <KPICard label="Vendas ganhas" value={data.ganhas} color="green" icon={ThumbsUp} />
            <KPICard label="Vendas perdidas" value={data.perdidas} color="orange" icon={ThumbsDown} nota="a limpeza de cadastro não entra" />
          </KPIGrid>

          {data.lyra && (
            <p className="flex items-center gap-2 rounded-lg border border-[hsl(var(--monday-purple))]/40 bg-[hsl(var(--monday-purple))]/10 px-4 py-3 text-sm">
              <Bot className="h-4 w-4 text-[hsl(var(--monday-purple))]" aria-hidden="true" />
              A Lyra atendeu <strong>{data.lyra.leads} leads</strong>, com <strong>{data.lyra.mensagens} mensagens</strong>.
            </p>
          )}

          <Card className="p-4 sm:p-6">
            <h2 className="text-base font-bold mb-3">Por atendente</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <th className="py-2 pr-3 font-semibold">Atendente</th>
                    <th className="py-2 px-3 font-semibold text-right">Leads atendidos</th>
                    <th className="py-2 px-3 font-semibold text-right">Mensagens</th>
                    <th className="py-2 px-3 font-semibold text-right">1ª resposta</th>
                    <th className="py-2 px-3 font-semibold text-right">Tarefas feitas</th>
                    <th className="py-2 px-3 font-semibold text-right">Ganhas</th>
                    <th className="py-2 pl-3 font-semibold text-right">Perdidas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.atendentes.map((a) => (
                    <tr key={a.kommo_id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">{a.nome}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{a.leads}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{a.mensagens}</td>
                      <td className={cn('py-2 px-3 text-right tabular-nums font-semibold',
                        a.primeira_resposta !== null && (dentroDaMeta(a.primeira_resposta) ? 'text-status-success' : 'text-status-danger'))}>
                        {minutos(a.primeira_resposta)}
                      </td>
                      <td className="py-2 px-3 text-right tabular-nums">{a.tarefas}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{a.ganhas}</td>
                      <td className="py-2 pl-3 text-right tabular-nums">{a.perdidas}</td>
                    </tr>
                  ))}
                  {data.lyra && (
                    <tr className="text-[hsl(var(--monday-purple))]">
                      <td className="py-2 pr-3 font-semibold">Lyra (robô)</td>
                      <td className="py-2 px-3 text-right tabular-nums">{data.lyra.leads}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{data.lyra.mensagens}</td>
                      <td className="py-2 px-3 text-right">na hora</td>
                      <td className="py-2 px-3 text-right">—</td>
                      <td className="py-2 px-3 text-right">—</td>
                      <td className="py-2 pl-3 text-right">—</td>
                    </tr>
                  )}
                  {!data.atendentes.length && !data.lyra && (
                    <tr><td colSpan={7} className="py-4 text-muted-foreground">Seu usuário do Kommo ainda não está ligado ao seu login. Peça ao administrador.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {data.todos ? 'Cada atendente vê só a linha dela; dono, admin e gestor comercial veem todas.' : 'Você vê só os seus leads e a sua linha.'}
            </p>
          </Card>

          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <Card className="p-4 sm:p-6">
              <h2 className="text-base font-bold mb-3">Sem resposta de pessoa, por funil</h2>
              {data.sem_resposta_por_funil.length ? (
                <ul className="space-y-2 text-sm">
                  {data.sem_resposta_por_funil.map((f) => (
                    <li key={`${f.segmento}|${f.funil}`} className="flex items-center justify-between gap-3">
                      <span>{nomeDoFunil(f.segmento, f.funil)}</span>
                      <span className="font-bold tabular-nums text-status-danger">{f.quantos}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Todo lead teve resposta.</p>
              )}
            </Card>

            <Card className="p-4 sm:p-6">
              <h2 className="text-base font-bold mb-1">Para responder agora <span className="text-status-danger tabular-nums">· {data.para_responder.length} leads</span></h2>
              <p className="text-xs text-muted-foreground mb-3">A última mensagem é do cliente. Os mais antigos primeiro; cada nome abre o lead no Kommo.</p>
              {data.para_responder.length ? (
                <ul className="divide-y text-sm max-h-96 overflow-y-auto">
                  {data.para_responder.map((l) => (
                    <li key={l.lead_id} className="py-2 flex flex-wrap items-baseline justify-between gap-x-3">
                      <a href={l.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        {l.nome} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {nomeDoFunil(l.segmento, l.funil)}{l.etapa ? ` · ${l.etapa}` : ''} · escreveu {dataHora(l.desde)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Ninguém esperando resposta.</p>
              )}
            </Card>
          </div>

          <Card className="p-4 sm:p-6">
            <h2 className="text-base font-bold mb-1">Vendas com campo obrigatório vazio</h2>
            <p className="text-xs text-muted-foreground mb-3">As vendas ganhas e perdidas do período. Complete no Kommo: o número dos indicadores sai deles.</p>
            <div className="flex flex-wrap gap-2 mb-3">
              {contagem.map((c) => (
                <span key={c.campo} className={c.quantos ? 'badge-danger' : 'badge-success'}>
                  {CAMPO_OBRIGATORIO[c.campo]}: {c.quantos}
                </span>
              ))}
            </div>
            {data.campos_faltando.length ? (
              <ul className="divide-y text-sm">
                {data.campos_faltando.map((v) => (
                  <li key={v.lead_id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      <a href={v.link} target="_blank" rel="noreferrer" className="font-semibold text-primary hover:underline inline-flex items-center gap-1">
                        {v.nome} <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                      <span className="text-xs text-muted-foreground"> · {nomeDoFunil(v.funil, null)} · {v.situacao === 'ganha' ? 'ganha' : 'perdida'} em {diaCurto(v.fechou)}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {v.faltam.map((c) => <span key={c} className="badge-danger">falta {CAMPO_OBRIGATORIO[c].toLowerCase()}</span>)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm text-status-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Todas as vendas do período estão completas.</p>
            )}
          </Card>

          <p className="text-xs text-muted-foreground">
            O Kommo só sabe da resposta dada pelo próprio Kommo. Quem respondeu um cliente pelo WhatsApp do celular, fora do Kommo, aparece aqui como sem resposta.
            As conversas são lidas a cada 10 minutos.
          </p>
        </>
      )}
    </div>
  );
}
