import { useState } from 'react';
import { Boxes, Plus, TriangleAlert } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateBR } from '@/lib/crm';
import { todayISO } from '@/lib/dates';
import { useProductBalances, useLotBalances, useReceiveLot, useAdjustStock, type ProductBalance } from '@/hooks/useExpedicao';

/** Vence nos próximos 30 dias? (o que a expedição precisa ver antes de tudo) */
function vencendo(date: string | null): boolean {
  if (!date) return false;
  const dias = (new Date(`${date}T00:00:00`).getTime() - new Date(`${todayISO()}T00:00:00`).getTime()) / 86_400_000;
  return dias <= 30;
}

/**
 * Estoque por lote (EXP-1): saldo por produto, os lotes de cada um com a
 * validade, entrada de lote e ajuste. O saldo é a soma das movimentações —
 * nada se apaga, corrige-se com ajuste.
 */
export default function ExpedicaoEstoque() {
  const { data: products = [], isLoading } = useProductBalances();
  const [open, setOpen] = useState<ProductBalance | null>(null);
  const [entrada, setEntrada] = useState(false);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          className="bg-transparent border-0 px-0 py-0"
          icon={Boxes}
          title="Estoque"
          description="Saldo por produto e por lote. A saída acontece na separação."
        />
        <Button size="sm" onClick={() => setEntrada(true)}><Plus className="h-3.5 w-3.5 mr-1.5" /> Entrada de lote</Button>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : products.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nenhum produto cadastrado. Cadastre em CRM → Produtos.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {products.map((p) => (
              <button key={p.product_id} type="button" onClick={() => setOpen(p)} className="flex w-full flex-wrap items-center gap-3 p-3 text-left hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.sku ? `SKU ${p.sku}` : 'sem SKU'}{p.barcode ? ` · ${p.barcode}` : ''}{p.track_lots ? ' · controla lote' : ''}
                  </p>
                </div>
                {vencendo(p.next_expiry) && (
                  <Badge variant="outline" className="text-[10px] text-status-warning border-status-warning/40">
                    <TriangleAlert className="h-3 w-3 mr-1" /> vence {formatDateBR(p.next_expiry!)}
                  </Badge>
                )}
                <span className="text-sm font-semibold tabular-nums">{Number(p.balance)} {p.unit}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      <LotesDialog product={open} onOpenChange={(o) => !o && setOpen(null)} />
      <EntradaDialog open={entrada} onOpenChange={setEntrada} products={products} />
    </div>
  );
}

function LotesDialog({ product, onOpenChange }: { product: ProductBalance | null; onOpenChange: (open: boolean) => void }) {
  const { data: lots = [] } = useLotBalances(product?.product_id ?? undefined);
  const adjust = useAdjustStock();
  const [ajuste, setAjuste] = useState<{ lot: string | null; quantity: string; reason: string } | null>(null);

  return (
    <Dialog open={!!product} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {product && (
          <>
            <DialogHeader>
              <DialogTitle>{product.name}</DialogTitle>
              <DialogDescription>Saldo {Number(product.balance)} {product.unit}. O que sai primeiro é a regra da empresa (Configurações da Expedição).</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {lots.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sem lote cadastrado. Use "Entrada de lote".</p>
              ) : lots.map((l) => (
                <div key={l.lot_id} className="flex items-center gap-3 rounded-lg border p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{l.code}</p>
                    <p className="text-xs text-muted-foreground">
                      {l.expires_on ? `vence ${formatDateBR(l.expires_on)}` : 'sem validade'} · entrou {formatDateBR(l.received_on)}
                    </p>
                  </div>
                  <span className="text-sm tabular-nums">{Number(l.balance)}</span>
                  <Button variant="ghost" size="sm" onClick={() => setAjuste({ lot: l.lot_id, quantity: '', reason: '' })}>Ajustar</Button>
                </div>
              ))}
            </div>
            {ajuste && (
              <div className="space-y-2 rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Ajuste entra como movimentação: positivo soma, negativo tira. O histórico fica.</p>
                <div className="flex flex-wrap gap-2">
                  <Input type="number" step="0.001" placeholder="+ ou −" value={ajuste.quantity} onChange={(e) => setAjuste({ ...ajuste, quantity: e.target.value })} className="w-28" />
                  <Input placeholder="Motivo (quebra, contagem…)" value={ajuste.reason} onChange={(e) => setAjuste({ ...ajuste, reason: e.target.value })} className="flex-1 min-w-[160px]" />
                  <Button size="sm" disabled={!Number(ajuste.quantity) || !ajuste.reason.trim() || adjust.isPending}
                    onClick={() => adjust.mutate(
                      { product_id: product.product_id!, lot_id: ajuste.lot, quantity: Number(ajuste.quantity), reason: ajuste.reason.trim() },
                      { onSuccess: () => setAjuste(null) })}>
                    Lançar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EntradaDialog({ open, onOpenChange, products }: { open: boolean; onOpenChange: (o: boolean) => void; products: ProductBalance[] }) {
  const receive = useReceiveLot();
  const [productId, setProductId] = useState('');
  const [code, setCode] = useState('');
  const [expires, setExpires] = useState('');
  const [received, setReceived] = useState(todayISO());
  const [quantity, setQuantity] = useState('');

  const canSave = !!productId && code.trim().length > 0 && Number(quantity) > 0 && !receive.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Entrada de lote</DialogTitle>
          <DialogDescription>O que chegou: produto, lote, validade e quantidade. Lote que já existe recebe a soma.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Produto</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{products.map((p) => <SelectItem key={p.product_id} value={p.product_id!}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Lote</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Como vem na embalagem" /></div>
            <div className="space-y-1.5"><Label>Quantidade</Label><Input type="number" min="0.001" step="0.001" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Validade</Label><Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Entrou em</Label><Input type="date" value={received} onChange={(e) => setReceived(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSave} onClick={() => receive.mutate(
            { product_id: productId, code, expires_on: expires || null, received_on: received || null, quantity: Number(quantity) },
            { onSuccess: () => { onOpenChange(false); setCode(''); setQuantity(''); setExpires(''); } })}>
            Registrar entrada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
