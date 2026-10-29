// O modelo de todo relatório novo (proposta "Helpoint no dia a dia", etapa 5): resumo em cima, cada número com o
// período anterior; a lista embaixo, com busca, ordem pela coluna e Exportar. Um modelo só, para as nove telas
// funcionarem igual (Jakob) e o conserto de uma valer para todas.
import { useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowDown, ArrowUp, FileDown } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { KPICard } from '@/components/glpi/KPICard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltroDePeriodo } from '@/components/financeiro/FiltroDePeriodo';
import { useQueryState } from '@/hooks/useQueryState';
import { casaBusca, exportarPlanilha, ordenarPor, proximaOrdem, type Ordem } from '@/lib/tabela';
import type { PeriodoDoRelatorio } from '@/hooks/usePeriodoDoRelatorio';
import { cn } from '@/lib/utils';


export interface NumeroDoResumo {
  rotulo: string;
  valor: number | null;
  formatar: (n: number) => string;
  anterior?: number | null;
  melhorQuando?: 'mais' | 'menos' | 'neutro';
  /** Uma frase embaixo (ex.: o nome do fornecedor que mais pesou); vermelha com `ruim`. */
  nota?: string;
  ruim?: boolean;
}

export interface ColunaDoRelatorio<T> {
  chave: string;
  rotulo: string;
  /** O valor que ordena, busca e vai para a planilha. */
  valor: (l: T) => string | number | null;
  /** Como aparece na tela (quando difere do valor cru). */
  mostrar?: (l: T) => ReactNode;
  direita?: boolean;
}

export function ModeloDeRelatorio<T>({
  titulo, descricao, icone, periodo, controles, acima, resumo, colunas, linhas, chave, carregando, erro, vazio, arquivo,
}: {
  titulo: string; descricao: string; icone: LucideIcon;
  periodo?: PeriodoDoRelatorio | null;
  /** Filtros e alternâncias próprios do relatório, ao lado do período. */
  controles?: ReactNode;
  /** O que vem antes do resumo (ex.: o saldo informado da previsão de caixa). */
  acima?: ReactNode;
  resumo: NumeroDoResumo[];
  colunas: ColunaDoRelatorio<T>[];
  linhas: T[];
  chave: (l: T, i: number) => string;
  carregando: boolean;
  erro?: unknown;
  vazio: string;
  arquivo: string;
}) {
  const [busca, setBusca] = useQueryState<string>('q', '');
  const [ordem, setOrdem] = useState<Ordem | null>(null);
  const filtradas = linhas.filter((l) => casaBusca(colunas.map((c) => c.valor(l)), busca));
  const col = ordem ? colunas.find((c) => c.chave === ordem.coluna) : undefined;
  const ordenadas = col ? ordenarPor(filtradas, col.valor, ordem!.direcao) : filtradas;
  const exportar = () => exportarPlanilha(arquivo, ordenadas.map((l) =>
    Object.fromEntries(colunas.map((c) => [c.rotulo, c.valor(l)]))));

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title={titulo} description={descricao} icon={icone}
        actions={<Button variant="outline" size="sm" className="max-[860px]:hidden" disabled={ordenadas.length === 0} onClick={exportar}>
          <FileDown className="w-4 h-4 mr-1.5" aria-hidden="true" />Exportar
        </Button>} />
      <div className="px-4 lg:px-8 pb-6 space-y-4">
        {(periodo || controles) && (
          <div className="flex flex-wrap items-center gap-3">
            {periodo && <FiltroDePeriodo tipo={periodo.tipo} onTipo={periodo.setTipo}
              personalizado={periodo.personalizado} onPersonalizado={periodo.setPersonalizado} />}
            {controles}
          </div>
        )}
        {periodo && (
          <p className="text-[13px] text-muted-foreground">
            {dia(periodo.atual.de)} a {dia(periodo.atual.ate)}, comparado com {dia(periodo.anterior.de)} a {dia(periodo.anterior.ate)}.
          </p>
        )}
        {acima}
        {erro ? (
          <p className="text-[14px] text-status-danger">Não foi possível ler este relatório: {erro instanceof Error ? erro.message : String((erro as { message?: string })?.message ?? erro)}</p>
        ) : carregando ? <Skeleton className="h-24 w-full" /> : (
          <div className={cn('faixa-de-numeros grid', resumo.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3')}>
            {resumo.map((n) => (
              <KPICard key={n.rotulo} label={n.rotulo} color={n.ruim ? 'red' : 'grey'}
                value={n.valor == null ? '—' : n.formatar(n.valor)} numero={n.valor}
                anterior={periodo ? n.anterior : undefined} melhorQuando={n.melhorQuando ?? 'neutro'} formatarDiferenca={n.formatar}
                nota={n.nota} notaRuim={n.ruim} />
            ))}
          </div>
        )}
        {!erro && (
          <section className="space-y-2">
            <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar na lista" aria-label="Buscar na lista" className="max-w-xs" />
            {carregando ? <Skeleton className="h-40 w-full" /> : ordenadas.length === 0 ? (
              <p className="text-[14px] text-muted-foreground py-6">{busca ? 'Nada com essa busca.' : vazio}</p>
            ) : (
              <div className="panel overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="bg-muted text-left text-[13px] font-bold text-foreground">
                      {colunas.map((c) => (
                        <th key={c.chave} className={cn('px-4 py-3 whitespace-nowrap', c.direita && 'text-right')}>
                          <button type="button" className="inline-flex items-center gap-1 hover:text-primary"
                            onClick={() => setOrdem((o) => proximaOrdem(o, c.chave))}>
                            {c.rotulo}
                            {ordem?.coluna === c.chave && (ordem.direcao === 'asc'
                              ? <ArrowUp className="w-3 h-3" aria-label="crescente" /> : <ArrowDown className="w-3 h-3" aria-label="decrescente" />)}
                          </button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ordenadas.map((l, i) => (
                      <tr key={chave(l, i)} className="border-t border-border hover:bg-primary/5">
                        {colunas.map((c) => (
                          <td key={c.chave} className={cn('px-4 py-3', c.direita && 'text-right tabular-nums whitespace-nowrap')}>
                            {c.mostrar ? c.mostrar(l) : (c.valor(l) ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-[12px] text-muted-foreground">{ordenadas.length} linha{ordenadas.length === 1 ? '' : 's'}.</p>
          </section>
        )}
      </div>
    </div>
  );
}

const dia = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
