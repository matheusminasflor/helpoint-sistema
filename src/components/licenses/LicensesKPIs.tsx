import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Key, CheckCircle2, AlertTriangle, Clock, Users } from 'lucide-react';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { useLicenses } from '@/hooks/useLicenses';
import { format, addDays, isAfter, isBefore, parseISO, startOfDay } from 'date-fns';
import { contarVencimentos } from '@/lib/vencimentos-de-licenca';
import { ptBR } from 'date-fns/locale';

export function LicensesKPIs() {
  const { data: licenses, isLoading } = useLicenses();

  const metrics = useMemo(() => {
    const list = licenses || [];
    const softwareList = list.filter(l => (l.item_category || 'software') === 'software');
    const totalLicenses = list.length;
    const totalSeats = softwareList.reduce((s, l) => s + (l.total_quantity || 0), 0);
    const usedSeats = softwareList.reduce((s, l) => s + (l.used_quantity || 0), 0);
    const availableSeats = totalSeats - usedSeats;

    // As contas de vencimento moram em `contarVencimentos` (defeito 5: "este mês" e "30 dias" eram a mesma conta).
    const v = contarVencimentos(list.map((l) => l.expiry_date), new Date());
    const today = startOfDay(new Date());
    const in90 = addDays(today, 90);
    const upcoming = list
      .filter((l) => l.expiry_date && !isBefore(parseISO(l.expiry_date), today) && !isAfter(parseISO(l.expiry_date), in90))
      .sort((a, b) => parseISO(a.expiry_date!).getTime() - parseISO(b.expiry_date!).getTime());

    return { totalLicenses, totalSeats, usedSeats, availableSeats, expired: v.vencidas, expiringMonth: v.esteMes,
      expiring30: v.em30, expiring90: v.em90, expiringYear: v.esteAno, upcoming: upcoming.slice(0, 6) };
  }, [licenses]);

  if (isLoading) return <div className="h-32 animate-pulse bg-muted/40 rounded-lg" />;

  return (
    <div className="space-y-4">
      {/* Três números (etapa 4 · TI, 2026-10-24): eram sete, dois iguais, e a palavra "seats". As vencidas aparecem
          no primeiro, em vermelho, só quando existem. */}
      <KPIGrid lgCols={3}>
        <KPICard value={metrics.totalLicenses - metrics.expired}
          label={metrics.expired > 0 ? `Licenças ativas · ${metrics.expired} vencida${metrics.expired === 1 ? '' : 's'}` : 'Licenças ativas'}
          icon={Key} color="blue" />
        <KPICard value={metrics.expiring30} label="Vencem em 30 dias" icon={Clock} color="orange" />
        <KPICard value={metrics.availableSeats} label={`Vagas livres · ${metrics.usedSeats} de ${metrics.totalSeats} em uso`} icon={CheckCircle2} color="green" />
      </KPIGrid>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-3">Próximas a vencer (90 dias)</h3>
        {metrics.upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma licença a vencer nos próximos 90 dias.</p>
        ) : (
          <ul className="divide-y divide-border">
            {metrics.upcoming.map(l => {
              const isSoftware = (l.item_category || 'software') === 'software';
              return (
                <li key={l.id} className="py-2 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    {l.vendor && <p className="text-xs text-muted-foreground truncate">{l.vendor}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-mono text-foreground">{format(parseISO(l.expiry_date!), "dd 'de' MMM yyyy", { locale: ptBR })}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {isSoftware ? `${l.used_quantity}/${l.total_quantity} seats` : 'Item único'}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
