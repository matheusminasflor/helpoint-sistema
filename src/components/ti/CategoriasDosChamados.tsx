// "Chamados por categoria" da Visão Geral (revisão dos Indicadores da TI, 2026-11-01): barras da maior para a menor, e
// cada categoria abre o nível de baixo (revelação progressiva) — Sistemas › Forteplus › Correções e Ajustes. É por esses
// níveis que o dono apresenta. Passar o mouse no número mostra os chamados. O caminho é o do cadastro (20270212170000).
import { useState } from 'react';
import { ChevronRight, Tags } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ExplicacaoDoIndicador } from '@/components/ajuda/ExplicacaoDoIndicador';
import { ListaDeChamadosNoHover } from '@/components/dashboard/ListaDeChamadosNoHover';
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { cn } from '@/lib/utils';
import { arvoreDosChamados, type No } from '@/lib/arvore-de-categorias';


function Ramo({ no, nivel, maior, modulo, abertos, alternar }: {
  no: No; nivel: number; maior: number; modulo: string; abertos: Set<string>; alternar: (caminho: string) => void;
}) {
  const aberto = abertos.has(no.caminho);
  const largura = maior ? Math.max(3, Math.round((no.chamados.length / maior) * 100)) : 0;
  return (
    <>
      <div className="grid grid-cols-[minmax(130px,220px)_1fr_48px] items-center gap-3 py-1 text-sm">
        <div className="min-w-0" style={{ paddingLeft: `${nivel * 18}px` }}>
          {no.filhos.length ? (
            <button type="button" onClick={() => alternar(no.caminho)} aria-expanded={aberto}
              className={cn('flex items-center gap-1 text-left hover:underline min-w-0', nivel === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', aberto && 'rotate-90')} />
              <span className="truncate">{no.nome}</span>
            </button>
          ) : (
            <span className={cn('block truncate pl-5', nivel === 0 ? 'font-medium text-foreground' : 'text-muted-foreground')}>{no.nome}</span>
          )}
        </div>
        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
          <div className={cn('h-full rounded-full', nivel === 0 ? 'bg-primary' : nivel === 1 ? 'bg-primary/60' : 'bg-primary/35')} style={{ width: `${largura}%` }} />
        </div>
        <ListaDeChamadosNoHover titulo={no.caminho} chamados={no.chamados} modulo={modulo}>
          <span className="text-right font-mono font-semibold tabular-nums cursor-pointer underline decoration-dotted underline-offset-4">{no.chamados.length}</span>
        </ListaDeChamadosNoHover>
      </div>
      {aberto && no.filhos.map((f) => (
        <Ramo key={f.caminho} no={f} nivel={nivel + 1} maior={maior} modulo={modulo} abertos={abertos} alternar={alternar} />
      ))}
    </>
  );
}

export function CategoriasDosChamados({ chamados, modulo }: { chamados: ChamadoDoPeriodo[]; modulo: string }) {
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const nos = arvoreDosChamados(chamados);
  const maior = nos[0]?.chamados.length ?? 0;
  const alternar = (caminho: string) => setAbertos((a) => {
    const novo = new Set(a);
    if (novo.has(caminho)) novo.delete(caminho);
    else novo.add(caminho);
    return novo;
  });

  return (
    <Card className="p-5 space-y-3">
      <h3 className="text-sm font-semibold text-foreground flex flex-wrap items-center gap-2">
        <Tags className="h-4 w-4 text-primary" /> Chamados por categoria
        <ExplicacaoDoIndicador id="chamados.categoria_x_status" />
        <span className="text-xs font-normal text-muted-foreground">· clique para abrir as subcategorias</span>
      </h3>
      {nos.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum chamado no período.</p> : (
        <div>{nos.map((no) => <Ramo key={no.caminho} no={no} nivel={0} maior={maior} modulo={modulo} abertos={abertos} alternar={alternar} />)}</div>
      )}
    </Card>
  );
}
