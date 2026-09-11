import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { toast } from 'sonner';
import {
  useOrder,
  useCreateOrder,
  useUpdateOrderItems,
  useSetOrderDiscount,
  useGeneratePaymentLink,
  type OrderItemInput,
} from '@/hooks/useCRM';
import { usePriceTables, useProductsWithPrice, useResolvePriceTable } from '@/hooks/useCRMConfig';
import { formatBRL, orderTotals, ORDER_STATUS_LABELS } from '@/lib/crm';

const BASE = '__base__';

interface OrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pedido existente — edição/consulta. Sem isto, o diálogo começa criando um novo. */
  orderId?: string;
  /** Só para pedido novo: de onde ele nasce. */
  dealId?: string | null;
  contactId?: string;
  /** Pedido pago/cancelado: só leitura, sem editar itens. */
  readOnly?: boolean;
}

interface ItemRow extends OrderItemInput {
  key: string;
}

function emptyItem(position: number): ItemRow {
  return { key: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, position, product_id: null };
}

/**
 * Monta o pedido (itens, desconto) e, depois de salvo, o link de pagamento.
 * `orderTotals` só exibe: quem grava subtotal/total é o banco
 * (`crm_recompute_order_totals`/`crm_orders_apply_discount`).
 */
export function OrderDialog({ open, onOpenChange, orderId, dealId, contactId, readOnly = false }: OrderDialogProps) {
  const [currentOrderId, setCurrentOrderId] = useState<string | undefined>(orderId);
  const [items, setItems] = useState<ItemRow[]>([emptyItem(0)]);
  const [discount, setDiscount] = useState('0');
  const [linkKind, setLinkKind] = useState<'temporary' | 'permanent'>('temporary');
  const [expiresInHours, setExpiresInHours] = useState('24');

  const { data: order } = useOrder(currentOrderId);
  // Tabela de preço (CRM-1b): pedido novo começa com a que o banco resolve para o
  // contato (dele → segmento → padrão); pedido existente usa a que foi gravada.
  // O catálogo já vem com o preço da tabela — quem calcula é o banco.
  const { data: priceTables = [] } = usePriceTables();
  const { data: resolvedTable } = useResolvePriceTable(currentOrderId ? undefined : contactId);
  const [priceTableId, setPriceTableId] = useState<string | null | undefined>();
  const effectiveTable = currentOrderId ? order?.price_table_id ?? null : priceTableId === undefined ? resolvedTable ?? null : priceTableId;
  const { data: products = [] } = useProductsWithPrice(effectiveTable);
  const tableName = priceTables.find((t) => t.id === effectiveTable)?.name;
  const createOrder = useCreateOrder();
  const updateItems = useUpdateOrderItems(currentOrderId ?? '');
  const setOrderDiscount = useSetOrderDiscount();
  const generateLink = useGeneratePaymentLink();

  useEffect(() => {
    if (!open) return;
    setCurrentOrderId(orderId);
    if (!orderId) {
      setItems([emptyItem(0)]);
      setDiscount('0');
      setPriceTableId(undefined);
    }
  }, [open, orderId]);

  useEffect(() => {
    if (!order) return;
    setItems(
      order.items.map((item, i) => ({
        key: item.id,
        description: item.description,
        quantity: item.quantity,
        unit_price: item.unit_price,
        position: item.position ?? i,
        product_id: item.product_id,
      })),
    );
    setDiscount(String(order.discount ?? 0));
  }, [order]);

  const totals = useMemo(() => orderTotals(items, Number(discount) || 0), [items, discount]);

  const addItem = () => setItems((prev) => [...prev, emptyItem(prev.length)]);
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));
  const updateItem = (key: string, patch: Partial<ItemRow>) =>
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const handleProductChange = (key: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    updateItem(key, { product_id: product.id, description: product.name, unit_price: Number(product.price) });
  };

  // Trocar a tabela reprecifica os itens que vieram do catálogo; descrição livre fica como está.
  const changePriceTable = (value: string) => {
    setPriceTableId(value === BASE ? null : value);
  };
  useEffect(() => {
    if (currentOrderId) return;
    setItems((prev) => prev.map((item) => {
      const product = item.product_id ? products.find((p) => p.id === item.product_id) : undefined;
      return product ? { ...item, unit_price: Number(product.price) } : item;
    }));
  }, [products, currentOrderId]);

  const validItems = items.filter((i) => i.description.trim().length > 0 && i.quantity > 0);

  const handleSave = () => {
    if (validItems.length === 0) {
      toast.error('Adicione ao menos um item.');
      return;
    }
    const payloadItems = validItems.map((i, index) => ({
      product_id: i.product_id ?? null,
      description: i.description.trim(),
      quantity: i.quantity,
      unit_price: i.unit_price,
      position: index,
    }));

    if (currentOrderId) {
      updateItems.mutate(payloadItems, {
        onSuccess: () => {
          const discountValue = Number(discount) || 0;
          if (discountValue !== (order?.discount ?? 0)) {
            setOrderDiscount.mutate({ id: currentOrderId, discount: discountValue });
          }
        },
      });
      return;
    }

    if (!contactId) {
      toast.error('Este negócio não tem contato — não é possível montar o pedido.');
      return;
    }
    createOrder.mutate(
      { deal_id: dealId ?? null, contact_id: contactId, discount: Number(discount) || 0, price_table_id: effectiveTable, items: payloadItems },
      { onSuccess: (created) => setCurrentOrderId(created.id) },
    );
  };

  const handleGenerateLink = () => {
    if (!currentOrderId) return;
    generateLink.mutate({
      order_id: currentOrderId,
      kind: linkKind,
      expires_in_hours: linkKind === 'temporary' ? Number(expiresInHours) : undefined,
    });
  };

  const copyLink = () => {
    if (!order?.link_url) return;
    navigator.clipboard.writeText(order.link_url);
    toast.success('Link copiado.');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{currentOrderId ? `Pedido #${order?.number ?? ''}` : 'Novo pedido'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {priceTables.length > 0 && (
            <div className="flex items-center gap-3">
              <Label className="text-xs">Tabela de preço</Label>
              {currentOrderId || readOnly ? (
                <Badge variant="outline">{tableName ?? 'preço base'}</Badge>
              ) : (
                <Select value={effectiveTable ?? BASE} onValueChange={changePriceTable}>
                  <SelectTrigger className="w-56 h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={BASE}>Preço base</SelectItem>
                    {priceTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.key} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-4">
                  <Label className="text-xs">Produto</Label>
                  <Select
                    value={item.product_id ?? '__free__'}
                    onValueChange={(v) => v !== '__free__' && handleProductChange(item.key, v)}
                    disabled={readOnly}
                  >
                    <SelectTrigger><SelectValue placeholder="Descrição livre" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__free__">Descrição livre</SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {formatBRL(Number(p.price))}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-4">
                  <Label className="text-xs">Descrição</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.key, { description: e.target.value })}
                    disabled={readOnly}
                  />
                </div>
                <div className="col-span-1">
                  <Label className="text-xs">Qtd.</Label>
                  <Input
                    type="number"
                    min="0.001"
                    step="0.001"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Preço unit.</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(item.key, { unit_price: Number(e.target.value) })}
                    disabled={readOnly}
                  />
                </div>
                <div className="col-span-1 flex justify-end pb-1.5">
                  {!readOnly && (
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.key)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            {!readOnly && (
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Item
              </Button>
            )}
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Desconto (R$)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                disabled={readOnly}
                className="w-32"
              />
            </div>
            <div className="text-right text-sm">
              <div className="text-muted-foreground">Subtotal: {formatBRL(totals.subtotal)}</div>
              <div className="font-semibold">Total: {formatBRL(totals.total)}</div>
            </div>
          </div>

          {!readOnly && (
            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={createOrder.isPending || updateItems.isPending}>
                {currentOrderId ? 'Atualizar pedido' : 'Salvar pedido'}
              </Button>
            </div>
          )}

          {currentOrderId && (
            <div className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Link de pagamento</Label>
                {order && <Badge variant="outline">{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>}
              </div>

              {order?.link_url ? (
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2">
                    <Input readOnly value={order.link_url} className="font-mono text-xs" />
                    <Button variant="outline" size="icon" onClick={copyLink}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  {order.link_expires_at && (
                    <p className="text-xs text-muted-foreground">
                      Válido até {new Date(order.link_expires_at).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <RadioGroup
                    value={linkKind}
                    onValueChange={(v) => setLinkKind(v as 'temporary' | 'permanent')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="temporary" id="link-temp" />
                      <Label htmlFor="link-temp" className="font-normal">Temporário</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <RadioGroupItem value="permanent" id="link-perm" />
                      <Label htmlFor="link-perm" className="font-normal">Definitivo</Label>
                    </div>
                  </RadioGroup>
                  {linkKind === 'temporary' && (
                    <Select value={expiresInHours} onValueChange={setExpiresInHours}>
                      <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="1">1 hora</SelectItem>
                        <SelectItem value="6">6 horas</SelectItem>
                        <SelectItem value="12">12 horas</SelectItem>
                        <SelectItem value="24">24 horas</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                  <Button size="sm" onClick={handleGenerateLink} disabled={generateLink.isPending}>
                    Gerar link
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
