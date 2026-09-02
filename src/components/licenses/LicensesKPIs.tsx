import { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Key, CheckCircle2, AlertTriangle, Clock, CalendarX, Users } from 'lucide-react';
import { KPIGrid } from '@/components/dashboard/KPIGrid';
import { KPICard } from '@/components/glpi/KPICard';
import { useLicenses } from '@/hooks/useLicenses';
import { format, addDays, addMonths, endOfYear, isAfter, isBefore } from 'date-fns';
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

    const today = new Date();
    const in30 = addDays(today, 30);
    const in90 = addMonths(today, 3);
    const yearEnd = endOfYear(today);

    let expired = 0, expiringMonth = 0, expiring90 = 0, expiringYear = 0;
    const upcoming: typeof list = [];

    list.forEach(l => {
      if (!l.expiry_date) return;
      const d = new Date(l.expiry_date);
      if (isBefore(d, today)) { expired++; return; }
      if (isBefore(d, in30)) expiringMonth++;
      if (isBefore(d, in90)) expiring90++;
      if (isBefore(d, yearEnd)) expiringYear++;
      if (isAfter(d, today) && isBefore(d, in90)) upcoming.push(l);
    });

    upcoming.sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime());

    return { totalLicenses, totalSeats, usedSeats, availableSeats, expired, expiringMonth, expiring90, expiringYear, upcoming: upcoming.slice(0, 6) };
  }, [licenses]);

  if (isLoading) return <div className="h-32 animate-pulse bg-muted/40 rounded-lg" />;

  return (
    <div className="space-y-4">
      <KPIGrid lgCols={4}>
        <KPICard value={metrics.totalLicenses} label={`Licenças cadastradas · ${metrics.totalSeats} seats`} icon={Key} color="blue" />
        <KPICard value={metrics.usedSeats} label={`Seats em uso · ${metrics.availableSeats} disponíveis`} icon={CheckCircle2} color="green" />
        <KPICard value={metrics.expiringMonth} label="Vencem este mês" icon={Clock} color="orange" />
        <KPICard value={metrics.expired} label="Vencidas" icon={CalendarX} color="red" />
      </KPIGrid>

      <KPIGrid lgCols={3}>
        <KPICard value={metrics.expiringMonth} label="Próximos 30 dias" icon={AlertTriangle} color="yellow" />
        <KPICard value={metrics.expiring90} label="Próximos 90 dias" icon={AlertTriangle} color="orange" />
        <KPICard value={metrics.expiringYear} label="Vencem este ano" icon={AlertTriangle} color="purple" />
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
                    <p className="text-xs font-mono text-foreground">{format(new Date(l.expiry_date!), "dd 'de' MMM yyyy", { locale: ptBR })}</p>
                    <p className="text-[10px] text-muted-foreground">
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
