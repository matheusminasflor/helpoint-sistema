// Financeiro › Conferência de pedidos (LEVA S, 2026-09-29) — o "painel do Financeiro" do sistema de
// checklist que o dono usava fora do Helpoint (`docs/manual-checklist-pedidos.md`, §8 e §13).
//
// O fluxo, nas palavras do dono: o Financeiro confere conforme o manual; aprovado fica "Em
// negociação" e passa a "Pago" quando o cliente paga, e então se finaliza; recusado volta ao
// Comercial com o motivo, a vendedora refaz e reenvia.
//
// Quem registra cada passo é a pessoa logada — o banco carimba (a lista fixa de atendentes do
// sistema antigo saiu). A situação vem pronta da view; esta tela não recalcula nada.
import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Printer, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useChecklistDoLancamento, useChecklists, useDecidirChecklist, useFinalizarChecklist, useItensDoChecklist,
  useMotivosDeRecusa, useRegistrarPagamento,
  type ChecklistResumo, type StatusDoPagamento,
} from '@/hooks/usePedidosChecklist';
import { IndicadoresDaConferencia } from '@/components/financeiro/IndicadoresDaConferencia';
import { imprimirChecklist } from '@/lib/checklist-pdf';
import { todayISO } from '@/lib/dates';
import { formatBRL, formatDateBR } from '@/types/financeiro';

type Fila = 'analise' | 'recusados' | 'negociacao' | 'pagos' | 'finalizados';

const FILAS: { valor: Fila; rotulo: string; cabe: (c: ChecklistResumo) => boolean }[] = [
  { valor: 'analise', rotulo: 'Em análise', cabe: (c) => c.situacao === 'Em análise' },
  { valor: 'recusados', rotulo: 'Recusados', cabe: (c) => c.situacao === 'Recusado' },
  { valor: 'negociacao', rotulo: 'Em negociação', cabe: (c) => c.situacao === 'Aprovado' && c.pagamento_status !== 'Pago' },
  { valor: 'pagos', rotulo: 'Pagos', cabe: (c) => c.situacao === 'Aprovado' && c.pagamento_status === 'Pago' },
  { valor: 'finalizados', rotulo: 'Finalizados', cabe: (c) => c.situacao === 'Finalizado' },
];

