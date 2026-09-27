import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Check, Printer, ScanLine, Truck, Undo2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantPath } from '@/hooks/useTenantPath';
import { formatDateBR } from '@/lib/crm';
import { useShipment, useScan, useShipOrder, useCancelShipment, type ScanResult } from '@/hooks/useExpedicao';
import { useEtiqueta, useShippingStatus, abrirEtiqueta, LABEL_PROVIDER_LABELS } from '@/hooks/useEtiqueta';

/**
 * A tela de separar, feita para ser usada com o leitor de código de barras na
 * mão: o campo já nasce com o foco, o leitor "digita" o código e dá Enter, e a
 * resposta aparece grande — produto, lote, quanto falta. Quem escolhe o lote é
 * o banco (FEFO/FIFO conforme a empresa configurar).
 */
export default function ExpedicaoSeparacao() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: shipment, isPending } = useShipment(id);
  const scan = useScan(id);
  const ship = useShipOrder(id);
  const cancel = useCancelShipment(id);
  const etiqueta = useEtiqueta(id);
  const { data: shipping } = useShippingStatus();

  const [code, setCode] = useState('');
  const [qty, setQty] = useState('1');
  const [last, setLast] = useState<ScanResult | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carrier, setCarrier] = useState('');
  const [tracking, setTracking] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { codeRef.current?.focus(); }, [shipment?.id]);
  useEffect(() => { if (shipment?.carrier) setCarrier((c) => c || shipment.carrier!); }, [shipment?.carrier]);
  // O rastreio pode nascer da etiqueta; o campo mostra o que já existe.
  useEffect(() => { if (shipment?.tracking_code) setTracking((t) => t || shipment.tracking_code!); }, [shipment?.tracking_code]);

  if (isPending) return <div className="p-6 max-w-4xl mx-auto"><Skeleton className="h-64 w-full" /></div>;
  if (!shipment) return <div className="p-6 text-sm text-muted-foreground">Separação não encontrada.</div>;

  const order = shipment.order as { number: number; notes: string | null; contact: { name: string; company: string | null; zip_code: string | null; street: string | null; street_number: string | null; city: string | null; state: string | null; carrier: string | null } | null } | null;
  const contact = order?.contact ?? null;
  const items = shipment.items ?? [];
  const falta = items.filter((i) => Number(i.picked) < Number(i.quantity)).length;
  const despachado = shipment.status === 'shipped';
  const cancelada = shipment.status === 'cancelled';
  const jaSeparou = items.some((i) => Number(i.picked) > 0);
  const temEtiqueta = !!shipping && shipping.provider !== 'nenhum';
  // Nos Correios não há link para guardar (o PDF vem autenticado), então o que
  // prova que a etiqueta já saiu é o código do objeto.
  const jaEtiquetado = !!shipment.label_url || (!!shipment.label_provider && !!shipment.tracking_code);
  const faltaEndereco = [
    !contact?.zip_code && 'CEP',
    !contact?.street && 'rua',
    !contact?.street_number && 'número',
    !contact?.city && 'cidade',
    !contact?.state && 'estado',
  ].filter(Boolean).join(', ');

  const bipar = () => {
    const c = code.trim();
    if (!c) return;
    setErro(null);
    scan.mutate({ code: c, quantity: Number(qty) || 1 }, {
      onSuccess: (r) => { setLast(r); setCode(''); setQty('1'); codeRef.current?.focus(); },
      onError: (e) => { setErro(e instanceof Error ? e.message : String(e)); setCode(''); codeRef.current?.focus(); },
    });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(tenantPath('/expedicao/fila'))} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <PageHeader
          className="bg-transparent border-0 px-0 py-0 flex-1"
          icon={ScanLine}
          title={`Separação #${shipment.number} — pedido #${order?.number ?? '?'}`}
          description={contact ? `${contact.name}${contact.company ? ` · ${contact.company}` : ''}${contact.city ? ` · ${contact.city}/${contact.state ?? ''}` : ''}` : ''}
        />
        <Badge variant={despachado || cancelada ? 'secondary' : 'outline'} className="mt-1">
          {despachado ? 'Despachado' : cancelada ? 'Cancelada' : falta === 0 ? 'Pronto' : `${falta} a separar`}
        </Badge>
      </div>

      {!despachado && !cancelada && (
        <Card>
          <CardHeader><CardTitle className="text-base">Bipe o item</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5 flex-1 min-w-[220px]">
                <Label>Código de barras, SKU ou lote</Label>
                <Input
                  ref={codeRef}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); bipar(); } }}
                  placeholder="Passe o leitor ou digite e tecle Enter"
                  autoComplete="off"
                  className="text-base font-mono"
                />
              </div>
              <div className="space-y-1.5 w-24">
                <Label>Qtd.</Label>
                <Input type="number" min="0.001" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} className="text-right" />
              </div>
              <Button onClick={bipar} disabled={scan.isPending || !code.trim()}>Confirmar</Button>
            </div>

            {erro && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
                <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{erro}</p>
              </div>
            )}
            {last && !erro && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                <p className="text-base font-semibold">{last.product}</p>
                <p className="text-sm text-muted-foreground">
                  {last.picked} de {last.quantity} {last.unit}
                  {last.lot ? ` · lote ${last.lot}` : ''}
                  {last.expires_on ? ` · vence em ${formatDateBR(last.expires_on)}` : ''}
                  {last.remaining > 0 ? ` · faltam ${last.remaining}` : ' · item completo'}
                </p>
                {last.complete && <p className="text-sm font-medium text-primary mt-1">Pedido separado por inteiro. Pode despachar.</p>}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Itens</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {items.map((item) => {
            const pronto = Number(item.picked) >= Number(item.quantity);
            const produto = item.product as { name: string; sku: string | null; barcode: string | null; unit: string; track_lots: boolean } | null;
            const lote = item.lot as { code: string; expires_on: string | null } | null;
            return (
              <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                {pronto ? <Check className="h-4 w-4 text-primary shrink-0" /> : <span className="h-4 w-4 shrink-0 rounded-full border" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{item.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {produto?.sku ? `SKU ${produto.sku}` : 'sem SKU'}
                    {produto?.barcode ? ` · ${produto.barcode}` : ''}
                    {lote ? ` · lote ${lote.code}${lote.expires_on ? ` (vence ${formatDateBR(lote.expires_on)})` : ''}` : produto?.track_lots ? ' · controla lote' : ''}
                  </p>
                </div>
                <span className={`text-sm font-medium ${pronto ? 'text-primary' : ''}`}>
                  {Number(item.picked)} / {Number(item.quantity)} {produto?.unit ?? ''}
                </span>
              </div>
            );
          })}
          {order?.notes && <p className="text-xs text-muted-foreground pt-1">Observações do pedido: {order.notes}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Despachar</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {cancelada ? (
            <p className="text-sm text-muted-foreground">Separação desfeita. O que já tinha saído voltou ao estoque, e o pedido voltou para a fila.</p>
          ) : despachado ? (
            <p className="text-sm text-muted-foreground">
              Despachado em {shipment.shipped_at ? new Date(shipment.shipped_at).toLocaleString('pt-BR') : '—'}
              {shipment.carrier ? ` por ${shipment.carrier}` : ''}
              {shipment.tracking_code ? ` · rastreio ${shipment.tracking_code}` : ''}.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Transportadora</Label>
                  <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder={contact?.carrier ?? 'Quem leva'} />
                </div>
                <div className="space-y-1.5">
                  <Label>Código de rastreio</Label>
                  <Input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Se houver" className="font-mono" />
                </div>
              </div>
              {temEtiqueta ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" disabled={etiqueta.isPending || falta > 0}
                    onClick={() => (shipment.label_url ? abrirEtiqueta({ label_url: shipment.label_url }) : etiqueta.mutate())}>
                    <Printer className="h-3.5 w-3.5 mr-1.5" /> {jaEtiquetado ? 'Abrir etiqueta' : 'Gerar etiqueta'}
                  </Button>
                  <span className="text-[11px] text-muted-foreground">
                    {falta > 0
                      ? 'Separe tudo antes de gerar a etiqueta.'
                      : jaEtiquetado
                        ? 'Já etiquetado: abrir imprime de novo o mesmo envio, sem gerar outro.'
                        : `Vem de ${LABEL_PROVIDER_LABELS[shipping!.provider].toLowerCase()}.`}
                  </span>
                  {shipping!.provider === 'correios' && !jaEtiquetado && faltaEndereco && (
                    <p className="w-full text-[11px] text-destructive">
                      Os Correios exigem o endereço completo. Falta preencher no cadastro de {contact?.name ?? 'do cliente'}: {faltaEndereco}.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Escolha de onde vem a etiqueta em Configurações da Expedição. Por enquanto, o rastreio é digitado.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => ship.mutate({ carrier, tracking })} disabled={ship.isPending || falta > 0}>
                  <Truck className="h-3.5 w-3.5 mr-1.5" /> Despachar
                </Button>
                <Button variant="ghost" className="text-muted-foreground" onClick={() => cancel.mutate(undefined)} disabled={cancel.isPending}>
                  <Undo2 className="h-3.5 w-3.5 mr-1.5" /> Desfazer separação
                </Button>
              </div>
              {falta > 0 && <p className="text-xs text-muted-foreground">Faltam {falta} item(ns) para separar.</p>}
              {jaSeparou && <p className="text-xs text-muted-foreground">Desfazer devolve ao estoque, lote a lote, tudo o que já foi bipado.</p>}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
