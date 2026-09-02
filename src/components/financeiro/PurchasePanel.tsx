import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, Package, Paperclip, XCircle } from 'lucide-react';
import {
  usePurchaseRequestByTicket, useApprovePurchase, useRejectPurchase, useCompletePurchase,
  useBudgetSettings, useDepartmentBudgets, useDepartmentMonthlySpend, getPurchaseFileUrl,
} from '@/hooks/usePurchases';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL, formatBRLAmount, type PurchaseQuote } from '@/types/purchases';
import { cn } from '@/lib/utils';

interface Props {
  ticketId: string;
  onUpdate?: () => void;
}

export function PurchasePanel({ ticketId, onUpdate }: Props) {
  const { data: request, isLoading } = usePurchaseRequestByTicket(ticketId);
  const { can } = useDepartmentPermissions('financeiro');
  const approve = useApprovePurchase();
  const reject = useRejectPurchase();
  const complete = useCompletePurchase();

  const { data: budgetSettings } = useBudgetSettings();
  const { data: budgets = [] } = useDepartmentBudgets();
  const { data: spend = 0 } = useDepartmentMonthlySpend(request?.department ?? null);

  const [selectedQuote, setSelectedQuote] = useState<PurchaseQuote | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [report, setReport] = useState('');
  const [invoice, setInvoice] = useState<File | null>(null);

  if (isLoading || !request) return null;

  const canApprove = can('purchases', 'approve');
  const canExecute = can('purchases', 'execute') || can('payables', 'settle');

  const limit = budgets.find(b => b.department === request.department)?.monthly_limit ?? 0;
  const quoteAmount = Number(selectedQuote?.amount ?? request.estimated_amount ?? 0);
  const overBudget =
    budgetSettings?.mode === 'per_department' && limit > 0 && spend + quoteAmount > limit;

  const openFile = async (path: string) => {
    const url = await getPurchaseFileUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  const handleApprove = async () => {
    if (!selectedQuote) return;
    await approve.mutateAsync({ request, quote: selectedQuote });
    onUpdate?.();
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    await reject.mutateAsync({ request, reason });
    setRejectOpen(false);
    setReason('');
    onUpdate?.();
  };

  const handleComplete = async () => {
    if (!report.trim()) return;
    await complete.mutateAsync({ request, report, file: invoice });
    setReport('');
    setInvoice(null);
    onUpdate?.();
  };

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Solicitação de compra</h3>
        </div>
        <Badge className={PURCHASE_STATUS_BADGE[request.status]}>{PURCHASE_STATUS_LABEL[request.status]}</Badge>
      </div>

      <div className="grid gap-2 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Produto</span>
          <span className="font-medium text-right">{request.product_name}</span>
        </div>
        {request.product_link && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Link</span>
            <a href={request.product_link} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 truncate max-w-[60%]">
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> abrir
            </a>
          </div>
        )}
        {request.department && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Setor</span>
            <span>{request.department}</span>
          </div>
        )}
      </div>

      {/* Orçamentos */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Orçamentos</p>
        {(request.quotes || []).map(q => {
          const isApproved = request.approved_quote_id === q.id;
          const isSelected = selectedQuote?.id === q.id;
          const selectable = request.status === 'pending_approval' && canApprove;
          return (
            <button
              key={q.id}
              type="button"
              disabled={!selectable}
              onClick={() => setSelectedQuote(isSelected ? null : q)}
              className={cn(
                'w-full flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                isApproved && 'border-primary bg-primary/5',
                isSelected && !isApproved && 'border-primary ring-1 ring-primary/20',
                !isApproved && !isSelected && 'border-border',
                selectable ? 'hover:bg-secondary/60' : 'cursor-default',
              )}
            >
              <span className="flex items-center gap-2 min-w-0">
                {isApproved && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />}
                <span className="truncate">{q.supplier}</span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {q.file_path && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); openFile(q.file_path!); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); openFile(q.file_path!); } }}
                    className="text-muted-foreground hover:text-primary"
                    title="Abrir anexo do orçamento"
                  >
                    <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
                  </span>
                )}
                <span className="font-mono">{formatBRLAmount(Number(q.amount))}</span>
              </span>
            </button>
          );
        })}
        {(request.quotes || []).length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum orçamento registrado.</p>
        )}
      </div>

      {/* Alerta de teto */}
      {overBudget && request.status === 'pending_approval' && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Esta compra ultrapassa o teto mensal do setor {request.department}: já foram {formatBRLAmount(spend)} de{' '}
            {formatBRLAmount(limit)}. A aprovação continua possível, mas exige atenção.
          </span>
        </div>
      )}

      {request.status === 'rejected' && request.rejection_reason && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <p className="font-medium mb-1">Motivo da reprovação</p>
          <p className="text-muted-foreground">{request.rejection_reason}</p>
        </div>
      )}

      {request.status === 'completed' && request.purchase_report && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm space-y-2">
          <p className="font-medium">Laudo de compra</p>
          <p className="text-muted-foreground whitespace-pre-wrap">{request.purchase_report}</p>
          {request.purchase_file_path && (
            <Button variant="outline" size="sm" onClick={() => openFile(request.purchase_file_path!)}>
              <FileText className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Ver nota fiscal
            </Button>
          )}
        </div>
      )}

      {/* Ações de aprovação */}
      {request.status === 'pending_approval' && canApprove && (
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleApprove} disabled={!selectedQuote || approve.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Aprovar orçamento escolhido
          </Button>
          <Button variant="outline" onClick={() => setRejectOpen(true)}>
            <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reprovar compra
          </Button>
        </div>
      )}

      {/* Execução / laudo */}
      {request.status === 'approved' && canExecute && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Registrar laudo de compra</p>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="Descreva a compra realizada: fornecedor, valor final, prazo de entrega e número da nota."
            className="w-full min-h-[100px] rounded-lg border border-border bg-card p-3 text-sm"
          />
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
            <Paperclip className="w-4 h-4" aria-hidden="true" />
            <span>{invoice ? invoice.name : 'Anexar nota fiscal (opcional)'}</span>
            <input type="file" className="hidden" onChange={(e) => setInvoice(e.target.files?.[0] ?? null)} />
          </label>
          <div>
            <Button onClick={handleComplete} disabled={!report.trim() || complete.isPending}>
              Concluir compra e encerrar chamado
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reprovar esta solicitação de compra?</AlertDialogTitle>
            <AlertDialogDescription>
              O motivo será registrado no chamado e ficará visível para quem abriu a solicitação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Motivo da reprovação"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Manter em análise</AlertDialogCancel>
            <AlertDialogAction disabled={!reason.trim()} onClick={handleReject}>
              Reprovar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
