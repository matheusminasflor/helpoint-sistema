import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { ROTULO_DA_ETAPA, TIPOS, deQuemEAVez, terminou } from '@/config/solicitacoes';
import type { Solicitacao } from '@/hooks/useSolicitacoes';
import { haQuantoTempo, todayISO } from '@/lib/dates';
import { formatBRL } from '@/types/financeiro';
import { cn } from '@/lib/utils';

/**
 * A lista de solicitações (etapa 4b): o pedido, de quem, há quanto tempo, a etapa e de quem é a vez. Vermelho só no
 * que passou do "preciso até" da arte. Em lista de duas linhas, que cabe no celular.
 */
export function ListaDeSolicitacoes({ linhas, carregando, vazio, mostrarQuem = true }: {
  linhas: Solicitacao[]; carregando: boolean; vazio: string; mostrarQuem?: boolean;
}) {
  const tenantPath = useTenantPath();
  const hoje = todayISO();
  if (carregando) return <div className="space-y-1">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  if (linhas.length === 0) return <EmptyState icon={ClipboardList} title={vazio} description="" />;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {linhas.map((s) => {
        const vez = terminou(s.tipo, s.etapa) ? null : deQuemEAVez(s.tipo, s.etapa);
        const atrasada = !!s.preciso_ate && s.preciso_ate < hoje && !terminou(s.tipo, s.etapa) && s.etapa !== 'entregue';
        return (
          <li key={s.id}>
            <Link to={tenantPath(`/solicitacoes/${s.id}`)} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-muted/40">
              <span className="flex-1 min-w-[14rem]">
                <span className="block text-[14px] font-medium text-foreground">{s.titulo}</span>
                <span className="block text-[13px] text-muted-foreground">
                  #{s.numero} · {TIPOS[s.tipo].rotulo}
                  {mostrarQuem && ` · ${s.para?.full_name ?? s.solicitante?.full_name ?? '—'}`}
                  {s.valor != null && ` · ${formatBRL(Number(s.valor))}`}
                  {s.preciso_ate && <span className={cn(atrasada && 'text-status-danger')}> · para {s.preciso_ate.slice(8, 10)}/{s.preciso_ate.slice(5, 7)}{atrasada ? ' (passou)' : ''}</span>}
                </span>
              </span>
              <span className="text-right text-[13px] shrink-0">
                <span className={cn('block', s.etapa === 'recusada' ? 'text-status-danger' : 'text-foreground')}>{ROTULO_DA_ETAPA[s.etapa]}</span>
                <span className="block text-muted-foreground tabular-nums">{vez ? `${vez} · ` : ''}{haQuantoTempo(s.atualizada_em)}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
