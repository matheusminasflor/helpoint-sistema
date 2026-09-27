import { useNavigate } from 'react-router-dom';
import { PackageCheck, Play, Truck } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantPath } from '@/hooks/useTenantPath';
import { formatDateBR } from '@/lib/crm';
import { useExpedicaoQueue, useStartShipment, SHIPMENT_STATUS_LABELS } from '@/hooks/useExpedicao';

/**
 * A fila da Expedição (EXP-1): pedido pago ainda sem separação e as
 * separações abertas, na ordem em que foram pagos. Uma consulta só
 * (`exp_queue`), para a fila não depender de ninguém criar nada antes.
 */
export default function ExpedicaoFila() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: queue = [], isLoading } = useExpedicaoQueue();
  const start = useStartShipment();

  const abrir = (row: (typeof queue)[number]) => {
    if (row.shipment_id) {
      navigate(tenantPath(`/expedicao/separar/${row.shipment_id}`));
      return;
    }
    start.mutate(row.order_id, { onSuccess: (id) => navigate(tenantPath(`/expedicao/separar/${id}`)) });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={PackageCheck}
        title="A separar"
        description="Pedido pago entra aqui. Separe bipando os itens e despache."
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : queue.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nada para separar agora. Pedido pago aparece aqui sozinho.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {queue.map((row) => (
            <Card key={row.shipment_id ?? row.order_id} className="hover:shadow-card transition-shadow">
              <CardContent className="flex flex-wrap items-center gap-3 py-3">
                <Badge variant={row.status === 'a_separar' ? 'outline' : 'secondary'} className="shrink-0">
                  {SHIPMENT_STATUS_LABELS[row.status] ?? row.status}
                </Badge>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    Pedido #{row.order_number} — {row.contact_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.paid_at ? `Pago em ${formatDateBR(row.paid_at.slice(0, 10))}` : 'Sem data de pagamento'}
                    {row.carrier ? ` · ${row.carrier}` : ''}
                    {row.shipment_id ? ` · ${row.picked_items}/${row.items} itens separados` : ` · ${row.items} itens`}
                  </p>
                </div>
                {row.tracking_code && <span className="font-mono text-xs text-muted-foreground">{row.tracking_code}</span>}
                <Button size="sm" onClick={() => abrir(row)} disabled={start.isPending}>
                  {row.status === 'a_separar' ? <><Play className="h-3.5 w-3.5 mr-1.5" /> Separar</> : <><Truck className="h-3.5 w-3.5 mr-1.5" /> Continuar</>}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
