import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, ExternalLink, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CreateTicketForm } from '@/components/helpdesk/CreateTicketForm';
import { ticketDetailPath } from '@/lib/ticket-route';
import { useQueryState } from '@/hooks/useQueryState';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePurchaseRequestsPanel } from '@/hooks/usePurchases';
import { PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL, formatBRLAmount, type PurchaseStatus } from '@/types/purchases';
import { formatDateBR } from '@/types/financeiro';
import { cn } from '@/lib/utils';

type StatusFilter = 'all' | PurchaseStatus;
type PeriodFilter = 'all' | '30d' | '90d' | 'year';

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todas' },
  { key: 'pending_approval', label: 'Aguardando' },
  { key: 'approved', label: 'Aprovadas' },
  { key: 'rejected', label: 'Reprovadas' },
  { key: 'completed', label: 'Concluídas' },
];

const PERIOD_TABS: { key: PeriodFilter; label: string }[] = [
  { key: 'all', label: 'Todo período' },
  { key: '30d', label: 'Últimos 30 dias' },
  { key: '90d', label: 'Últimos 90 dias' },
  { key: 'year', label: 'Este ano' },
];

function periodStart(period: PeriodFilter): string | undefined {
  const now = new Date();
  if (period === '30d') return new Date(now.getTime() - 30 * 864e5).toISOString();
  if (period === '90d') return new Date(now.getTime() - 90 * 864e5).toISOString();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).toISOString();
  return undefined;
}

export default function ComprasSolicitacoes() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [status, setStatus] = useQueryState<StatusFilter>('situacao', 'all');
  const [department, setDepartment] = useQueryState<string>('setor', '');
  const [period, setPeriod] = useQueryState<PeriodFilter>('periodo', 'all');
  const [pedindo, setPedindo] = useState(false);

  const { data: requests = [], isLoading } = usePurchaseRequestsPanel({
    status: status === 'all' ? undefined : status,
    department: department || undefined,
    from: periodStart(period),
  });

  const departments = useMemo(
    () => Array.from(new Set(requests.map(r => r.department).filter(Boolean) as string[])).sort(),
    [requests],
  );

  const total = requests.reduce((sum, r) => sum + Number(r.estimated_amount || 0), 0);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Solicitações de Compra"
        description="Todas as compras pedidas pela empresa, sem precisar abrir chamado por chamado."
        icon={ShoppingCart}
      >
        {/* PEDIR UMA COMPRA MUDOU DE LUGAR em 2026-09-28. Era assim: entrar em
            Financeiro → Chamados → novo chamado → escolher uma categoria marcada como
            compra. Três telas para pedir um mouse, e num módulo que não é o de quem
            pede. Agora o botão está onde as compras moram. */}
        <Button size="sm" onClick={() => setPedindo(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Nova solicitação
        </Button>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setStatus(t.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                status === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          {PERIOD_TABS.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => setPeriod(t.key)}
              className={cn(
                'px-3 py-1 text-xs font-medium rounded-full transition-colors',
                period === t.key ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-muted',
              )}
            >
              {t.label}
            </button>
          ))}
          {departments.length > 0 && (
            <>
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <label className="sr-only" htmlFor="setor-filtro">Filtrar por setor</label>
              <select
                id="setor-filtro"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="h-7 rounded-md border border-border bg-background px-2 text-xs"
              >
                <option value="">Todos os setores</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </>
          )}
        </div>
      </PageHeader>

      <div className="p-4 lg:p-6 space-y-3">
        <p className="text-sm text-muted-foreground">
          {requests.length} {requests.length === 1 ? 'solicitação' : 'solicitações'} · total estimado{' '}
          <span className="font-mono text-foreground">{formatBRLAmount(total)}</span>
        </p>

        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : requests.length === 0 ? (
            <EmptyState
              icon={ShoppingCart}
              title="Nenhuma solicitação de compra"
              description="Quando alguém pedir uma compra pelo chamado do Financeiro, ela aparece aqui."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold border-r border-border">Chamado</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Produto</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Setor</th>
                    <th className="px-3 py-2 font-semibold border-r border-border text-right">Valor</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Situação</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Pedido em</th>
                    <th className="px-3 py-2 font-semibold text-right">Abrir</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map(r => (
                    <tr
                      key={r.id}
                      className="border-b border-border hover:bg-secondary/50 cursor-pointer"
                      onClick={() => navigate(tenantPath(ticketDetailPath('compras', r.ticket_id)))}
                    >
                      <td className="px-3 py-2 font-mono text-xs text-primary font-bold">
                        {r.ticket ? `#${r.ticket.ticket_number}` : '—'}
                      </td>
                      <td className="px-3 py-2 font-medium max-w-[280px] truncate" title={r.product_name}>
                        {r.product_name}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{r.department || '—'}</td>
                      <td className="px-3 py-2 font-mono text-right">
                        {r.estimated_amount != null ? formatBRLAmount(Number(r.estimated_amount)) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <Badge className={PURCHASE_STATUS_BADGE[r.status]}>{PURCHASE_STATUS_LABEL[r.status]}</Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{formatDateBR(r.created_at)}</td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Abrir o chamado desta compra"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(tenantPath(ticketDetailPath('compras', r.ticket_id)));
                          }}
                        >
                          <ExternalLink className="w-4 h-4" aria-hidden="true" />
                          <span className="sr-only">Abrir chamado</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* O MESMO formulário de chamado dos outros módulos, com `module="compras"` —
          e é ele que faz a compra existir: escolhida uma categoria marcada como
          compra, o formulário mostra produto, orçamentos e setor, e grava a
          solicitação junto do chamado. Uma tela de pedido própria seria uma segunda
          verdade sobre o que uma compra precisa. */}
      <Dialog open={pedindo} onOpenChange={setPedindo}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova solicitação de compra</DialogTitle>
          </DialogHeader>
          <CreateTicketForm
            module="compras"
            onCancel={() => setPedindo(false)}
            onSuccess={() => setPedindo(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
