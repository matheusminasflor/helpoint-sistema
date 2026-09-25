// Os objetivos da empresa e os chamados por setor.
//
// ── Etapa 4 (2026-09-25) ────────────────────────────────────────────────
// Isto ERA a aba "Setores". O dono, 2026-09-24: "Aba Setores fica muito
// simplório a informações e confuso, o que o diretor faz ali? nome não condiz
// também."
//
// Ele estava certo nas três coisas, e a auditoria explicou por quê: esta é a
// ÚNICA das sete telas da Diretoria que não compartilha fonte de dado com
// nenhuma outra — as outras seis leem `com_metas`/`metas_ano`/`metas_carteira`
// e vendas; esta lê `goals` e `tickets`. Ela parecia deslocada porque era.
//
// O nome saiu; o conteúdo não. Virou dois blocos do RESUMO, que é onde o
// diretor já abre o painel. Nada foi apagado: a versão FAROL (uma linha por
// item, só o que pede ação hoje) vai na visão simplificada, e a tabela
// completa — resolvidos, % no prazo, tempo médio — continua inteira na visão
// analítica, com o seletor de período que só ela precisa.
import { useNavigate } from 'react-router-dom';
import { Target, AlertTriangle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useMetas, farolDe, formatarValor, type Meta } from '@/hooks/useMetas';
import { useChamadosPorSetor, type PeriodoDiretoria } from '@/hooks/useDiretoria';

/** Só o que é da empresa: objetivo de setor e de pessoa têm a tela de Metas.
 *  Cancelado fica de fora — objetivo que a empresa desistiu de perseguir
 *  continuar no painel do diretor é o tipo de número que engana sem errar. */
function objetivosDaEmpresa(metas: Meta[]): Meta[] {
  return metas.filter((m) => m.scope === 'company' && m.status !== 'cancelled');
}

/**
 * FAROL dos objetivos — uma linha por objetivo, para a visão simplificada.
 * Progresso nulo continua sendo "sem medição", nunca 0%: a diferença é entre
 * "ninguém lançou o número" e "não andou nada".
 */
