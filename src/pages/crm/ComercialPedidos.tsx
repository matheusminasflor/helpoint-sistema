import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Copy, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useCRMOrders } from '@/hooks/useCRM';
import { formatBRL, ORDER_STATUS_LABELS } from '@/lib/crm';

export default function ComercialPedidos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: orders = [], isLoading } = useCRMOrders();
  const [statusFilter, setStatusFilter] = useState('__all__');

  const filtered = useMemo(
    () => (statusFilter === '__all__' ? orders : orders.filter((o) => o.status === statusFilter)),
    [orders, statusFilter],
  );

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copiado.');
  };

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Pedidos"
        description="Todos os pedidos do Comercial."
        icon={ShoppingCart}
        actions={
          <Button onClick={() => navigate(tenantPath('/crm/pedidos/novo'))}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo pedido
          </Button>
        }
      >
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Todos os status</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </PageHeader>

      <div className="p-4 lg:p-6">
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="Nenhum pedido" description="Pedidos criados a partir de um negócio aparecem aqui." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold border-r border-border">Número</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Contato</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Negócio</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Status</th>
                    <th className="px-3 py-2 font-semibold border-r border-border text-right">Total</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Criado em</th>
                    <th className="px-3 py-2 font-semibold">Link</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border hover:bg-secondary/50 cursor-pointer"
                      onClick={() => navigate(tenantPath(`/crm/pedidos/${order.id}`))}
                    >
                      <td className="px-3 py-2 font-medium">#{order.number}</td>
                      <td className="px-3 py-2">{order.contact?.name ?? '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{order.deal?.title ?? '—'}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge></td>
                      <td className="px-3 py-2 font-mono text-right">{formatBRL(order.total)}</td>
                      <td className="px-3 py-2 text-xs">{new Date(order.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="px-3 py-2">
                        {order.link_url && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={(e) => { e.stopPropagation(); copyLink(order.link_url!); }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
