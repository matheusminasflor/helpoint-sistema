// "Avaliações dos atendentes" (dono, 2026-10-09): o indicador do gestor — por atendente, a média, quantas e
// as estrelas; embaixo, cada avaliação com o motivo e o chamado, as de 1 e 2 estrelas em destaque. Sigiloso:
// só aparece para quem o banco deixa ver (gestor do setor, Diretoria, administrador); o atendente não vê.
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Lock, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { useTenantPath } from '@/hooks/useTenantPath';
import { ticketDetailPath } from '@/lib/ticket-route';
import type { MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { useAvaliacoesDoSetor, useVeAvaliacoes } from '@/hooks/useAvaliacoesDoAtendimento';
import { cn } from '@/lib/utils';

function Estrelas({ nota }: { nota: number }) {
  return (
    <span className="inline-flex" aria-label={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn('h-3.5 w-3.5', n <= nota ? 'fill-status-warning text-status-warning' : 'text-muted-foreground')} aria-hidden="true" />
      ))}
    </span>
  );
}

export function AvaliacoesDosAtendentes({ module, filter }: { module?: string; filter: MetricsFilter }) {
  const { tenantId } = useAuth();
  const tenantPath = useTenantPath();
  const { data: ve = false } = useVeAvaliacoes(module);
  const { data: avaliacoes = [] } = useAvaliacoesDoSetor(module, filter, ve);
  const ids = useMemo(() => [...new Set(avaliacoes.flatMap((a) => (a.atendente_id ? [a.atendente_id] : [])))], [avaliacoes]);
  const tickets = useMemo(() => avaliacoes.map((a) => a.ticket_id), [avaliacoes]);
  const { data: nomes = {} } = useQuery({
    queryKey: ['avaliacoes-nomes', tenantId, ids],
    enabled: !!tenantId && ids.length > 0,
    queryFn: async () => Object.fromEntries((unwrap(await supabase.from('profiles').select('id, full_name, email').in('id', ids)) ?? [])
      .map((p) => [p.id, p.full_name || p.email])) as Record<string, string>,
  });
  const { data: numeros = {} } = useQuery({
    queryKey: ['avaliacoes-chamados', tenantId, tickets],
    enabled: !!tenantId && tickets.length > 0,
    queryFn: async () => Object.fromEntries((unwrap(await supabase.from('tickets').select('id, ticket_number').in('id', tickets)) ?? [])
      .map((t) => [t.id, t.ticket_number])) as Record<string, number>,
  });

  if (!module || !ve) return null;

  const porAtendente = ids.map((id) => {
    const notas = avaliacoes.filter((a) => a.atendente_id === id).map((a) => a.nota);
    return { id, nome: nomes[id] ?? '—', media: notas.reduce((s, n) => s + n, 0) / notas.length, total: notas.length,
      baixas: notas.filter((n) => n <= 2).length };
  }).sort((a, b) => a.media - b.media);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Avaliações dos atendentes</CardTitle>
        <CardDescription>Sigiloso: o atendente não vê a nota nem o comentário. Só o gestor do setor, a Diretoria e o administrador.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {avaliacoes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma avaliação no período.</p>
        ) : (
          <>
            <div className="rounded-lg border border-border divide-y divide-border">
              {porAtendente.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{a.nome}</span>
                  <span className="flex items-center gap-3">
                    <Estrelas nota={Math.round(a.media)} />
                    <b className="font-mono tabular-nums">{a.media.toFixed(1)}</b>
                    <span className="text-muted-foreground">{a.total} {a.total === 1 ? 'avaliação' : 'avaliações'}</span>
                    {a.baixas > 0 && <span className="badge-danger rounded-full px-2 py-0.5 text-[12px] font-semibold">{a.baixas} com 1–2 estrelas</span>}
                  </span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">As avaliações e os motivos</p>
              {avaliacoes.map((a) => (
                <div key={a.ticket_id} className={cn('rounded-md border px-3 py-2 text-sm', a.nota <= 2 ? 'border-destructive/40 bg-destructive/5' : 'border-border')}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Estrelas nota={a.nota} />
                    <span className="text-muted-foreground">{a.atendente_id ? nomes[a.atendente_id] ?? '—' : 'sem atendente'}</span>
                    {numeros[a.ticket_id] && (
                      <Link to={tenantPath(ticketDetailPath(module, a.ticket_id))} className="text-primary text-xs">#{numeros[a.ticket_id]}</Link>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <p className={cn('mt-1', !a.comentario && 'text-muted-foreground')}>{a.comentario ?? 'Sem comentário.'}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
