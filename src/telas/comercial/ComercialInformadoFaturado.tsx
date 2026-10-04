// Comercial › Insights › Informado × Faturado (decisão do dono, 2026-10-03): o valor que cada
// vendedora LANÇOU ao lado do que foi FATURADO (a nota importada do Forteplus), por vendedora e
// por cliente, num período.
//
// O corte: o faturado só existe até a última nota importada. O que foi lançado depois dessa data
// é "prévia (ainda não importado)", em coluna própria e fora da diferença — senão a diferença
// cresceria só porque a importação ainda não chegou. A conta inteira mora no banco
// (`com_lancado_x_faturado`); esta tela agrupa e ordena (`src/lib/lancado-x-faturado.ts`).
//
// Esta tela NÃO muda os Indicadores do Comercial: lá a venda continua sendo o lançado. Se o
// faturado passa a mandar lá dentro é outra decisão do dono.
import { Fragment, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { SeletorPeriodoDaCompetencia } from '@/components/comercial/SeletorPeriodoDaCompetencia';
import { usePeriodoDaCompetencia } from '@/hooks/usePeriodoDaCompetencia';
import { useLancadoXFaturado } from '@/hooks/useComercialFamilias';
import { linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import {
  agruparPorCliente, agruparPorVendedora, mesDaCompetencia, totaisLxF, type GrupoLxF,
} from '@/lib/lancado-x-faturado';
import { formatBRL, formatDateBR } from '@/types/financeiro';

type Agrupar = 'vendedora' | 'cliente';

export default function ComercialInformadoFaturado() {
  const recorteDaTela = usePeriodoDaCompetencia();
  const { competencia, intervalo } = recorteDaTela;
  const { de, ate } = intervalo ?? mesDaCompetencia(competencia);
  const { data, isLoading, isError } = useLancadoXFaturado(de, ate);
  const [agrupar, setAgrupar] = useState<Agrupar>('vendedora');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

  const linhas = useMemo(() => data?.linhas ?? [], [data]);
  const totais = totaisLxF(linhas);
  const grupos = useMemo(
    () => (agrupar === 'vendedora' ? agruparPorVendedora(linhas) : agruparPorCliente(linhas)),
    [linhas, agrupar],
  );
  const corte = data?.corte ?? null;
  // Período que começa depois do corte: nada dele foi importado ainda.
  const nadaImportadoNoPeriodo = !!corte && corte < de;

  const alternar = (chave: string) => setAbertos((s) => {
    const novo = new Set(s);
    if (novo.has(chave)) novo.delete(chave); else novo.add(chave);
    return novo;
  });

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Informado × Faturado</h1>
          <p className="text-[13px] text-muted-foreground">
            O que as vendedoras lançaram, lado a lado com a nota fiscal importada. A diferença compara só até a última nota importada.
          </p>
        </div>
        <TutorialDoRelatorio id="comercial-informado-faturado" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SeletorPeriodoDaCompetencia {...recorteDaTela} />
        <div className="flex gap-1">
          <Button size="sm" variant={agrupar === 'vendedora' ? 'secondary' : 'ghost'} onClick={() => setAgrupar('vendedora')}>
            Por vendedora
          </Button>
          <Button size="sm" variant={agrupar === 'cliente' ? 'secondary' : 'ghost'} onClick={() => setAgrupar('cliente')}>
            Por cliente
          </Button>
        </div>
      </div>

      <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
        {corte
          ? <>Faturado importado até <strong>{formatDateBR(corte)}</strong>. O que foi lançado depois dessa data aparece em "Prévia (ainda não importado)" e fica fora da diferença.</>
          : 'Nenhuma venda importada ainda — todo o informado aparece como prévia.'}
        {nadaImportadoNoPeriodo && ' Nenhuma nota deste período foi importada ainda.'}
      </p>

      {isError && (
        <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
          <strong>Não consegui carregar o informado × faturado.</strong> Recarregue a página — o que aparece abaixo não é "tudo zerado".
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi titulo="Informado (até o corte)" valor={formatBRL(totais.informado)} />
        <Kpi titulo="Faturado" valor={formatBRL(totais.faturado)} />
        <Kpi titulo="Diferença" valor={formatBRL(totais.diferenca)} />
        <Kpi titulo="Prévia (ainda não importado)" valor={formatBRL(totais.previa)} />
      </div>

      {data?.cortou && (
        <p className="text-[12px] text-muted-foreground">Mostrando as primeiras {linhas.length} linhas — escolha um período menor.</p>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">{agrupar === 'vendedora' ? 'Vendedora' : 'Cliente'}</th>
                <th className="px-3 py-1.5 font-semibold text-right">Informado</th>
                <th className="px-3 py-1.5 font-semibold text-right">Faturado</th>
                <th className="px-3 py-1.5 font-semibold text-right">Diferença</th>
                <th className="px-3 py-1.5 font-semibold text-right">Prévia (ainda não importado)</th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.chave || 'sem'}>
                  <tr className="border-t cursor-pointer hover:bg-secondary/30" onClick={() => alternar(g.chave)}>
                    <td className="px-3 py-1.5 font-medium">
                      <span className="inline-flex items-center gap-1">
                        {abertos.has(g.chave) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                        {agrupar === 'cliente' ? limparNomeCliente(g.nome) : g.nome}
                        <span className="text-[10px] font-normal text-muted-foreground">
                          ({g.itens} {agrupar === 'vendedora' ? (g.itens === 1 ? 'cliente' : 'clientes') : (g.itens === 1 ? 'vendedora' : 'vendedoras')})
                        </span>
                      </span>
                    </td>
                    <Valores g={g} />
                  </tr>
                  {abertos.has(g.chave) && g.linhas.map((l) => (
                    <tr key={`${g.chave}-${l.vendedor_id ?? 'sem'}-${l.cliente_codigo}`} className="border-t bg-secondary/10">
                      <td className="px-3 py-1 pl-8">
                        {agrupar === 'vendedora' ? (
                          <Link to={linkFichaCliente(l.cliente_codigo)} className="hover:underline">
                            {limparNomeCliente(l.cliente_nome)}
                          </Link>
                        ) : (l.vendedor_nome ?? 'Sem lançamento')}
                        {l.compartilhado && agrupar === 'vendedora' && (
                          <span className="ml-1 text-[10px] text-muted-foreground" title="Outra vendedora também lançou para este cliente; o faturado é o do cliente inteiro.">
                            (compartilhado)
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1 text-right font-mono">{formatBRL(l.lancado_ate_corte)}</td>
                      <td className="px-3 py-1 text-right font-mono">{formatBRL(l.faturado)}</td>
                      <td className="px-3 py-1 text-right font-mono">{formatBRL(l.lancado_ate_corte - l.faturado)}</td>
                      <td className="px-3 py-1 text-right font-mono">{l.lancado_previa ? formatBRL(l.lancado_previa) : '—'}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
              {grupos.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Nada lançado nem faturado no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-lg border border-border p-4 text-[12px] text-muted-foreground space-y-1">
        <div className="text-[13px] font-semibold text-foreground">Como ler</div>
        <p>Informado: lançamentos concluídos com valor, até a data do corte. Faturado: as notas importadas (venda menos devolução) do mesmo período.</p>
        <p>Diferença negativa: faturou mais do que foi lançado. Positiva: foi lançado mais do que faturou.</p>
        <p>O faturado é do cliente: se duas vendedoras lançaram para o mesmo cliente, as duas veem o faturado inteiro dele, e o total do topo conta o cliente uma vez só.</p>
      </div>
    </div>
  );
}

function Valores({ g }: { g: GrupoLxF }) {
  return (
    <>
      <td className="px-3 py-1.5 text-right font-mono">{formatBRL(g.informado)}</td>
      <td className="px-3 py-1.5 text-right font-mono">{formatBRL(g.faturado)}</td>
      <td className="px-3 py-1.5 text-right font-mono font-semibold">{formatBRL(g.diferenca)}</td>
      <td className="px-3 py-1.5 text-right font-mono">{g.previa ? formatBRL(g.previa) : '—'}</td>
    </>
  );
}

function Kpi({ titulo, valor }: { titulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-[11px] text-muted-foreground">{titulo}</div>
      <div className="mt-1 text-xl font-semibold font-mono">{valor}</div>
    </div>
  );
}
