import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, History, MessageSquareWarning, Package, Paperclip, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  usePurchaseRequestByTicket, useApprovePurchase, useRejectPurchase, useCompletePurchase,
  useBudgetSettings, useDepartmentBudgets, useDepartmentMonthlySpend, getPurchaseFileUrl,
  useRequestAdjustment, useDecisoesDaCompra, type DecisaoDaCompra,
} from '@/hooks/usePurchases';
import { useAuth } from '@/contexts/AuthContext';
import { AjusteDaCompra } from './AjusteDaCompra';
import { ComoFuncionaCompras } from './ComoFuncionaCompras';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL, formatBRLAmount, type PurchaseQuote } from '@/types/purchases';
import { formatDateBR } from '@/types/financeiro';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO } from '@/lib/dates';
import { cn } from '@/lib/utils';

interface Props {
  ticketId: string;
  onUpdate?: () => void;
}

export function PurchasePanel({ ticketId, onUpdate }: Props) {
  const { data: request, isLoading } = usePurchaseRequestByTicket(ticketId);
  // Compras virou departamento próprio na leva N; aprovar e executar são dele.
  // `payables:settle` continua do Financeiro — ver `canExecute` abaixo.
  const { can } = useDepartmentPermissions('compras');
  const { can: canFin } = useDepartmentPermissions('financeiro');
  const approve = useApprovePurchase();
  const reject = useRejectPurchase();
  const complete = useCompletePurchase();
  const pedirAjuste = useRequestAdjustment();
  const { user } = useAuth();
  const { data: decisoes = [] } = useDecisoesDaCompra(request?.id);

  const { data: budgetSettings } = useBudgetSettings();
  const { data: budgets = [] } = useDepartmentBudgets();
  const { data: spend = 0 } = useDepartmentMonthlySpend(request?.department ?? null);

  const [selectedQuote, setSelectedQuote] = useState<PurchaseQuote | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [report, setReport] = useState('');
  const [poucosMotivo, setPoucosMotivo] = useState('');
  const [tetoMotivo, setTetoMotivo] = useState('');
  const [obsAprovacao, setObsAprovacao] = useState('');
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteMotivo, setAjusteMotivo] = useState('');
  const [invoice, setInvoice] = useState<File | null>(null);
  // Vazio = à vista. O `<input type="date">` é a plataforma resolvendo calendário,
  // validação e teclado do celular — não entra biblioteca de data para isto.
  const [vencimento, setVencimento] = useState('');

  if (isLoading || !request) return null;

  const canApprove = can('solicitacoes', 'approve');
  // Quem baixa pagamento no Financeiro também executa compra, e isso continua de
  // propósito: executar é registrar que a compra saiu e gerar a conta a pagar — quem
  // já mexe no dinheiro faz isso por tabela.
  const canExecute = can('solicitacoes', 'execute') || canFin('payables', 'settle');

  const limit = budgets.find(b => b.department === request.department)?.monthly_limit ?? 0;
  const quoteAmount = Number(selectedQuote?.amount ?? request.estimated_amount ?? 0);
  const overBudget =
    budgetSettings?.mode === 'per_department' && limit > 0 && spend + quoteAmount > limit;

  const openFile = async (path: string) => {
    const url = await getPurchaseFileUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  // Menos de três orçamentos exige motivo escrito — a regra vive no banco
  // (trigger `fin_compra_exige_tres_orcamentos`). Perguntar aqui é o que impede
  // quem aprova receber um erro do Postgres em vez de uma frase.
  const poucosOrcamentos = (request.quotes || []).length < 3;

  const handleApprove = async () => {
    if (!selectedQuote) return;
    await approve.mutateAsync({
      request,
      quote: selectedQuote,
      fewQuotesReason: poucosMotivo,
      overBudgetReason: tetoMotivo,
      approvalNotes: obsAprovacao,
    });
    setPoucosMotivo('');
    setTetoMotivo('');
    setObsAprovacao('');
    onUpdate?.();
  };

  const handleAjuste = async () => {
    if (!ajusteMotivo.trim()) return;
    await pedirAjuste.mutateAsync({ request, reason: ajusteMotivo });
    setAjusteOpen(false);
    setAjusteMotivo('');
    onUpdate?.();
  };

  const souQuemPediu = !!user?.id && request.created_by === user.id;

  const handleReject = async () => {
    if (!reason.trim()) return;
    await reject.mutateAsync({ request, reason });
    setRejectOpen(false);
    setReason('');
    onUpdate?.();
  };

  const handleComplete = async () => {
    if (!report.trim()) return;
    await complete.mutateAsync({ request, report, file: invoice, dueDate: vencimento || null });
    setReport('');
    setInvoice(null);
    setVencimento('');
    onUpdate?.();
  };

  return (
    <Card className="p-4 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" aria-hidden="true" />
          <h3 className="text-sm font-semibold">Solicitação de compra</h3>
        </div>
        <div className="flex items-center gap-2">
          <ComoFuncionaCompras para={canApprove ? 'quem-aprova' : 'quem-pede'} />
          <Badge className={PURCHASE_STATUS_BADGE[request.status]}>{PURCHASE_STATUS_LABEL[request.status]}</Badge>
        </div>
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
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Setor que paga</span>
          {/* "Sem setor" aparece de propósito: é a verdade sobre a compra, e é
              ela que explica por que esta despesa não entra em teto nenhum nem
              tem centro de custo. Esconder a linha esconderia o problema. */}
          <span className={cn(!request.department && 'text-muted-foreground italic')}>
            {rotuloDoSetor(request.department)}
          </span>
        </div>
        {request.payment_due_date && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Vencimento informado</span>
            <span>{formatDateBR(request.payment_due_date)}</span>
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
                <span className="min-w-0">
                  <span className="block truncate">{q.supplier}</span>
                  {/* A justificativa de cada orçamento (frete, prazo, por que este fornecedor). */}
                  {q.notes && <span className="block text-[11px] text-muted-foreground truncate" title={q.notes}>{q.notes}</span>}
                </span>
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

      {/* Teto estourado: barra, e libera com motivo escrito (leva I).
          A regra vive no trigger `fin_compra_respeita_teto`. Perguntar aqui é o
          que impede quem aprova receber um erro cru do Postgres em vez de uma
          frase — mesma razão do motivo dos três orçamentos. */}
      {overBudget && request.status === 'pending_approval' && (
        <div className="space-y-2 rounded-lg border border-border badge-warning p-3 text-sm text-status-warning">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              Esta compra passa o teto mensal do setor {rotuloDoSetor(request.department)}: o teto é{' '}
              {formatBRLAmount(limit)} e já foram aprovados {formatBRLAmount(spend)} no mês. Para aprovar,
              escreva o motivo — ele fica guardado na compra.
            </span>
          </div>
          {canApprove && (
            <>
              <Label htmlFor="teto-motivo" className="text-[13px]">Por que aprovar acima do teto? *</Label>
              <Textarea
                id="teto-motivo"
                value={tetoMotivo}
                onChange={(e) => setTetoMotivo(e.target.value)}
                placeholder="Ex.: equipamento quebrou e a produção está parada; o teto do mês que vem absorve."
                rows={2}
                className="bg-background text-foreground"
              />
            </>
          )}
        </div>
      )}

      {/* O motivo só existe enquanto a aprovação que ele explica existe: o banco
          o apaga ao reprovar, ao voltar para análise e ao aprovar com três
          orçamentos. Por isso a condição não conta os orçamentos de agora —
          acrescentar um terceiro depois de aprovada não apaga o porquê daquela
          decisão, e escondê-lo aqui deixaria a compra sem explicação nenhuma. */}
      {request.few_quotes_reason && request.status !== 'pending_approval' && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <p className="font-medium mb-1">Aprovada com menos de três orçamentos</p>
          <p className="text-muted-foreground">{request.few_quotes_reason}</p>
        </div>
      )}

      {request.over_budget_reason && request.status !== 'pending_approval' && (
        <div className="rounded-lg border border-border bg-secondary/40 p-3 text-sm">
          <p className="font-medium mb-1">Aprovada acima do teto do setor</p>
          <p className="text-muted-foreground">{request.over_budget_reason}</p>
        </div>
      )}

      {/* Ajuste pedido: o porquê para todos; o editor só para quem pediu a compra. */}
      {request.status === 'adjustment_requested' && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border badge-warning p-3 text-sm text-status-warning">
            <p className="font-medium mb-1 flex items-center gap-1.5">
              <MessageSquareWarning className="w-4 h-4" aria-hidden="true" /> Ajuste pedido
            </p>
            <p>{request.adjustment_reason}</p>
          </div>
          {souQuemPediu
            ? <AjusteDaCompra request={request} onDone={onUpdate} />
            : <p className="text-xs text-muted-foreground">Aguardando quem pediu corrigir os orçamentos e reenviar.</p>}
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
      {request.status === 'pending_approval' && canApprove && poucosOrcamentos && (
        <div className="space-y-1.5 rounded-lg border border-border p-3">
          <Label htmlFor="poucos-motivo" className="text-[13px]">
            Esta compra tem {(request.quotes || []).length} orçamento
            {(request.quotes || []).length === 1 ? '' : 's'}. Por que menos de três? *
          </Label>
          <Textarea
            id="poucos-motivo"
            rows={2}
            value={poucosMotivo}
            onChange={(e) => setPoucosMotivo(e.target.value)}
            placeholder="Fornecedor exclusivo, urgência, valor abaixo do que compensa cotar…"
          />
          <p className="text-[11px] text-muted-foreground">
            Fica registrado na solicitação. Aprovar com menos de três orçamentos é possível — o que
            não pode é passar despercebido.
          </p>
        </div>
      )}
      {request.status === 'pending_approval' && canApprove && (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label htmlFor="obs-aprovacao" className="text-[13px]">Observação <span className="font-normal text-muted-foreground">(opcional, fica no registro)</span></Label>
            <Textarea id="obs-aprovacao" rows={2} value={obsAprovacao} onChange={(e) => setObsAprovacao(e.target.value)}
              placeholder="Ex.: pode fechar com este, negociar a entrega para a semana que vem." />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleApprove}
              disabled={
                !selectedQuote || approve.isPending
                || (poucosOrcamentos && !poucosMotivo.trim())
                || (overBudget && !tetoMotivo.trim())
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {selectedQuote ? 'Aprovar orçamento escolhido' : 'Escolha um orçamento para aprovar'}
            </Button>
            <Button variant="outline" onClick={() => setAjusteOpen(true)}>
              <MessageSquareWarning className="w-4 h-4 mr-1.5" aria-hidden="true" /> Solicitar ajustes
            </Button>
            <Button variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Recusar compra
            </Button>
          </div>
        </div>
      )}

      {decisoes.length > 0 && <RegistroDeDecisoes decisoes={decisoes} />}

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
          {/* O prazo de pagamento, que só quem executou a compra sabe. Vazio =
              à vista, e a conta a pagar vence hoje — que era o ÚNICO
              comportamento possível antes da leva I, e fazia toda compra a prazo
              nascer em atraso no dia seguinte. */}
          <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
            <Label htmlFor="compra-vencimento" className="text-[13px]">Vence em</Label>
            <div className="flex flex-wrap items-center gap-2">
              <input
                id="compra-vencimento"
                type="date"
                value={vencimento}
                min="2020-01-01"
                onChange={(e) => setVencimento(e.target.value)}
                className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
              />
              <Button type="button" variant="ghost" size="sm" onClick={() => setVencimento(todayISO())}>
                hoje
              </Button>
              <span className="text-xs text-muted-foreground">
                {vencimento ? 'a conta a pagar vence nesta data' : 'em branco = à vista, vence hoje'}
              </span>
            </div>
          </div>
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
              Recusar compra
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={ajusteOpen} onOpenChange={setAjusteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Solicitar ajustes nesta compra?</AlertDialogTitle>
            <AlertDialogDescription>
              A compra volta para quem pediu, que corrige os orçamentos e reenvia. Diga o que precisa
              mudar — ele recebe o aviso com este texto.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={3} value={ajusteMotivo} onChange={(e) => setAjusteMotivo(e.target.value)}
            placeholder="Ex.: incluir o frete nos orçamentos; trazer mais uma cotação." />
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction disabled={!ajusteMotivo.trim() || pedirAjuste.isPending} onClick={handleAjuste}>
              Solicitar ajustes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

const ROTULO_DA_DECISAO: Record<DecisaoDaCompra['decisao'], string> = {
  aprovada: 'Aprovou',
  recusada: 'Recusou',
  ajuste: 'Pediu ajuste',
  reenviada: 'Reenviou após ajuste',
  concluida: 'Registrou a compra',
};

/** Quem decidiu o quê, quando e com qual observação (`compras_decisoes`, gravado pelo banco). */
function RegistroDeDecisoes({ decisoes }: { decisoes: DecisaoDaCompra[] }) {
  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <History className="w-3.5 h-3.5" aria-hidden="true" /> Registro de decisões
      </p>
      <ul className="space-y-1.5">
        {decisoes.map(d => (
          <li key={d.id} className="text-sm">
            <span className="font-medium">{ROTULO_DA_DECISAO[d.decisao]}</span>
            <span className="text-muted-foreground"> · {d.quem?.full_name || d.quem?.email || 'Sistema'} · {format(parseISO(d.created_at), 'dd/MM/yyyy HH:mm')}</span>
            {d.observacao && <p className="text-[13px] text-muted-foreground whitespace-pre-wrap">{d.observacao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