export function FarolObjetivos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: metas = [], isLoading } = useMetas();
  const daEmpresa = objetivosDaEmpresa(metas);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[13px] font-semibold text-foreground">Objetivos da empresa</h2>
        <Button variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => navigate(tenantPath('/metas'))}>
          Abrir Metas <ArrowRight className="w-3 h-3 ml-1" aria-hidden="true" />
        </Button>
      </div>
      {isLoading ? <Skeleton className="h-20 w-full" /> : daEmpresa.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nenhum objetivo da empresa cadastrado. Crie em Metas um objetivo com alcance "empresa" e ele aparece aqui.
        </p>
      ) : (
        <ul className="space-y-2">
          {daEmpresa.map((meta) => {
            const farol = farolDe(meta.progress);
            const cor = farol === 'verde' ? 'bg-status-success'
              : farol === 'amarelo' ? 'bg-status-warning'
                : farol === 'vermelho' ? 'bg-status-danger' : 'bg-muted';
            return (
              <li key={meta.id} className="flex items-center gap-2 text-[12px]">
                <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} aria-hidden="true" />
                <span className="truncate flex-1" title={meta.title}>{meta.title}</span>
                <span className="shrink-0 font-mono text-muted-foreground">
                  {meta.progress === null ? 'sem medição' : `${Math.round(meta.progress * 100)}%`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * FAROL dos chamados — quem está atrasado, e só isso.
 *
 * Não tem seletor de período de propósito: `abertos` e `estourados` são de
 * AGORA, a fila como ela está, e não mudam com o período escolhido. Um
 * seletor que não muda o número que está na tela é pior do que nenhum.
 * Resolvidos, % no prazo e tempo médio — esses sim dependem do período —
 * ficam na tabela completa da visão analítica.
 */
export function FarolChamadosPorSetor() {
  const { data: setores = [], isLoading } = useChamadosPorSetor('30d');
  const comFila = setores.filter((s) => s.abertos > 0);
  const totalEstourados = setores.reduce((soma, s) => soma + s.estourados, 0);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <h2 className="text-[13px] font-semibold text-foreground">Chamados por setor</h2>
      {totalEstourados > 0 && (
        <p className="flex items-start gap-2 text-[12px] text-status-danger">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            <strong>{totalEstourados}</strong>{' '}
            {totalEstourados === 1 ? 'chamado aberto já passou do prazo' : 'chamados abertos já passaram do prazo'}.
          </span>
        </p>
      )}
      {isLoading ? <Skeleton className="h-20 w-full" /> : comFila.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nenhum chamado em aberto. Sem uso não há indicador — e nenhum ajuste de tela produz esse dado.
        </p>
      ) : (
        <ul className="space-y-2">
          {comFila.map((s) => (
            <li key={s.modulo} className="flex items-center gap-2 text-[12px]">
              <span
                className={`w-2 h-2 rounded-full shrink-0 ${s.estourados > 0 ? 'bg-status-danger' : 'bg-status-success'}`}
                aria-hidden="true"
              />
              <span className="truncate flex-1">{s.rotulo}</span>
              <span className="shrink-0 font-mono text-muted-foreground">
                {s.estourados > 0 ? `${s.estourados} atrasados de ${s.abertos}` : `${s.abertos} abertos, nenhum atrasado`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * A tabela completa — visão analítica do Resumo. É o que a aba "Setores"
 * mostrava, inteira, com o seletor de período que os três números do período
 * (resolvidos, no prazo, tempo médio) realmente usam.
 */
export function TabelaChamadosPorSetor({
  periodo, onPeriodoChange,
}: { periodo: PeriodoDiretoria; onPeriodoChange: (p: PeriodoDiretoria) => void }) {
  const { data: setores = [], isLoading } = useChamadosPorSetor(periodo);
  const comChamado = setores.filter((s) => s.abertos > 0 || s.resolvidos > 0);

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Chamados por setor</h2>
          <p className="text-[12px] text-muted-foreground">
            <strong>Abertos</strong> e <strong>atrasados</strong> são de agora — a fila como ela está,
            inclusive o que foi aberto antes do período. <strong>Resolvidos</strong>, <strong>no prazo</strong> e
            <strong> tempo médio</strong> são do período escolhido.
          </p>
        </div>
        <Select value={periodo} onValueChange={(v) => onPeriodoChange(v as PeriodoDiretoria)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Últimos 7 dias</SelectItem>
            <SelectItem value="30d">Últimos 30 dias</SelectItem>
            <SelectItem value="90d">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : comChamado.length === 0 ? (
        <p className="text-[13px] text-muted-foreground rounded-md border border-dashed border-border p-4">
          Nenhum chamado em aberto e nada resolvido no período. Sem uso não há indicador — e nenhum
          ajuste de tela produz esse dado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-[13px]">
            <thead className="bg-muted/40">
              <tr className="text-left">
                <th className="py-2 px-3 font-medium">Setor</th>
                <th className="py-2 px-3 font-medium text-right" title="Em aberto agora, independente do período">Abertos</th>
                <th className="py-2 px-3 font-medium text-right">Resolvidos</th>
                <th className="py-2 px-3 font-medium text-right">No prazo</th>
                <th className="py-2 px-3 font-medium text-right">Tempo médio</th>
                <th className="py-2 px-3 font-medium text-right" title="Em aberto agora e com o prazo vencido">Atrasados</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {comChamado.map((s) => (
                <tr key={s.modulo}>
                  <td className="py-2 px-3 text-foreground">{s.rotulo}</td>
                  <td className="py-2 px-3 text-right">{s.abertos}</td>
                  <td className="py-2 px-3 text-right">{s.resolvidos}</td>
                  <td className="py-2 px-3 text-right">
                    {s.sla === null
                      ? <span className="text-muted-foreground" title="Nenhum chamado resolvido tinha prazo definido">—</span>
                      : <Badge
                          variant={s.sla >= 90 ? 'default' : s.sla >= 70 ? 'secondary' : 'destructive'}
                          className="text-[10px]"
                        >{s.sla}%</Badge>}
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground">
                    {s.horasMedias === null ? '—' : `${s.horasMedias} h`}
                  </td>
                  <td className="py-2 px-3 text-right">
                    {s.estourados > 0
                      ? <span className="text-status-danger font-medium">{s.estourados}</span>
                      : <span className="text-muted-foreground">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Os objetivos em cartão grande — visão analítica do Resumo. */
export function CartoesObjetivos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: metas = [], isLoading } = useMetas();
  const daEmpresa = objetivosDaEmpresa(metas);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-[13px] font-semibold text-foreground">Objetivos da empresa</h2>
          <p className="text-[12px] text-muted-foreground">
            O que vale para a casa inteira. Objetivo de setor e de pessoa ficam em Metas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate(tenantPath('/metas'))}>
          Abrir Metas
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
        </Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-28 w-full" />
      ) : daEmpresa.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhum objetivo da empresa"
          description="Crie em Metas um objetivo com alcance 'empresa' e ele aparece aqui, com o andamento do que está embaixo dele."
          actionLabel="Abrir Metas"
          onAction={() => navigate(tenantPath('/metas'))}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {daEmpresa.map((meta) => <CartaoObjetivo key={meta.id} meta={meta} />)}
        </div>
      )}
    </section>
  );
}

function CartaoObjetivo({ meta }: { meta: Meta }) {
  const farol = farolDe(meta.progress);
  const cor = farol === 'verde' ? 'bg-status-success'
    : farol === 'amarelo' ? 'bg-status-warning'
      : farol === 'vermelho' ? 'bg-status-danger' : 'bg-muted';

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-foreground">{meta.title}</h3>
          {meta.responsavel && (
            <p className="text-[11px] text-muted-foreground mt-0.5">Responde: {meta.responsavel}</p>
          )}
        </div>
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${cor}`} aria-hidden="true" />
      </div>

      {meta.progress === null ? (
        <p className="text-[12px] text-muted-foreground">
          Ainda sem medição. Não é zero — é que ninguém lançou o número ainda.
        </p>
      ) : (
        <>
          <Progress value={Math.min(100, meta.progress * 100)} className="h-2" />
          <p className="text-[12px] text-muted-foreground">
            {Math.round(meta.progress * 100)}% do caminho
            {meta.target_value != null && ` · meta ${formatarValor(meta.target_value, meta.unit ?? 'number')}`}
          </p>
        </>
      )}

      {meta.filhos.length > 0 && (
        <ul className="space-y-1 border-t border-border pt-2">
          {meta.filhos.map(filho => (
            <li key={filho.id} className="flex items-center justify-between gap-2 text-[12px]">
              <span className="text-muted-foreground truncate">{filho.title}</span>
              <span className="text-foreground shrink-0">
                {filho.progress === null ? '—' : `${Math.round(filho.progress * 100)}%`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
