import { useState } from 'react';
import { Pencil, Plus, Trash2, Undo2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatBRL } from '@/lib/crm';
import {
  useDeletePriceTable, useDeletePriceTableItem, usePriceTableItems, usePriceTables, useProductsWithPrice,
  useSavePriceTable, useSavePriceTableItem, type CRMPriceTable,
} from '@/hooks/useCRMConfig';

interface EditorState {
  id?: string;
  name: string;
  percent: string;
  is_default: boolean;
}

function percentLabel(p: number): string {
  if (p === 0) return 'preço base';
  return `${p > 0 ? '+' : ''}${p}% sobre a base`;
}

/**
 * Configurações do Comercial → aba "Tabelas de preço" (CRM-1b). Uma tabela é
 * uma porcentagem sobre o preço base do produto; a exceção é o preço de um
 * produto naquela tabela. Quem calcula é o banco (`crm_product_price`) — aqui
 * só se mostra o resultado (`crm_products_with_price`).
 */
export function PriceTablesManager() {
  const { data: tables = [], isLoading } = usePriceTables(true);
  const saveTable = useSavePriceTable();
  const deleteTable = useDeletePriceTable();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<CRMPriceTable | null>(null);
  const [exceptionsFor, setExceptionsFor] = useState<string | undefined>();
  const activeTable = tables.find((t) => t.id === exceptionsFor) ?? tables.find((t) => t.is_default) ?? tables[0];

  const openNew = () => setEditor({ name: '', percent: '0', is_default: tables.length === 0 });
  const openEdit = (t: CRMPriceTable) => setEditor({ id: t.id, name: t.name, percent: String(t.percent), is_default: t.is_default });

  const percentValue = Number(editor?.percent);
  const canSave = !!editor && editor.name.trim().length > 0 && Number.isFinite(percentValue) && percentValue > -100 && !saveTable.isPending;
  const handleSave = () => {
    if (!editor || !canSave) return;
    saveTable.mutate(
      { id: editor.id, name: editor.name.trim(), percent: percentValue, is_default: editor.is_default, is_active: editor.id ? tables.find((t) => t.id === editor.id)?.is_active ?? true : true },
      { onSuccess: () => setEditor(null) },
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Tabelas de preço</CardTitle>
              <CardDescription>Cada tabela é uma porcentagem sobre o preço base do produto. O segmento (ou o contato) escolhe a tabela; o pedido já nasce com o preço certo.</CardDescription>
            </div>
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Nova tabela</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
          ) : tables.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nenhuma tabela ainda: todo pedido usa o preço base do produto.</p>
          ) : (
            <div className="space-y-2">
              {tables.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${t.is_active ? '' : 'text-muted-foreground line-through'}`}>{t.name}</p>
                    <p className="text-xs text-muted-foreground">{percentLabel(Number(t.percent))}</p>
                  </div>
                  {t.is_default && <Badge variant="secondary" className="text-[10px]">padrão</Badge>}
                  <Switch
                    checked={t.is_active}
                    onCheckedChange={(active) => saveTable.mutate({ id: t.id, name: t.name, percent: Number(t.percent), is_default: t.is_default, is_active: active })}
                    aria-label="Ativa"
                  />
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDeleting(t)} aria-label="Apagar"><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {activeTable && (
        <PriceExceptions
          tables={tables}
          table={activeTable}
          onChangeTable={setExceptionsFor}
        />
      )}

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Editar tabela' : 'Nova tabela de preço'}</DialogTitle>
            <DialogDescription>Porcentagem positiva aumenta, negativa desconta. 0 = o próprio preço base.</DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} maxLength={60} placeholder="Ex.: Salão" />
              </div>
              <div className="space-y-1.5">
                <Label>Porcentagem sobre o preço base</Label>
                <Input type="number" step="0.01" value={editor.percent} onChange={(e) => setEditor({ ...editor, percent: e.target.value })} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={editor.is_default} onCheckedChange={(is_default) => setEditor({ ...editor, is_default })} id="pt-default" />
                <Label htmlFor="pt-default">Tabela padrão da empresa (quem não tem segmento nem tabela própria usa esta)</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditor(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!canSave}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar a tabela "{deleting?.name}"?</DialogTitle>
            <DialogDescription>Segmentos e contatos que a usavam voltam para a tabela padrão; pedidos já montados não mudam de preço.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteTable.isPending} onClick={() => deleting && deleteTable.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Preço por produto na tabela escolhida: o calculado, e a exceção quando houver. */
function PriceExceptions({ tables, table, onChangeTable }: { tables: CRMPriceTable[]; table: CRMPriceTable; onChangeTable: (id: string) => void }) {
  const { data: products = [], isLoading } = useProductsWithPrice(table.id);
  const { data: items = [] } = usePriceTableItems(table.id);
  const saveItem = useSavePriceTableItem();
  const deleteItem = useDeletePriceTableItem();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const commit = (productId: string) => {
    const raw = drafts[productId];
    if (raw === undefined) return;
    const price = Number(raw);
    if (!Number.isFinite(price) || price < 0) return;
    saveItem.mutate({ price_table_id: table.id, product_id: productId, price }, {
      onSuccess: () => setDrafts((d) => { const c = { ...d }; delete c[productId]; return c; }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Preços na tabela</CardTitle>
            <CardDescription>O preço calculado pela porcentagem, produto a produto. Digite um valor para abrir exceção; a seta desfaz.</CardDescription>
          </div>
          <Select value={table.id} onValueChange={onChangeTable}>
            <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : products.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Cadastre produtos em Comercial → Produtos para ver os preços aqui.</p>
        ) : (
          <div className="space-y-1.5">
            {products.map((p) => {
              const item = items.find((i) => i.product_id === p.id);
              return (
                <div key={p.id} className="grid grid-cols-12 items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <div className="col-span-5 min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">base {formatBRL(Number(p.base_price))}</p>
                  </div>
                  <div className="col-span-3 text-right">
                    <span className={p.is_exception ? 'font-semibold' : ''}>{formatBRL(Number(p.price))}</span>
                    {p.is_exception && <Badge variant="outline" className="ml-2 text-[10px]">exceção</Badge>}
                  </div>
                  <div className="col-span-3">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="exceção"
                      value={drafts[p.id] ?? ''}
                      onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                      onBlur={() => commit(p.id)}
                      onKeyDown={(e) => e.key === 'Enter' && commit(p.id)}
                      className="h-8"
                    />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {item && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Desfazer exceção" onClick={() => deleteItem.mutate({ id: item.id, price_table_id: table.id })}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
