import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Star, ThumbsDown, TrendingUp, MessageSquareWarning } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Props {
  /** ISO string OR null = todo o histórico */
  startDate: string | null;
}

interface Rated {
  id: string;
  ticket_number: number;
  customer_name: string;
  satisfaction_rating: number;
  satisfaction_resolved: string | null;
  satisfaction_comment: string | null;
  satisfaction_rated_at: string;
  subject: string | null;
  product_name: string | null;
}

export function SatisfactionBlock({ startDate }: Props) {
  const [rows, setRows] = useState<Rated[]>([]);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from('sac_tickets')
        .select('id, ticket_number, customer_name, satisfaction_rating, satisfaction_resolved, satisfaction_comment, satisfaction_rated_at, subject, product_name')
        .not('satisfaction_rating', 'is', null);
      if (startDate) q = q.gte('satisfaction_rated_at', startDate);
      const { data, error } = await q.order('satisfaction_rated_at', { ascending: false });
      if (error) { console.error(error); return; }
      setRows((data as Rated[]) || []);
    })();
  }, [startDate]);

  const stats = useMemo(() => {
    if (!rows.length) return { count: 0, avg: 0, solved: 0, low: 0, nps: 0 };
    const total = rows.length;
    const sum = rows.reduce((a, b) => a + (b.satisfaction_rating || 0), 0);
    const solved = rows.filter(r => r.satisfaction_resolved === 'yes').length;
    const low = rows.filter(r => (r.satisfaction_rating || 0) <= 2).length;
    const promoters = rows.filter(r => (r.satisfaction_rating || 0) >= 5).length;
    const detractors = rows.filter(r => (r.satisfaction_rating || 0) <= 3).length;
    const nps = Math.round(((promoters - detractors) / total) * 100);
    return {
      count: total,
      avg: Math.round((sum / total) * 10) / 10,
      solved: Math.round((solved / total) * 100),
      low,
      nps,
    };
  }, [rows]);

  const lowRows = useMemo(() => rows.filter(r => (r.satisfaction_rating || 0) <= 2), [rows]);

  return (
    <>
      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-500 fill-current" />
              Satisfação do cliente
            </h3>
            <p className="text-xs text-muted-foreground">Avaliações dos SACs encerrados no período.</p>
          </div>
          {stats.low > 0 && (
            <Button size="sm" variant="outline" onClick={() => setDrawer(true)}>
              <ThumbsDown className="w-3 h-3 mr-1" /> Ver {stats.low} avaliação(ões) baixa(s)
            </Button>
          )}
        </div>

        {stats.count === 0 ? (
          <p className="text-sm text-muted-foreground">Ainda não há avaliações no período.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Tile label="Avaliações" value={stats.count} icon={MessageSquareWarning} />
            <Tile label="Média de notas" value={`${stats.avg} / 5`} icon={Star} accent="text-yellow-500" />
            <Tile label="% solucionados" value={`${stats.solved}%`} icon={TrendingUp} accent="text-green-600" />
            <Tile label="NPS simplificado" value={stats.nps} icon={TrendingUp}
                  accent={stats.nps >= 50 ? 'text-green-600' : stats.nps >= 0 ? 'text-yellow-600' : 'text-red-600'} />
          </div>
        )}
      </Card>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Avaliações baixas (1 e 2 estrelas)</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {lowRows.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma avaliação baixa.</p>}
            {lowRows.map(r => (
              <Card key={r.id} className="p-3 border-l-4 border-l-red-500">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-mono text-muted-foreground">
                      SAC-{String(r.ticket_number).padStart(5, '0')}
                    </p>
                    <p className="font-semibold text-sm truncate">{r.subject || r.product_name || 'Solicitação'}</p>
                    <p className="text-xs text-muted-foreground">Cliente: {r.customer_name}</p>
                  </div>
                  <span className="flex items-center gap-0.5 whitespace-nowrap" aria-label={`Avaliação ${r.satisfaction_rating} de 5`}>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star
                        key={i}
                        className={i < r.satisfaction_rating ? 'w-3.5 h-3.5 fill-status-warning text-status-warning' : 'w-3.5 h-3.5 text-muted-foreground'}
                        aria-hidden="true"
                      />
                    ))}
                  </span>
                </div>
                <div className="mt-2 text-xs space-y-1">
                  <p>
                    <strong>Resolvido?</strong>{' '}
                    {r.satisfaction_resolved === 'yes' ? 'Sim'
                      : r.satisfaction_resolved === 'partial' ? 'Parcialmente'
                      : r.satisfaction_resolved === 'no' ? 'Não' : '—'}
                  </p>
                  {r.satisfaction_comment && (
                    <p className="mt-1 p-2 bg-surface-2 rounded text-foreground whitespace-pre-wrap">
                      "{r.satisfaction_comment}"
                    </p>
                  )}
                  <p className="text-muted-foreground">
                    {format(new Date(r.satisfaction_rated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
                <a
                  href={`/qualidade/sacs?ticket=${r.id}`}
                  className="text-xs text-primary hover:underline mt-2 inline-block"
                >
                  Abrir SAC →
                </a>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Tile({ label, value, icon: Icon, accent = 'text-foreground' }: any) {
  return (
    <div className="p-3 bg-surface-1 rounded border">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
        <Icon className="w-3.5 h-3.5" /> {label}
      </div>
      <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}
