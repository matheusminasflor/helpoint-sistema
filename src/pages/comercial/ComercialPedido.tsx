import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, ChevronsUpDown, Copy, ExternalLink, MessageCircle, Plus, Send, ShoppingCart, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useTenantPath } from '@/hooks/useTenantPath';
import {
  useCRMContacts, useContact, useOrder, useCreateOrder, useUpdateOrderItems, useUpdateOrder, useSetOrderStatus,
  useGeneratePaymentLink, type OrderItemInput,
} from '@/hooks/useCRM';
import { usePriceTables, useProductsWithPrice, useResolvePriceTable, type ProductWithPrice } from '@/hooks/useCRMConfig';
import { useTenantName } from '@/hooks/useTenantName';
import { daysFromTodayISO } from '@/lib/dates';
import {
  formatBRL, formatDateBR, orderTotals, proposalUrl, proposalWhatsAppText, whatsAppLink,
  ORDER_EDITABLE_STATUSES, ORDER_STATUS_LABELS,
} from '@/lib/crm';

const BASE = '__base__';
const EMPTY_PRODUCTS: ProductWithPrice[] = [];

interface ItemRow extends OrderItemInput {
  key: string;
}

const freeItem = (position: number): ItemRow => ({ key: crypto.randomUUID(), description: '', quantity: 1, unit_price: 0, position, product_id: null });

/**
 * O pedido em tela cheia (CRM-1c) — feito para ser usado durante a reunião,
 * com o cliente falando: busca de produto pelo nome, quantidade pelo teclado,
 * total ao vivo, frete e observações. Daqui saem a proposta (link público +
 * WhatsApp), o link de pagamento e as marcações "aceita" e "pago". Regra
 * nenhuma: totais, linha do tempo e Ganho são do banco.
 *
 * Rotas: `comercial/pedidos/novo?contato=&negocio=` e `comercial/pedidos/:id`.
 */
