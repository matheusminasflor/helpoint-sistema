// Rotinas › "Da minha equipe" (dono, 2026-10-30; etapa 2 de docs/proposta-rotinas.md): cada pessoa numa linha, cada
// período com bolinhas, e o cumprimento do mês. Embaixo, no computador, o relatório: cumprimento por pessoa, as rotinas
// que mais ficam para trás (e por quê) e a que horas cada uma sai. Tudo de `rotinas_da_equipe`, que o banco calcula.
import { Fragment, useState } from 'react';
import { format, startOfMonth, subMonths, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronDown, Paperclip } from 'lucide-react';
import { AbasSegmentadas } from '@/components/ui/abas-segmentadas';
import { useRotinasDaEquipe } from '@/hooks/useRotinas';
import { abrirAnexoDoBalde } from '@/lib/anexos-no-storage';
import { toLocalISODate, todayISO } from '@/lib/dates';
import {
  PERIODOS, ROTULO_DO_PERIODO, corDoCumprimento, cumprimento, horarioMedio, maisPuladas, resumoPorPessoa,
  type LinhaDaEquipe, type SituacaoNoDia,
} from '@/lib/rotinas';
import { cn } from '@/lib/utils';

const BOLINHA: Record<SituacaoNoDia, string> = {
  feita: 'bg-[hsl(var(--status-success))]',
  pulada: 'bg-[hsl(var(--status-warning))]',
  nao_feita: 'bg-[hsl(var(--status-danger))]',
  pendente: 'bg-muted-foreground/25',
  pausada: 'bg-transparent border-2 border-muted-foreground/40',
};
const ROTULO_DA_SITUACAO: Record<SituacaoNoDia, string> = {
  feita: 'feita', pulada: 'pulada', nao_feita: 'não feita', pendente: 'ainda no prazo', pausada: 'pausada (férias)',
};
const COR_DO_NUMERO: Record<string, string> = {
  verde: 'text-[hsl(var(--status-success))]', laranja: 'text-[hsl(var(--priority-high))]',
  vermelho: 'text-[hsl(var(--status-danger))]', muted: 'text-muted-foreground',
};

const Percentual = ({ valor }: { valor: number | null }) => (
  <span className={cn('font-extrabold tabular-nums', COR_DO_NUMERO[corDoCumprimento(valor)])}>{valor === null ? '—' : `${valor}%`}</span>
);