export default function FinConferenciaPedidos() {
  const { data: checklists = [], isLoading } = useChecklists();
  const [fila, setFila] = useState<Fila>('analise');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<ChecklistResumo | null>(null);
  const [visao, setVisao] = useState<'fila' | 'indicadores'>('fila');

  const contagem = useMemo(
    () => Object.fromEntries(FILAS.map((f) => [f.valor, checklists.filter(f.cabe).length])) as Record<Fila, number>,
    [checklists]);
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const cabe = FILAS.find((f) => f.valor === fila)!.cabe;
    return checklists.filter(cabe).filter((c) => !t
      || c.protocolo.toLowerCase().includes(t) || c.cliente_nome.toLowerCase().includes(t)
      || c.cliente_codigo.includes(t) || (c.vendedor_nome ?? '').toLowerCase().includes(t));
  }, [checklists, fila, busca]);

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Conferência de pedidos"
        description="O checklist que a vendedora envia ao fechar o pedido. Confira, aprove ou devolva com o motivo, e acompanhe o pagamento."
        icon={ClipboardCheck}
      />
      <div className="p-4 sm:p-6 space-y-4">
        <Tabs value={visao} onValueChange={(v) => setVisao(v as 'fila' | 'indicadores')}>
          <TabsList>
            <TabsTrigger value="fila">Conferência</TabsTrigger>
            <TabsTrigger value="indicadores">Indicadores</TabsTrigger>
          </TabsList>
        </Tabs>
        {visao === 'indicadores' ? <IndicadoresDaConferencia /> : (<>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={fila} onValueChange={(v) => setFila(v as Fila)}>
            <TabsList className="flex-wrap h-auto">
              {FILAS.map((f) => (
                <TabsTrigger key={f.valor} value={f.valor}>{f.rotulo} ({contagem[f.valor] ?? 0})</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Input className="max-w-xs" placeholder="Protocolo, cliente ou vendedora" value={busca}
            onChange={(e) => setBusca(e.target.value)} aria-label="Buscar checklist" />
        </div>

        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : visiveis.length === 0 ? (
          <Card className="p-6">
            <EmptyState icon={ClipboardCheck} title="Nada nesta fila" description="Quando uma vendedora enviar um checklist, ele aparece em Em análise." />
          </Card>
        ) : (
          <Card className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-2 font-semibold">Protocolo</th>
                  <th className="px-3 py-2 font-semibold">Enviado</th>
                  <th className="px-3 py-2 font-semibold">Cliente</th>
                  <th className="px-3 py-2 font-semibold">Vendedora</th>
                  <th className="px-3 py-2 font-semibold text-right">Pedidos</th>
                  <th className="px-3 py-2 font-semibold text-right">Valor (Venda)</th>
                  <th className="px-3 py-2 font-semibold">Pagamento</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visiveis.map((c) => (
                  <tr key={c.id} className="border-t border-border align-top hover:bg-muted/40">
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {c.protocolo}
                      {c.recusas > 0 && <Badge className="ml-1.5 text-[9px] badge-warning">{c.recusas}× recusado</Badge>}
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">{formatDateBR(c.enviado_em)}</td>
                    <td className="px-3 py-2"><span className="font-medium">{c.cliente_nome}</span> <span className="text-muted-foreground">· {c.cliente_codigo}</span></td>
                    <td className="px-3 py-2">{c.vendedor_nome ?? '—'}</td>
                    <td className="px-3 py-2 text-right">{c.qtd_pedidos}</td>
                    <td className="px-3 py-2 text-right font-mono">{formatBRL(Number(c.valor_total))}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{c.pagamento_status ?? '—'}{c.pagamento_data ? ` · ${formatDateBR(c.pagamento_data)}` : ''}</td>
                    <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={() => setAberto(c)}>Abrir</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        </>)}
      </div>
      <ConferenciaDialog checklist={aberto} onClose={() => setAberto(null)} />
    </div>
  );
}

function ConferenciaDialog({ checklist, onClose }: { checklist: ChecklistResumo | null; onClose: () => void }) {
  // A mesma conta do banco (`ped_pode_decidir`, `ped_pode_registrar_pagamento`): só dono/admin passam direto.
  const { canComoOBanco } = useDepartmentPermissions('financeiro');
  const { data } = useChecklistDoLancamento(checklist?.interacao_id ?? null);
  const { data: itens = [] } = useItensDoChecklist(true);
  const { data: motivos = [] } = useMotivosDeRecusa();
  const decidir = useDecidirChecklist();
  const pagar = useRegistrarPagamento();
  const finalizar = useFinalizarChecklist();
  const [recusando, setRecusando] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [obs, setObs] = useState('');
  const [pagamento, setPagamento] = useState<StatusDoPagamento>('Pago');
  const [dataPagamento, setDataPagamento] = useState(todayISO());

  // A linha da lista pode estar velha (a situação mudou nesta tela): vale a que acabou de chegar.
  const c = data?.resumo ?? checklist;
  const podeDecidir = canComoOBanco('conferencia', 'decidir');
  const podePagar = canComoOBanco('conferencia', 'pagamento');
  const rotuloDoItem = new Map(itens.map((i) => [i.id, i.rotulo]));

  const fechar = () => { setRecusando(false); setEscolhidos([]); setObs(''); onClose(); };
  const aposGravar = () => { setRecusando(false); setEscolhidos([]); setObs(''); };

  if (!c) return null;
  const emAnalise = c.situacao === 'Em análise';
  const aprovadoSemPagar = c.situacao === 'Aprovado' && c.pagamento_status !== 'Pago';
  const pagoSemFinalizar = c.situacao === 'Aprovado' && c.pagamento_status === 'Pago';

  return (
    <Dialog open={!!checklist} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{c.protocolo} · {c.situacao}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-[13px]">
          <div className="grid gap-2 sm:grid-cols-2">
            <p><span className="text-muted-foreground">Cliente:</span> <strong>{c.cliente_nome}</strong> ({c.cliente_codigo})</p>
            <p><span className="text-muted-foreground">Tabela:</span> {c.tabela_preco ?? '—'}</p>
            <p><span className="text-muted-foreground">Vendedora:</span> {c.vendedor_nome ?? '—'}</p>
            <p><span className="text-muted-foreground">Contato:</span> {c.contato}{c.rota ? ` · ${c.rota}` : ''}</p>
            <p><span className="text-muted-foreground">Enviado:</span> {formatDateBR(c.enviado_em)}{c.versao > 1 ? ` (tentativa ${c.versao})` : ''}</p>
            <p><span className="text-muted-foreground">Pagamento:</span> {c.pagamento_status ?? 'Aguardando aprovação'}</p>
          </div>
          {c.observacao && <p className="rounded-md bg-muted/60 px-3 py-2"><strong>Recado da vendedora:</strong> {c.observacao}</p>}

          {(data?.pedidos ?? []).map((p) => (
            <div key={p.id} className="rounded-lg border border-border p-3 space-y-2">
              <p className="font-semibold">
                Pedido {p.ordem}: {p.tipo} · {p.filial} · nº {p.numero} · {formatBRL(Number(p.valor))}
                {Number(p.desconto) > 0 && <span className="font-normal text-muted-foreground"> (desconto {formatBRL(Number(p.desconto))})</span>}
              </p>
              {p.importado_em && (
                <p className="text-[12px] text-muted-foreground">
                  Espelho: total {formatBRL(Number(p.espelho_total ?? 0))} · ST {formatBRL(Number(p.espelho_st ?? 0))}
                  {p.qtd_coloracao != null && ` · ${p.qtd_coloracao} coloração · ${p.qtd_tonalizante ?? 0} tonalizante`}
                </p>
              )}
              <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2 text-[12px]">
                {p.ped_respostas.map((r) => (
                  <li key={r.item_id}>
                    <span className="text-muted-foreground">{rotuloDoItem.get(r.item_id) ?? 'Item'}:</span> {r.resposta}
                    {r.justificativa && <span className="text-muted-foreground"> — {r.justificativa}</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {c.historico_recusas.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold">Recusas anteriores</p>
              <ul className="text-[12px] space-y-0.5">
                {c.historico_recusas.map((r, i) => (
                  <li key={i}>Tentativa {r.tentativa} · {formatDateBR(r.em)} · {r.por ?? '—'}: {r.motivos.join(', ')}{r.observacao ? ` — ${r.observacao}` : ''}</li>
                ))}
              </ul>
            </div>
          )}
          {c.historico_pagamentos.length > 0 && (
            <div className="space-y-1">
              <p className="font-semibold">Pagamento</p>
              <ul className="text-[12px] space-y-0.5">
                {c.historico_pagamentos.map((m, i) => (
                  <li key={i}>{formatDateBR(m.em)} · {m.por ?? '—'}: {m.status}{m.data ? ` em ${formatDateBR(m.data)}` : ''}{m.observacao ? ` — ${m.observacao}` : ''}</li>
                ))}
              </ul>
            </div>
          )}

          {recusando && (
            <div className="rounded-lg border border-destructive/40 p-3 space-y-2">
              <p className="font-semibold">Motivos da recusa</p>
              <div className="grid gap-1 sm:grid-cols-2">
                {motivos.map((m) => (
                  <label key={m.id} className="flex items-center gap-2 text-[12px] cursor-pointer">
                    <Checkbox checked={escolhidos.includes(m.nome)}
                      onCheckedChange={(v) => setEscolhidos((s) => (v === true ? [...s, m.nome] : s.filter((x) => x !== m.nome)))} />
                    {m.nome}
                  </label>
                ))}
              </div>
            </div>
          )}

          {aprovadoSemPagar && podePagar && (
            <div className="rounded-lg border border-border p-3 grid gap-2 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-[12px]">Pagamento</Label>
                <Select value={pagamento} onValueChange={(v) => setPagamento(v as StatusDoPagamento)}>
                  <SelectTrigger aria-label="Situação do pagamento"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['Em negociação', 'Pago', 'Recusado'] as StatusDoPagamento[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {pagamento === 'Pago' && (
                <div className="space-y-1">
                  <Label htmlFor="conf-data" className="text-[12px]">Pago em</Label>
                  <Input id="conf-data" type="date" value={dataPagamento} onChange={(e) => setDataPagamento(e.target.value)} />
                </div>
              )}
            </div>
          )}

          {(emAnalise || aprovadoSemPagar || pagoSemFinalizar) && (
            <div className="space-y-1">
              <Label htmlFor="conf-obs" className="text-[12px]">Observação</Label>
              <Textarea id="conf-obs" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} />
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={() => data && imprimirChecklist(c, data.pedidos, rotuloDoItem)} disabled={!data}>
            <Printer className="w-4 h-4 mr-1.5" aria-hidden="true" /> PDF do checklist
          </Button>
          {emAnalise && podeDecidir && !recusando && (
            <>
              <Button variant="destructive" onClick={() => setRecusando(true)}>
                <XCircle className="w-4 h-4 mr-1.5" aria-hidden="true" /> Recusar
              </Button>
              <Button disabled={decidir.isPending}
                onClick={() => decidir.mutate({ checklistId: c.id, status: 'Aprovado', motivos: [], observacao: obs }, { onSuccess: aposGravar })}>
                <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" /> Aprovar
              </Button>
            </>
          )}
          {recusando && (
            <>
              <Button variant="outline" onClick={() => { setRecusando(false); setEscolhidos([]); }}>Voltar</Button>
              <Button variant="destructive" disabled={escolhidos.length === 0 || decidir.isPending}
                onClick={() => decidir.mutate({ checklistId: c.id, status: 'Recusado', motivos: escolhidos, observacao: obs }, { onSuccess: aposGravar })}>
                Devolver ao Comercial
              </Button>
            </>
          )}
          {aprovadoSemPagar && podePagar && (
            <Button disabled={pagar.isPending || (pagamento === 'Pago' && !dataPagamento)}
              onClick={() => pagar.mutate({ checklistId: c.id, status: pagamento, data: pagamento === 'Pago' ? dataPagamento : null, observacao: obs }, { onSuccess: aposGravar })}>
              Registrar pagamento
            </Button>
          )}
          {pagoSemFinalizar && podePagar && (
            <Button disabled={finalizar.isPending}
              onClick={() => finalizar.mutate({ checklistId: c.id, observacao: obs }, { onSuccess: aposGravar })}>
              Finalizar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