export default function ComercialPedido() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const isNew = id === 'novo';
  const orderId = isNew ? undefined : id;

  const [contactId, setContactId] = useState<string | undefined>(params.get('contato') ?? undefined);
  const dealId = params.get('negocio');

  const { data: order, isPending: orderPending } = useOrder(orderId);
  const { data: pickedContact } = useContact(isNew ? contactId : undefined);
  const contact = order?.contact ?? pickedContact ?? null;

  const [items, setItems] = useState<ItemRow[]>([]);
  const [discount, setDiscount] = useState('0');
  const [shipping, setShipping] = useState('0');
  const [notes, setNotes] = useState('');
  const [validDays, setValidDays] = useState('7');
  const [priceTableId, setPriceTableId] = useState<string | null | undefined>();
  const [shareOpen, setShareOpen] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [productOpen, setProductOpen] = useState(false);

  // Tabela de preço: pedido novo começa com a que o banco resolve para o contato; existente usa a gravada.
  const { data: priceTables = [] } = usePriceTables();
  const { data: resolvedTable } = useResolvePriceTable(isNew ? contactId : undefined);
  const effectiveTable = order ? order.price_table_id ?? null : priceTableId === undefined ? resolvedTable ?? null : priceTableId;
  const { data: products = EMPTY_PRODUCTS } = useProductsWithPrice(effectiveTable);
  const tableName = priceTables.find((t) => t.id === effectiveTable)?.name;

  const createOrder = useCreateOrder();
  const updateItems = useUpdateOrderItems(orderId ?? '');
  const updateOrder = useUpdateOrder();
  const setStatus = useSetOrderStatus();
  const generateLink = useGeneratePaymentLink();
  const { data: tenantName } = useTenantName();

  // Carrega o pedido existente na tela.
  useEffect(() => {
    if (!order) return;
    setItems(order.items.map((item, i) => ({
      key: item.id, description: item.description, quantity: Number(item.quantity), unit_price: Number(item.unit_price), position: item.position ?? i, product_id: item.product_id,
    })));
    setDiscount(String(order.discount ?? 0));
    setShipping(String(order.shipping ?? 0));
    setNotes(order.notes ?? '');
  }, [order]);

  const status = order?.status ?? 'draft';
  const editable = ORDER_EDITABLE_STATUSES.has(status);
  const totals = useMemo(() => orderTotals(items, Number(discount) || 0, Number(shipping) || 0), [items, discount, shipping]);
  const validItems = items.filter((i) => i.description.trim().length > 0 && i.quantity > 0);

  // Há algo digitado e ainda não gravado? (Sem useMemo: `validItems` nasce a cada render.)
  const dirty = (() => {
    if (!order) return validItems.length > 0;
    const saved = order.items.map((i) => `${i.product_id ?? ''}|${i.description}|${Number(i.quantity)}|${Number(i.unit_price)}`).join(';');
    const now = validItems.map((i) => `${i.product_id ?? ''}|${i.description.trim()}|${i.quantity}|${i.unit_price}`).join(';');
    return saved !== now || Number(discount) !== Number(order.discount) || Number(shipping) !== Number(order.shipping) || (notes || '') !== (order.notes ?? '');
  })();

  const updateItem = (key: string, patch: Partial<ItemRow>) => setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  /** Escolher um produto: se já está na lista, soma 1; senão entra com o preço da tabela. */
  const addProduct = (product: ProductWithPrice) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product_id === product.id);
      if (existing) return prev.map((i) => (i.key === existing.key ? { ...i, quantity: i.quantity + 1 } : i));
      return [...prev, { key: crypto.randomUUID(), product_id: product.id, description: product.name, quantity: 1, unit_price: Number(product.price), position: prev.length }];
    });
    setProductSearch('');
    setProductOpen(false);
  };

  const payloadItems = () => validItems.map((i, index) => ({
    product_id: i.product_id ?? null, description: i.description.trim(), quantity: i.quantity, unit_price: i.unit_price, position: index,
  }));

  /** Grava tudo; devolve o id do pedido (novo ou existente). */
  const save = async (): Promise<string | undefined> => {
    if (validItems.length === 0) {
      toast.error('Adicione ao menos um item.');
      return undefined;
    }
    if (isNew) {
      if (!contactId) {
        toast.error('Escolha o contato do pedido.');
        return undefined;
      }
      const created = await createOrder.mutateAsync({
        deal_id: dealId, contact_id: contactId, discount: Number(discount) || 0, shipping: Number(shipping) || 0,
        notes: notes.trim() || null, price_table_id: effectiveTable, items: payloadItems(),
      });
      navigate(tenantPath(`/comercial/pedidos/${created.id}`), { replace: true });
      return created.id;
    }
    await updateItems.mutateAsync(payloadItems());
    await updateOrder.mutateAsync({ id: orderId!, discount: Number(discount) || 0, shipping: Number(shipping) || 0, notes: notes.trim() || null });
    return orderId;
  };

  const handleSave = () => { void save().catch(() => undefined); };

  const handleSendProposal = async () => {
    try {
      const savedId = dirty || isNew ? await save() : orderId;
      if (!savedId) return;
      await setStatus.mutateAsync({ id: savedId, status: 'proposal_sent', proposal_valid_until: daysFromTodayISO(Number(validDays) || 7) });
      setShareOpen(true);
    } catch {
      /* o toast do hook já explicou */
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado.');
  };

  const publicUrl = order ? proposalUrl(window.location.origin, order.public_token) : '';
  // Só monta a mensagem com tudo em mãos: pedido gravado, contato e o nome da empresa.
  const shareReady = !!order && !!contact && !!tenantName;
  const whatsAppText = shareReady
    ? proposalWhatsAppText({
        contactName: contact.name, companyName: tenantName, number: order.number,
        total: Number(order.total), url: publicUrl, validUntil: order.proposal_valid_until,
      })
    : '';

  if (!isNew && (orderPending || !order)) {
    return (
      <div className="p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  const busy = createOrder.isPending || updateItems.isPending || updateOrder.isPending || setStatus.isPending;

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title={order ? `Pedido #${order.number}` : 'Novo pedido'}
        description={contact ? (contact.company ? `${contact.name} — ${contact.company}` : contact.name) : 'Escolha o contato'}
        icon={ShoppingCart}
        status={order ? <Badge variant="outline">{ORDER_STATUS_LABELS[status] ?? status}</Badge> : undefined}
        onBack={() => navigate(tenantPath(dealId ? `/comercial/negocios/${dealId}` : order?.deal_id ? `/comercial/negocios/${order.deal_id}` : '/comercial/pedidos'))}
        actions={
          <div className="flex flex-wrap gap-2">
            {editable && <Button variant="outline" onClick={handleSave} disabled={!dirty || busy}>Salvar</Button>}
            {editable && (
              <Button onClick={handleSendProposal} disabled={busy || validItems.length === 0}>
                <Send className="w-4 h-4 mr-1.5" /> {status === 'proposal_sent' ? 'Reenviar proposta' : 'Enviar proposta'}
              </Button>
            )}
            {order && status !== 'draft' && status !== 'cancelled' && (
              <Button variant="outline" onClick={() => setShareOpen(true)}><MessageCircle className="w-4 h-4 mr-1.5" /> Compartilhar</Button>
            )}
            {/* Mudar o status com algo digitado e não salvo descartaria a digitação (a tela recarrega o pedido). */}
            {order && ['proposal_sent', 'sent'].includes(status) && (
              <Button variant="outline" onClick={() => setStatus.mutate({ id: order.id, status: 'accepted' })} disabled={busy || dirty} title={dirty ? 'Salve antes' : undefined}>
                <Check className="w-4 h-4 mr-1.5" /> Marcar aceita
              </Button>
            )}
            {order && ['proposal_sent', 'accepted', 'sent'].includes(status) && (
              <Button variant="outline" onClick={() => setStatus.mutate({ id: order.id, status: 'paid' })} disabled={busy || dirty} title={dirty ? 'Salve antes' : undefined}>Marcar pago</Button>
            )}
            {order && !['paid', 'cancelled'].includes(status) && (
              <Button variant="ghost" className="text-destructive" onClick={() => setStatus.mutate({ id: order.id, status: 'cancelled' })} disabled={busy || dirty}>Cancelar</Button>
            )}
          </div>
        }
      />

      <div className="p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {isNew && !contactId && <ContactPicker onPick={setContactId} />}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Itens</CardTitle>
              {editable && (
                <div className="flex items-center gap-2">
                  <Popover open={productOpen} onOpenChange={setProductOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-72 justify-between font-normal">
                        <span className="text-muted-foreground">Buscar produto pelo nome…</span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="end">
                      <Command>
                        <CommandInput placeholder="Digite o nome ou o código" value={productSearch} onValueChange={setProductSearch} autoFocus />
                        <CommandList>
                          <CommandEmpty>Nenhum produto. Cadastre em Comercial → Produtos.</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem key={p.id} value={`${p.name} ${p.sku ?? ''}`} onSelect={() => addProduct(p)}>
                                <span className="flex-1 truncate">{p.name}</span>
                                <span className="ml-2 text-xs text-muted-foreground">{formatBRL(Number(p.price))}</span>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <Button variant="ghost" size="sm" onClick={() => setItems((prev) => [...prev, freeItem(prev.length)])}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Item livre
                  </Button>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {items.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Busque um produto acima — ou adicione um item livre.</p>
              ) : (
                <div className="space-y-2">
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-[11px] font-semibold uppercase text-muted-foreground">
                    <span className="col-span-6">Item</span><span className="col-span-2 text-right">Qtd.</span><span className="col-span-2 text-right">Unitário</span><span className="col-span-2 text-right">Total</span>
                  </div>
                  {items.map((item) => (
                    <div key={item.key} className="grid grid-cols-12 items-center gap-2 rounded-lg border px-2 py-1.5">
                      <div className="col-span-12 sm:col-span-6">
                        {item.product_id ? (
                          <p className="truncate text-sm">{item.description}</p>
                        ) : (
                          <Input value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} placeholder="Descrição" className="h-8" disabled={!editable} />
                        )}
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input type="number" min="0.001" step="0.001" value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: Number(e.target.value) })} className="h-8 text-right" disabled={!editable} aria-label="Quantidade" />
                      </div>
                      <div className="col-span-4 sm:col-span-2">
                        <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateItem(item.key, { unit_price: Number(e.target.value) })} className="h-8 text-right" disabled={!editable} aria-label="Preço unitário" />
                      </div>
                      <div className="col-span-3 sm:col-span-1 text-right text-sm font-medium">{formatBRL(item.quantity * item.unit_price)}</div>
                      <div className="col-span-1 flex justify-end">
                        {editable && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={() => removeItem(item.key)} aria-label="Tirar item">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Observações</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Condições, prazo de entrega, o que combinaram na reunião…" disabled={!editable} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {priceTables.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Tabela de preço</Label>
                  {isNew ? (
                    <Select value={effectiveTable ?? BASE} onValueChange={(v) => setPriceTableId(v === BASE ? null : v)}>
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={BASE}>Preço base</SelectItem>
                        {priceTables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Badge variant="outline">{tableName ?? 'preço base'}</Badge>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatBRL(totals.subtotal)}</span></div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-muted-foreground font-normal">Desconto (R$)</Label>
                <Input type="number" min="0" step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} className="h-8 w-28 text-right" disabled={!editable} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label className="text-muted-foreground font-normal">Frete (R$)</Label>
                <Input type="number" min="0" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} className="h-8 w-28 text-right" disabled={!editable} />
              </div>
              <div className="flex items-center justify-between border-t pt-2 text-base font-semibold"><span>Total</span><span>{formatBRL(totals.total)}</span></div>
              {editable && (
                <div className="flex items-center justify-between gap-3 pt-1">
                  <Label className="text-muted-foreground font-normal">Proposta válida por</Label>
                  <Select value={validDays} onValueChange={setValidDays}>
                    <SelectTrigger className="h-8 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 dias</SelectItem>
                      <SelectItem value="7">7 dias</SelectItem>
                      <SelectItem value="15">15 dias</SelectItem>
                      <SelectItem value="30">30 dias</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              {order?.proposal_valid_until && <p className="text-xs text-muted-foreground">Válida até {formatDateBR(order.proposal_valid_until)}</p>}
            </CardContent>
          </Card>

          {order && !['paid', 'cancelled'].includes(status) && (
            <Card>
              <CardHeader><CardTitle className="text-base">Link de pagamento</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {order.link_url ? (
                  <>
                    <div className="flex items-center gap-2">
                      <Input readOnly value={order.link_url} className="font-mono text-xs h-8" />
                      <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => copy(order.link_url!)} aria-label="Copiar link"><Copy className="h-4 w-4" /></Button>
                    </div>
                    {order.link_expires_at && <p className="text-xs text-muted-foreground">Válido até {new Date(order.link_expires_at).toLocaleString('pt-BR')}</p>}
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">Para quem paga por cartão ou Pix pelo link. Entra na página da proposta como "Pagar agora".</p>
                    <Button size="sm" variant="outline" onClick={() => generateLink.mutate({ order_id: order.id, kind: 'temporary', expires_in_hours: 24 })} disabled={generateLink.isPending || dirty}>
                      Gerar link (24 h)
                    </Button>
                    {dirty && <p className="text-xs text-muted-foreground">Salve o pedido antes de gerar o link.</p>}
                  </>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Proposta #{order?.number}</DialogTitle>
            <DialogDescription>O cliente abre o link sem login e vê itens, total e validade. Pode imprimir ou salvar em PDF por lá.</DialogDescription>
          </DialogHeader>
          {shareReady ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input readOnly value={publicUrl} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(publicUrl)} aria-label="Copiar link"><Copy className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" asChild aria-label="Abrir"><a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
              </div>
              <Textarea readOnly value={whatsAppText} rows={5} className="text-xs" />
            </div>
          ) : (
            <Skeleton className="h-32 w-full" />
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => copy(whatsAppText)} disabled={!shareReady}>Copiar mensagem</Button>
            {shareReady ? (
              <Button asChild>
                <a href={whatsAppLink(contact.whatsapp ?? contact.phone ?? '', whatsAppText)} target="_blank" rel="noreferrer">
                  <MessageCircle className="w-4 h-4 mr-1.5" /> Abrir no WhatsApp
                </a>
              </Button>
            ) : (
              <Button disabled><MessageCircle className="w-4 h-4 mr-1.5" /> Abrir no WhatsApp</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Pedido novo sem `?contato=`: escolher (mesma busca do "Novo negócio"). */
function ContactPicker({ onPick }: { onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { data: contacts = [] } = useCRMContacts(search);
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Para quem é o pedido?</CardTitle></CardHeader>
      <CardContent>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
              <span className={cn('text-muted-foreground')}>Buscar contato…</span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Nome, e-mail ou empresa…" value={search} onValueChange={setSearch} />
              <CommandList>
                <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                <CommandGroup>
                  {contacts.map((c) => (
                    <CommandItem key={c.id} value={c.id} onSelect={() => { onPick(c.id); setOpen(false); }}>
                      {c.name}{c.company ? ` — ${c.company}` : ''}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </CardContent>
    </Card>
  );
}
