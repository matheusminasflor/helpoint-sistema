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
import { AlertTriangle, CheckCircle2, ExternalLink, FileText, History, MessageSquareWarning, Package, Paperclip, Star, XCircle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  usePurchaseRequestByTicket, useApprovePurchase, useRejectPurchase, useCompletePurchase,
  useBudgetSettings, useDepartmentBudgets, useDepartmentMonthlySpend, getPurchaseFileUrl,
  useRequestAdjustment, useDecisoesDaCompra, type DecisaoDaCompra, useComprasParaPagarJunto, useTrocarFormaDePagamento,
  useRegistrarPagamento,
} from '@/hooks/usePurchases';
import { useAuth } from '@/contexts/AuthContext';
import { useDecideACaixinha } from '@/hooks/useCaixinha';
import { AjusteDaCompra } from './AjusteDaCompra';
import { ReajusteDaCompra } from './ReajusteDaCompra';
import { ComoFuncionaCompras } from './ComoFuncionaCompras';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  PURCHASE_STATUS_BADGE, PURCHASE_STATUS_LABEL, formatBRLAmount, formatQuantidade, totalDoOrcamento, type PurchaseQuote,
  FORMA_PAGAMENTO_LABEL, FILIAIS_DA_COMPRA, rotuloDoPagamento, type FormaPagamento, type FilialDaCompra,
} from '@/types/purchases';
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
  const decideCaixinha = useDecideACaixinha(request?.caixinha_id);

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
  // Quantas aprovar (dono, 2026-10-09: "ele decide quantas aprovar", menos ou mais). Vazio = o que foi pedido.
  const [qtdAprovar, setQtdAprovar] = useState('');
  // Obrigatórias em toda aprovação (dono, 2026-10-14).
  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | null>(null);
  const [filial, setFilial] = useState<FilialDaCompra | null>(null);
  // Cartão: à vista (1) ou em quantas vezes (dono, 2026-10-14). Vazio = ainda não disse.
  const [parcelas, setParcelas] = useState<string>('');
  // A 2ª forma, obrigatória (dono, 2026-10-15), e a troca para ela depois de aprovada.
  const [formaPagamento2, setFormaPagamento2] = useState<FormaPagamento | null>(null);
  const [parcelas2, setParcelas2] = useState<string>('');
  const [trocaOpen, setTrocaOpen] = useState(false);
  const [trocaMotivo, setTrocaMotivo] = useState('');
  const trocar = useTrocarFormaDePagamento();
  // Pagar junto (dono, 2026-10-15): as outras compras aprovadas do mesmo fornecedor no mesmo pagamento.
  const { data: paraJuntar = [] } = useComprasParaPagarJunto(request);
  const [juntas, setJuntas] = useState<string[]>([]);
  // Pagar primeiro (o boleto ou o comprovante) e, na chegada, a nota ou o recibo com o motivo (2026-10-15).
  const pagar = useRegistrarPagamento();
  const [comprovante, setComprovante] = useState<File | null>(null);
  const [semNota, setSemNota] = useState(false);
  const [semNotaMotivo, setSemNotaMotivo] = useState('');

  if (isLoading || !request) return null;

  const pedida = Number(request.quantidade ?? 1);
  const qtdEscolhida = qtdAprovar.trim() ? Number(qtdAprovar.replace(',', '.')) : pedida;
  // Orçamento de antes de 2026-10-09 só tem o total: o unitário sai dele, como no banco.
  const unitario = (q: PurchaseQuote) => Number(q.valor_unitario ?? (Number(q.amount) - Number(q.frete ?? 0)) / pedida);
  const totalAprovado = selectedQuote && qtdEscolhida > 0
    ? totalDoOrcamento(unitario(selectedQuote), qtdEscolhida, Number(selectedQuote.frete ?? 0)) : null;

  // A Caixinha (2026-10-14) é decidida e comprada pelo aprovador dela (e pelo administrador), e dispensa
  // forma de pagamento, filial, três orçamentos e teto — é o dinheiro do caixa (`pode_decidir_compra`).
  const caixinha = !!request.caixinha;
  const canApprove = caixinha ? decideCaixinha : can('solicitacoes', 'approve');
  // Quem baixa pagamento no Financeiro também executa compra, e isso continua de
  // propósito: executar é registrar que a compra saiu e gerar a conta a pagar — quem
  // já mexe no dinheiro faz isso por tabela.
  const canExecute = can('solicitacoes', 'execute') || canFin('payables', 'settle') || (caixinha && decideCaixinha);

  const limit = budgets.find(b => b.department === request.department)?.monthly_limit ?? 0;
  const quoteAmount = Number(totalAprovado ?? request.estimated_amount ?? 0);
  const overBudget = !caixinha &&
    budgetSettings?.mode === 'per_department' && limit > 0 && spend + quoteAmount > limit;

  const openFile = async (path: string) => {
    const url = await getPurchaseFileUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
  };

  // Menos de três orçamentos exige motivo escrito — a regra vive no banco
  // (trigger `fin_compra_exige_tres_orcamentos`). Perguntar aqui é o que impede
  // quem aprova receber um erro do Postgres em vez de uma frase.
  const poucosOrcamentos = !caixinha && (request.quotes || []).length < 3;
  const nParcelas = Number(parcelas);
  // A 2ª forma só é obrigatória quando a 1ª pode falhar na hora — cartão ou boleto (etapa 4 · Compras, 2026-10-24;
  // até aqui era sempre). Com Pix ou Caixinha ela é opcional; dada, tem de ser diferente da 1ª.
  const pedeSegunda = formaPagamento === 'cartao' || formaPagamento === 'boleto';
  const faltaPagamento = !caixinha && (
    !formaPagamento || !filial || !parcelasValidas(formaPagamento, parcelas)
    || (pedeSegunda && !formaPagamento2)
    || (!!formaPagamento2 && (formaPagamento2 === formaPagamento || !parcelasValidas(formaPagamento2, parcelas2))));

  const handleApprove = async () => {
    if (!selectedQuote || !(qtdEscolhida > 0) || faltaPagamento) return;
    await approve.mutateAsync({
      request,
      quote: selectedQuote,
      quantidade: qtdEscolhida,
      formaPagamento,
      parcelas: formaPagamento === 'cartao' ? nParcelas : null,
      formaPagamento2,
      parcelas2: formaPagamento2 === 'cartao' ? Number(parcelas2) : null,
      filial,
      fewQuotesReason: poucosMotivo,
      overBudgetReason: tetoMotivo,
      approvalNotes: obsAprovacao,
    });
    setPoucosMotivo('');
    setTetoMotivo('');
    setObsAprovacao('');
    setQtdAprovar('');
    setFormaPagamento(null);
    setFilial(null);
    setParcelas('');
    setFormaPagamento2(null);
    setParcelas2('');
    onUpdate?.();
  };

  const handleTroca = async () => {
    if (!trocaMotivo.trim()) return;
    await trocar.mutateAsync({ request, motivo: trocaMotivo });
    setTrocaOpen(false);
    setTrocaMotivo('');
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

  // Pagar primeiro, nota depois (dono, 2026-10-15; 20270121010000).
  const paga = !!request.pagamento_em;
  const boleto = request.forma_pagamento === 'boleto';
  const boletoEmAberto = paga && boleto && !request.boleto_pago_em;
  const pelaCaixinha = caixinha || request.forma_pagamento === 'caixinha';
  const botaoDePagar = pelaCaixinha ? 'Paguei pela Caixinha'
    : request.forma_pagamento === 'cartao' ? 'Comprei no cartão'
    : request.forma_pagamento === 'pix' ? 'Paguei no Pix'
    : boleto ? 'Enviar o boleto ao Financeiro' : null;
  const handlePagar = async () => {
    if (boleto && (!comprovante || !vencimento)) return;
    await pagar.mutateAsync({
      request, file: comprovante, vencimento: boleto ? vencimento : null,
      juntas: pelaCaixinha ? [] : paraJuntar.filter((j) => juntas.includes(j.id)),
    });
    setJuntas([]);
    setComprovante(null);
    setVencimento('');
    onUpdate?.();
  };
  const handleComplete = async () => {
    if (!report.trim() || !invoice || (semNota && !semNotaMotivo.trim())) return;
    await complete.mutateAsync({ request, report, file: invoice, semNotaMotivo: semNota ? semNotaMotivo : null });
    setReport('');
    setInvoice(null);
    setSemNota(false);
    setSemNotaMotivo('');
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
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Quantidade</span>
          <span>
            {formatQuantidade(pedida)} pedida{pedida === 1 ? '' : 's'}
            {request.quantidade_aprovada != null && ` · ${formatQuantidade(Number(request.quantidade_aprovada))} aprovada${Number(request.quantidade_aprovada) === 1 ? '' : 's'}`}
          </span>
        </div>
        {request.quantidade_aprovada != null && request.estimated_amount != null && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Total aprovado</span>
            <span className="font-mono font-medium">{formatBRLAmount(Number(request.estimated_amount))}</span>
          </div>
        )}
        {request.forma_pagamento && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Pagamento · filial</span>
            <span>{rotuloDoPagamento(request.forma_pagamento, request.parcelas)} · {request.filial}</span>
          </div>
        )}
        {request.forma_pagamento_2 && (
          <div className="flex justify-between gap-4 items-center">
            <span className="text-muted-foreground">2ª opção</span>
            <span className="inline-flex items-center gap-2">
              {rotuloDoPagamento(request.forma_pagamento_2, request.parcelas_2)}
              {request.status === 'approved' && canExecute && !request.pago_junto_com && !request.boleto_pago_em && (
                <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => setTrocaOpen(true)}>
                  Usar a 2ª opção
                </Button>
              )}
            </span>
          </div>
        )}
        {request.pagamento_path && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{request.forma_pagamento === 'boleto' ? 'Boleto' : 'Comprovante'}</span>
            <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => openFile(request.pagamento_path!)}>
              <Paperclip className="w-3.5 h-3.5 mr-1" aria-hidden="true" />abrir
            </Button>
          </div>
        )}
        {request.troca_motivo && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Por que trocou</span>
            <span className="text-right">{request.troca_motivo}</span>
          </div>
        )}
        {request.pago_junto_com && (
          <p className="text-xs rounded-md bg-muted/50 px-2 py-1 text-muted-foreground">
            Paga no mesmo pagamento de outra compra: a conta a pagar está na compra principal, com a soma.
          </p>
        )}
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
          const recomendado = request.orcamento_recomendado_id === q.id;
          const selectable = request.status === 'pending_approval' && canApprove;
          return (
            <button
              key={q.id}
              type="button"
              // `aria-disabled`, não `disabled`: botão desativado engole o clique de tudo dentro dele, e o link do
              // orçamento aprovado parava de abrir (dono, 2026-10-14).
              aria-disabled={!selectable}
              onClick={() => { if (selectable) setSelectedQuote(isSelected ? null : q); }}
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
                  <span className="flex items-center gap-1.5">
                    <span className="truncate">{q.supplier}</span>
                    {recomendado && (
                      <Badge variant="outline" className="shrink-0 gap-1 border-primary/40 text-primary">
                        <Star className="w-3 h-3" aria-hidden="true" /> Recomendado
                      </Badge>
                    )}
                  </span>
                  {/* Unitário × quantidade, frete e prazo (dono, 2026-10-09). */}
                  <span className="block text-[12px] text-muted-foreground">
                    {formatBRLAmount(unitario(q))} × {formatQuantidade(pedida)}
                    {' · '}{Number(q.frete ?? 0) > 0 ? `frete ${formatBRLAmount(Number(q.frete))}` : 'frete grátis'}
                    {q.prazo_entrega_dias != null && ` · entrega em ${q.prazo_entrega_dias} dia${q.prazo_entrega_dias === 1 ? '' : 's'}`}
                  </span>
                  {/* A justificativa de cada orçamento (frete, prazo, por que este fornecedor). */}
                  {q.notes && <span className="block text-[12px] text-muted-foreground truncate" title={q.notes}>{q.notes}</span>}
                </span>
              </span>
              <span className="flex items-center gap-3 shrink-0">
                {/* O link de compra de cada orçamento (dono, 2026-10-09). `span` e não `a`: o cartão inteiro já é um botão. */}
                {q.link && (
                  <span
                    role="link"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); window.open(q.link!, '_blank', 'noopener,noreferrer'); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); window.open(q.link!, '_blank', 'noopener,noreferrer'); } }}
                    className="inline-flex items-center gap-1 text-primary hover:underline text-[13px]"
                    title={q.link}
                  >
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" /> link
                  </span>
                )}
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
        {request.orcamento_recomendado_id && request.motivo_recomendacao && (
          <p className="text-[13px] text-muted-foreground">
            <span className="font-medium text-foreground">Por que quem pediu recomenda:</span> {request.motivo_recomendacao}
          </p>
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
              <Label htmlFor="teto-motivo" className="text-[14px]">Por que aprovar acima do teto? *</Label>
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
          <Label htmlFor="poucos-motivo" className="text-[14px]">
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
          <p className="text-[12px] text-muted-foreground">
            Fica registrado na solicitação. Aprovar com menos de três orçamentos é possível — o que
            não pode é passar despercebido.
          </p>
        </div>
      )}
      {request.status === 'pending_approval' && canApprove && (
        <div className="space-y-2">
          {selectedQuote && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3 text-sm">
              <Label htmlFor="qtd-aprovar" className="text-[14px]">Quantas aprovar</Label>
              <Input id="qtd-aprovar" inputMode="decimal" className="w-24 font-mono" placeholder={formatQuantidade(pedida)}
                value={qtdAprovar} onChange={(e) => setQtdAprovar(e.target.value)} />
              <span className="text-muted-foreground">de {formatQuantidade(pedida)} pedida{pedida === 1 ? '' : 's'}</span>
              <span className="ml-auto font-medium">
                Total: <span className="font-mono">{totalAprovado != null ? formatBRLAmount(totalAprovado) : '—'}</span>
              </span>
            </div>
          )}
          {caixinha ? (
            <p className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              Compra da <b className="text-foreground">Caixinha</b>: o dinheiro sai do caixa. Depois de aprovar, quem aprova compra e anexa o recibo.
            </p>
          ) : (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <FormaEParcelas titulo="Forma de pagamento *" forma={formaPagamento} setForma={setFormaPagamento}
              parcelas={parcelas} setParcelas={setParcelas} />
            {/* A 2ª forma: obrigatória com cartão ou boleto, diferente da 1ª. */}
            <FormaEParcelas titulo={pedeSegunda ? '2ª opção *' : '2ª opção (opcional)'} forma={formaPagamento2} setForma={setFormaPagamento2}
              parcelas={parcelas2} setParcelas={setParcelas2} sem={formaPagamento} />
            <p className="text-xs text-muted-foreground">
              A 2ª opção é o plano B: se a 1ª não der certo na hora de comprar (o boleto não sai, o cartão recusa, o
              fornecedor não aceita Pix), quem compra troca para ela sem precisar voltar para você — e você é avisado.
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="Filial">
              <p className="w-40 shrink-0 whitespace-nowrap text-[14px] font-medium">Filial *</p>
              <div className="flex flex-wrap gap-2">
                {FILIAIS_DA_COMPRA.map((f) => (
                  <Button key={f} type="button" size="sm" variant={filial === f ? 'default' : 'outline'}
                    aria-pressed={filial === f} onClick={() => setFilial(f)}>
                    {f}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="obs-aprovacao" className="text-[14px]">Observação <span className="font-normal text-muted-foreground">(opcional, fica no registro)</span></Label>
            <Textarea id="obs-aprovacao" rows={2} value={obsAprovacao} onChange={(e) => setObsAprovacao(e.target.value)}
              placeholder="Ex.: pode fechar com este, negociar a entrega para a semana que vem." />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={handleApprove}
              disabled={
                !selectedQuote || !(qtdEscolhida > 0) || faltaPagamento || approve.isPending
                || (poucosOrcamentos && !poucosMotivo.trim())
                || (overBudget && !tetoMotivo.trim())
              }
            >
              <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
              {!selectedQuote ? 'Escolha um orçamento para aprovar'
                : faltaPagamento ? 'Escolha a forma de pagamento e a filial'
                : 'Aprovar orçamento escolhido'}
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

      {/* Reajuste depois de aprovada (dono, 2026-10-19). O banco recusa o que já foi pago; aqui só não oferece. */}
      {(request.status === 'approved' || request.status === 'completed') && (
        <ReajusteDaCompra request={request}
          quote={(request.quotes || []).find(q => q.id === request.approved_quote_id)}
          podeReajustar={canExecute && !request.pago_junto_com && !request.boleto_pago_em
            && !(paga && (request.forma_pagamento === 'pix' || request.forma_pagamento === 'caixinha' || caixinha))}
          podeDecidir={canApprove} />
      )}

      {/* Depois de aprovada (dono, 2026-10-15; 20270121010000): PAGAR — a conta nasce aqui — e só depois, quando a
          nota chega, registrar e encerrar. Compras não tem prazo. */}
      {request.status === 'approved' && canExecute && !paga && (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">1. Comprar e pagar</p>
          {!botaoDePagar ? (
            <p className="text-sm text-status-danger">Esta compra não tem forma de pagamento: peça a quem aprova.</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                {pelaCaixinha ? 'O valor sai do caixa e vira saída da Caixinha (o recibo é opcional).'
                  : request.forma_pagamento === 'cartao' ? `${rotuloDoPagamento('cartao', request.parcelas)}: a conta entra na fatura do cartão, no Financeiro.`
                  : request.forma_pagamento === 'pix' ? 'A conta entra já paga no Financeiro.'
                  : 'A conta entra em aberto em Contas a Pagar e o Financeiro é avisado. Quando ele pagar, você é avisado para anexar a nota.'}
                {' '}A nota fiscal vem depois, quando chegar.
              </p>
              {boleto && (
                <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-center">
                  <Label htmlFor="boleto-vencimento" className="text-[14px]">Vencimento do boleto *</Label>
                  <input id="boleto-vencimento" type="date" value={vencimento} min={todayISO()}
                    onChange={(e) => setVencimento(e.target.value)}
                    className="w-fit rounded-lg border border-border bg-card px-3 py-2 text-sm" />
                </div>
              )}
              <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                <Paperclip className="w-4 h-4" aria-hidden="true" />
                <span className={cn(!comprovante && 'text-primary underline')}>
                  {comprovante ? comprovante.name : boleto ? 'Anexar o boleto *' : 'Anexar o comprovante (opcional)'}
                </span>
                <input type="file" className="hidden" onChange={(e) => setComprovante(e.target.files?.[0] ?? null)} />
              </label>
              {/* Juntar (dono, 2026-10-15): as compras que ele quiser, em qualquer forma — uma conta só, com a soma. */}
              {!pelaCaixinha && paraJuntar.length > 0 && (
                <fieldset className="rounded-lg border border-border p-3 space-y-1.5">
                  <legend className="px-1 text-[14px] font-medium">Pagou outras compras junto?</legend>
                  <p className="text-xs text-muted-foreground">
                    Marque as compras aprovadas que estão no MESMO pagamento (o mesmo boleto, a mesma compra no cartão).
                    Vira uma conta só no Financeiro, com a soma, e elas passam a ser pagas do mesmo jeito que esta.
                  </p>
                  {paraJuntar.map((j) => (
                    <label key={j.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="checkbox" checked={juntas.includes(j.id)}
                        onChange={(e) => setJuntas((s) => e.target.checked ? [...s, j.id] : s.filter((x) => x !== j.id))} />
                      <span className="font-mono text-xs text-muted-foreground">#{j.ticket_number}</span>
                      <span className="truncate">{j.product_name}</span>
                      <span className="text-xs text-muted-foreground truncate">{j.fornecedor ?? ''}</span>
                      {j.valor != null && <span className="ml-auto font-mono text-xs">{formatBRLAmount(j.valor)}</span>}
                    </label>
                  ))}
                </fieldset>
              )}
              <div>
                <Button onClick={handlePagar} disabled={pagar.isPending || (boleto && (!comprovante || !vencimento))}>
                  {botaoDePagar}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {request.status === 'approved' && boletoEmAberto && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">Boleto no Financeiro</p>
          <p className="text-sm text-muted-foreground">
            Enviado em {formatDateBR(request.pagamento_em ?? null)}
            {request.payment_due_date ? `, vence em ${formatDateBR(request.payment_due_date)}` : ''}. Quando o Financeiro pagar,
            {' '}{canExecute ? 'você é avisado' : 'quem compra é avisado'} para anexar a nota e encerrar.
          </p>
        </div>
      )}

      {request.status === 'approved' && canExecute && paga && !boletoEmAberto && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-sm font-medium">2. A nota chegou: registrar e encerrar</p>
          <p className="text-xs text-muted-foreground">
            Paga em {formatDateBR(request.pagamento_em ?? null)}. Anexe a nota desta compra para encerrar o pedido; quem pediu é
            avisado e, se o item é suprimento, a quantidade entra no Estoque.
          </p>
          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="O que chegou: fornecedor, valor final, número da nota."
            className="w-full min-h-[80px] rounded-lg border border-border bg-card p-3 text-sm"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={semNota} onChange={(e) => setSemNota(e.target.checked)} />
            Não veio nota fiscal (vou anexar o recibo ou o comprovante)
          </label>
          {semNota && (
            <Input value={semNotaMotivo} onChange={(e) => setSemNotaMotivo(e.target.value)}
              placeholder="Por que não veio nota? Ex.: vendedor pessoa física" aria-label="Por que não veio nota" />
          )}
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
            <Paperclip className="w-4 h-4" aria-hidden="true" />
            <span className={cn(!invoice && 'text-primary underline')}>
              {invoice ? invoice.name : semNota ? 'Anexar o recibo *' : 'Anexar a nota fiscal *'}
            </span>
            <input type="file" className="hidden" onChange={(e) => setInvoice(e.target.files?.[0] ?? null)} />
          </label>
          <div>
            <Button onClick={handleComplete}
              disabled={!report.trim() || !invoice || (semNota && !semNotaMotivo.trim()) || complete.isPending}>
              Registrar e encerrar
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={trocaOpen} onOpenChange={setTrocaOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Usar a 2ª opção de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              {request.forma_pagamento && request.forma_pagamento_2 && (
                <>Passa de {rotuloDoPagamento(request.forma_pagamento, request.parcelas)} para{' '}
                {rotuloDoPagamento(request.forma_pagamento_2, request.parcelas_2)}. Quem aprovou é avisado, e o motivo fica no chamado.</>
              )}
              {paga && <> Como já foi paga, a conta no Financeiro é refeita na forma nova, as compras pagas junto se separam (cada uma com a sua conta) e,
                se era boleto, o Financeiro é avisado para não pagar.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea rows={3} value={trocaMotivo} onChange={(e) => setTrocaMotivo(e.target.value)}
            placeholder="Por que a 1ª não deu certo? Ex.: o fornecedor não gerou o boleto." />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={!trocaMotivo.trim() || trocar.isPending}
              onClick={(e) => { e.preventDefault(); void handleTroca(); }}>
              Trocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
/** Uma forma de pagamento e, no cartão, à vista ou em quantas vezes. `sem`: a forma que não pode repetir. */
function FormaEParcelas({ titulo, forma, setForma, parcelas, setParcelas, sem }: {
  titulo: string;
  forma: FormaPagamento | null;
  setForma: (f: FormaPagamento) => void;
  parcelas: string;
  setParcelas: (p: string) => void;
  sem?: FormaPagamento | null;
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label={titulo}>
        <p className="w-40 shrink-0 whitespace-nowrap text-[14px] font-medium">{titulo}</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(FORMA_PAGAMENTO_LABEL) as FormaPagamento[]).filter((f) => f !== sem).map((f) => (
            <Button key={f} type="button" size="sm" variant={forma === f ? 'default' : 'outline'}
              aria-pressed={forma === f} onClick={() => setForma(f)}>
              {FORMA_PAGAMENTO_LABEL[f]}
            </Button>
          ))}
        </div>
      </div>
      {forma === 'cartao' && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label={`${titulo}: cartão à vista ou parcelado`}>
          <p className="w-40 shrink-0 whitespace-nowrap text-[14px] font-medium">No cartão *</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant={parcelas === '1' ? 'default' : 'outline'}
              aria-pressed={parcelas === '1'} onClick={() => setParcelas('1')}>À vista</Button>
            <Button type="button" size="sm" variant={parcelas !== '' && parcelas !== '1' ? 'default' : 'outline'}
              aria-pressed={parcelas !== '' && parcelas !== '1'} onClick={() => setParcelas('2')}>Parcelado</Button>
            {parcelas !== '' && parcelas !== '1' && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                em
                <Input aria-label="Quantas vezes" inputMode="numeric" className="h-8 w-16 font-mono" value={parcelas}
                  onChange={(e) => setParcelas(e.target.value.replace(/\D/g, ''))} />
                vezes (até 24)
              </span>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const parcelasValidas = (forma: FormaPagamento | null, parcelas: string) => {
  const n = Number(parcelas);
  return forma !== 'cartao' || (Number.isInteger(n) && n >= 1 && n <= 24);
};

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
            {d.observacao && <p className="text-[14px] text-muted-foreground whitespace-pre-wrap">{d.observacao}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
