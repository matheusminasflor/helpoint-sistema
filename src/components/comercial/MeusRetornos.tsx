import { useMemo } from 'react';
import { CalendarClock } from 'lucide-react';
import { useMeusRetornos, type Interacao } from '@/hooks/useComercialLancamentos';
import { todayISO } from '@/lib/dates';
import { formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

/**
 * A faixa "Meus retornos" no topo dos Lançamentos (etapa 4 · Comercial, 2026-10-24): atrasados, hoje e próximos, sem
 * filtro de mês. Clicar abre o lançamento para avançar o status ou registrar o retorno.
 */
export function MeusRetornos({ onAbrir }: { onAbrir: (l: Interacao) => void }) {
  const { data: retornos = [], isLoading, isError } = useMeusRetornos();
  const hoje = todayISO();
  const grupos = useMemo(() => ([
    { chave: 'atrasados', rotulo: 'Atrasados', itens: retornos.filter((r) => r.prazo! < hoje) },
    { chave: 'hoje', rotulo: 'Hoje', itens: retornos.filter((r) => r.prazo === hoje) },
    { chave: 'proximos', rotulo: 'Próximos', itens: retornos.filter((r) => r.prazo! > hoje) },
  ]), [retornos, hoje]);

  if (isLoading) return null;
  if (isError) return <p className="text-[13px] text-status-danger">Não consegui carregar os seus retornos.</p>;
  if (retornos.length === 0) return null;

  return (
    <section aria-label="Meus retornos" className="rounded-lg border border-border bg-card p-3">
      <h2 className="text-[14px] font-semibold flex items-center gap-2 mb-2">
        <CalendarClock className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Meus retornos
      </h2>
      <div className="grid gap-3 md:grid-cols-3">
        {grupos.map((g) => (
          <div key={g.chave} className="min-w-0">
            <p className={cn('text-[13px] mb-1', g.chave === 'atrasados' && g.itens.length ? 'text-status-danger font-semibold' : 'text-muted-foreground')}>
              {g.rotulo} <span className="tabular-nums">({g.itens.length})</span>
            </p>
            <ul className="space-y-1">
              {g.itens.slice(0, 5).map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => onAbrir(r)}
                    className="w-full text-left text-[13px] rounded px-1.5 py-1 hover:bg-secondary flex gap-2 min-w-0">
                    <span className="tabular-nums text-muted-foreground shrink-0">{formatDateBR(r.prazo!)}</span>
                    <span className="truncate">{r.cliente?.razao_social ?? r.cliente_codigo ?? 'Sem cliente'}</span>
                  </button>
                </li>
              ))}
              {g.itens.length > 5 && <li className="text-[12px] text-muted-foreground px-1.5">e mais {g.itens.length - 5}</li>}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