export function EquipeDasRotinas() {
  const hoje = todayISO();
  const inicioDoMes = toLocalISODate(startOfMonth(new Date()));
  const { data: doMes = [], isLoading, error } = useRotinasDaEquipe(inicioDoMes, hoje);
  const [aberta, setAberta] = useState<string | null>(null);

  const deHoje = doMes.filter((l) => l.dia === hoje);
  const pessoas = resumoPorPessoa(doMes).sort((a, b) => a.nome.localeCompare(b.nome));
  const hojeDe = (id: string) => deHoje.filter((l) => l.pessoa_id === id);

  if (error) return <p className="text-sm text-destructive">Não foi possível carregar as rotinas da equipe.</p>;
  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-5">
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-2 px-4 pb-3 pt-5 sm:px-6">
          <h2 className="text-[20px] font-bold">Hoje</h2>
          <span className="text-[14px] text-muted-foreground">{format(new Date(), "EEEE, d 'de' MMMM", { locale: ptBR })} · cumprimento de hoje: </span>
          <Percentual valor={cumprimento(deHoje)} />
        </div>
        {pessoas.length === 0 ? (
          <p className="px-4 pb-5 text-[15px] text-muted-foreground sm:px-6">Ninguém da equipe tem rotina cadastrada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[14px]">
              <thead>
                <tr className="bg-muted/60 text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 sm:px-6">Pessoa</th>
                  {PERIODOS.map((p) => <th key={p} className="px-3 py-2.5">{ROTULO_DO_PERIODO[p]}</th>)}
                  <th className="px-4 py-2.5 text-right sm:px-6">No mês</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pessoas.map((p) => {
                  const linhas = hojeDe(p.pessoa_id);
                  const expandida = aberta === p.pessoa_id;
                  return (
                    <Fragment key={p.pessoa_id}>
                      <tr className="cursor-pointer hover:bg-muted/40" onClick={() => setAberta(expandida ? null : p.pessoa_id)}>
                        <td className="px-4 py-3 font-semibold sm:px-6">
                          <span className="inline-flex items-center gap-1.5">
                            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expandida && 'rotate-180')} aria-hidden="true" />
                            {p.nome}
                          </span>
                        </td>
                        {PERIODOS.map((per) => (
                          <td key={per} className="px-3 py-3">
                            <span className="flex flex-wrap gap-1">
                              {linhas.filter((l) => l.periodo === per).map((l) => (
                                <span key={l.rotina_id} className={cn('inline-block h-3.5 w-3.5 rounded-full', BOLINHA[l.situacao])}
                                  title={`${l.titulo}: ${ROTULO_DA_SITUACAO[l.situacao]}${l.motivo ? ` — ${l.motivo}` : ''}`} />
                              ))}
                              {linhas.every((l) => l.periodo !== per) && <span className="text-muted-foreground">—</span>}
                            </span>
                          </td>
                        ))}
                        <td className="px-4 py-3 text-right sm:px-6"><Percentual valor={p.cumprimento} /></td>
                      </tr>
                      {expandida && (
                        <tr className="bg-muted/20">
                          <td colSpan={5} className="px-4 py-3 sm:px-6">
                            {linhas.length === 0 ? <p className="text-muted-foreground">Sem rotina hoje.</p> : (
                              <ul className="space-y-1.5">
                                {linhas.map((l) => <DetalheDaRotina key={l.rotina_id} l={l} />)}
                              </ul>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 pb-4 pt-3 text-[13px] text-muted-foreground sm:px-6">
          {(Object.keys(BOLINHA) as SituacaoNoDia[]).map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><span className={cn('inline-block h-3 w-3 rounded-full', BOLINHA[s])} />{ROTULO_DA_SITUACAO[s]}</span>
          ))}
          <span>· Clique na pessoa para ver o motivo, a observação e a foto.</span>
        </div>
      </section>

      {/* O relatório é do computador (decisão do dono, 2026-10-28: no celular, só o resumo). */}
      <p className="text-[14px] text-muted-foreground lg:hidden">O relatório completo das rotinas está no computador.</p>
      <div className="hidden lg:block"><RelatorioDasRotinas /></div>
    </div>
  );
}

function DetalheDaRotina({ l }: { l: LinhaDaEquipe }) {
  return (
    <li className="flex flex-wrap items-center gap-2 text-[14px]">
      <span className={cn('inline-block h-3 w-3 shrink-0 rounded-full', BOLINHA[l.situacao])} aria-hidden="true" />
      <span className="font-semibold">{l.titulo}</span>
      <span className="text-muted-foreground">
        {ROTULO_DA_SITUACAO[l.situacao]}
        {l.feita_em && ` às ${format(new Date(l.feita_em), 'HH:mm')}`}
        {l.feita_por_nome && l.feita_por_nome !== l.pessoa_nome && ` por ${l.feita_por_nome}`}
        {l.motivo && ` — ${l.motivo}`}
        {l.observacao && ` — ${l.observacao}`}
      </span>
      {l.anexo_path && (
        <button type="button" onClick={(e) => { e.stopPropagation(); abrirAnexoDoBalde('rotinas', l.anexo_path!); }}
          className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
          <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />Ver foto
        </button>
      )}
    </li>
  );
}

function RelatorioDasRotinas() {
  const [mes, setMes] = useState<'este' | 'passado'>('este');
  const base = mes === 'este' ? new Date() : subMonths(new Date(), 1);
  const de = toLocalISODate(startOfMonth(base));
  const ate = mes === 'este' ? todayISO() : toLocalISODate(endOfMonth(base));
  const { data: linhas = [], isLoading } = useRotinasDaEquipe(de, ate);
  const pessoas = resumoPorPessoa(linhas);
  const puladas = maisPuladas(linhas);
  const horarios = horarioMedio(linhas);

  return (
    <section className="panel space-y-6 px-6 py-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[20px] font-bold">Relatório</h2>
        <span className="text-[14px] text-muted-foreground">{format(base, "MMMM 'de' yyyy", { locale: ptBR })}</span>
        <div className="ml-auto">
          <AbasSegmentadas<'este' | 'passado'> rotulo="Mês do relatório" valor={mes} onValor={setMes}
            opcoes={[{ valor: 'este', rotulo: 'Este mês' }, { valor: 'passado', rotulo: 'Mês passado' }]} />
        </div>
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando…</p> : linhas.length === 0 ? (
        <p className="text-[15px] text-muted-foreground">Nenhuma rotina da equipe neste mês.</p>
      ) : (
        <>
          <div>
            <h3 className="mb-2 text-[16px] font-bold">Cumprimento por pessoa</h3>
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                  <th className="py-2">Pessoa</th><th className="py-2 text-right">Previstas</th><th className="py-2 text-right">Feitas</th>
                  <th className="py-2 text-right">Puladas</th><th className="py-2 text-right">Não feitas</th><th className="py-2 text-right">Cumprimento</th>
                </tr>
              </thead>
              <tbody className="divide-y tabular-nums">
                {pessoas.map((p) => (
                  <tr key={p.pessoa_id}>
                    <td className="py-2 font-semibold">{p.nome}</td><td className="py-2 text-right">{p.previstas}</td>
                    <td className="py-2 text-right">{p.feitas}</td><td className="py-2 text-right">{p.puladas}</td>
                    <td className="py-2 text-right">{p.naoFeitas}</td><td className="py-2 text-right"><Percentual valor={p.cumprimento} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[13px] text-muted-foreground">Verde a partir de 90%, laranja de 70% a 89%, vermelho abaixo. Férias não contam; a de hoje que ainda está no prazo também não.</p>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <div>
              <h3 className="mb-2 text-[16px] font-bold">As que mais ficam para trás</h3>
              {puladas.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma rotina pulada ou esquecida no mês.</p> : (
                <ul className="divide-y">
                  {puladas.map((x) => (
                    <li key={x.titulo} className="py-2">
                      <p className="text-[14px] font-semibold">{x.titulo} <span className="font-normal text-muted-foreground">· {x.falhas} de {x.vezes} {x.vezes === 1 ? 'vez' : 'vezes'}</span></p>
                      {x.motivos.length > 0 && <p className="text-[13px] text-muted-foreground">Motivos: {x.motivos.join('; ')}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-[16px] font-bold">A que horas cada uma sai</h3>
              {horarios.length === 0 ? <p className="text-[14px] text-muted-foreground">Nenhuma marcada como feita ainda.</p> : (
                <ul className="divide-y">
                  {horarios.map((h) => (
                    <li key={h.titulo} className="flex items-center gap-2 py-2 text-[14px]">
                      <span className="estado badge-info">{ROTULO_DO_PERIODO[h.periodo]}</span>
                      <span className="flex-1 font-semibold">{h.titulo}</span>
                      <span className="tabular-nums font-bold">{h.hora}</span>
                      <span className="text-muted-foreground">· {h.vezes}×</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[13px] text-muted-foreground">A "da manhã" que só sai à tarde talvez esteja no período errado.</p>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
