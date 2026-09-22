import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Target, AlertTriangle, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useMetas, farolDe, formatarValor, type Meta } from '@/hooks/useMetas';
import { useChamadosPorSetor, type PeriodoDiretoria } from '@/hooks/useDiretoria';
import DiretoriaMetas from './DiretoriaMetas';
import DiretoriaMetaXRealizado from './DiretoriaMetaXRealizado';
import DiretoriaComparativo from './DiretoriaComparativo';
import DiretoriaConciliacao from './DiretoriaConciliacao';

/**
 * Diretoria (L5) — a visão do diretor.
 *
 * Decisão D6: é **visão**, não módulo com fila própria. Não há tabela nova
 * para os objetivos e chamados por setor; a tela lê o que os outros módulos
 * já guardam. Metas e carteiras são a exceção que confirma a regra:
 * `metas_carteira`/`metas_ano` (importadas do HISTORICO_METAS.json) e
 * `com_metas`/`com_carteira_membros` (definidas no sistema) SÃO tabelas do
 * Comercial, e a Diretoria só GANHA ABAS para lê-las e defini-las — nunca
 * uma rota nova (regra 5 das cinco: rota só existe se estiver no mapa).
 */
export default function DiretoriaPainel() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [periodo, setPeriodo] = useState<PeriodoDiretoria>('30d');

  const { data: metas = [], isLoading: carregandoMetas } = useMetas();
  const { data: setores = [], isLoading: carregandoSetores } = useChamadosPorSetor(periodo);

  // Só o que é da empresa: objetivo de setor e de pessoa têm a tela de Metas.
  // Cancelado fica de fora — objetivo que a empresa desistiu de perseguir
  // continuar no painel do diretor é o tipo de número que engana sem errar.
  const daEmpresa = metas.filter(m => m.scope === 'company' && m.status !== 'cancelled');
  const comChamado = setores.filter(s => s.abertos > 0 || s.resolvidos > 0);
  const totalEstourados = setores.reduce((soma, s) => soma + s.estourados, 0);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Building2}
        title="Diretoria"
        description="Onde a empresa está: os objetivos do ano, as metas comerciais e como cada setor está respondendo."
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6">
        <Tabs defaultValue="visao-geral">
          <TabsList>
            <TabsTrigger value="visao-geral">Visão geral</TabsTrigger>
            <TabsTrigger value="metas">Metas</TabsTrigger>
            <TabsTrigger value="meta-x-realizado">Meta × realizado</TabsTrigger>
            <TabsTrigger value="comparativo">Comparativo entre anos</TabsTrigger>
            <TabsTrigger value="conciliacao">Conciliação</TabsTrigger>
          </TabsList>

          <TabsContent value="visao-geral" className="space-y-6 pt-4">
            <div className="flex justify-end">
              <Select value={periodo} onValueChange={(v) => setPeriodo(v as PeriodoDiretoria)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="90d">Últimos 90 dias</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {totalEstourados > 0 && (
          <div className="rounded-lg border border-status-danger/40 bg-status-danger/5 p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-status-danger mt-0.5" aria-hidden="true" />
            <p className="text-[13px] text-foreground">
              <strong>{totalEstourados}</strong>{' '}
              {totalEstourados === 1 ? 'chamado aberto já passou do prazo' : 'chamados abertos já passaram do prazo'}.
              {' '}É o número que pede alguma coisa hoje — e ele não depende do período escolhido acima.
            </p>
          </div>
        )}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-foreground">Objetivos da empresa</h2>
              <p className="text-[12px] text-muted-foreground">
                O que vale para a casa inteira. Objetivo de setor e de pessoa ficam em Metas.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate(tenantPath('/metas'))}>
              Abrir Metas
              <ArrowRight className="w-3.5 h-3.5 ml-1.5" aria-hidden="true" />
            </Button>
          </div>

          {carregandoMetas ? (
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
              {daEmpresa.map(meta => <CartaoObjetivo key={meta.id} meta={meta} />)}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Chamados por setor</h2>
            <p className="text-[12px] text-muted-foreground">
              <strong>Abertos</strong> e <strong>atrasados</strong> são de agora — a fila como ela está,
              inclusive o que foi aberto antes do período. <strong>Resolvidos</strong>, <strong>no prazo</strong> e
              <strong> tempo médio</strong> são do período escolhido.
            </p>
          </div>

          {carregandoSetores ? (
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
                  {comChamado.map(s => (
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
          </TabsContent>

          <TabsContent value="metas" className="pt-4">
            <DiretoriaMetas />
          </TabsContent>
          <TabsContent value="meta-x-realizado" className="pt-4">
            <DiretoriaMetaXRealizado />
          </TabsContent>
          <TabsContent value="comparativo" className="pt-4">
            <DiretoriaComparativo />
          </TabsContent>
          <TabsContent value="conciliacao" className="pt-4">
            <DiretoriaConciliacao />
          </TabsContent>
        </Tabs>
      </div>
    </div>
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
