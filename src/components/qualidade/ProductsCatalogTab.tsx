import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Package, Tag } from 'lucide-react';

type Product = { id: string; name: string; sku: string | null; is_active: boolean; image_url?: string | null };

async function resizeTo800(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 800;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 800, 800);
      const scale = Math.min(800 / img.width, 800 / img.height);
      const w = img.width * scale, h = img.height * scale;
      ctx.drawImage(img, (800 - w) / 2, (800 - h) / 2, w, h);
      canvas.toBlob(b => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('canvas failed')); }, 'image/jpeg', 0.85);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('invalid image')); };
    img.src = url;
  });
}
type Batch = {
  id: string; product_id: string; batch_code: string;
  manufactured_at: string | null; expires_at: string | null; is_active: boolean;
};

export function ProductsCatalogTab() {
  const { tenantId } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<Record<string, Batch[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editingProd, setEditingProd] = useState<Partial<Product> | null>(null);
  const [editingBatch, setEditingBatch] = useState<(Partial<Batch> & { product_id: string }) | null>(null);

  const loadProducts = async () => {
    const { data, error } = await supabase.from('sac_products').select('*').order('name');
    if (error) { toast.error(error.message); return; }
    setProducts((data || []) as Product[]);
  };
  const loadBatches = async (productId: string) => {
    const { data, error } = await supabase.from('sac_product_batches').select('*').eq('product_id', productId).order('batch_code');
    if (error) { toast.error(error.message); return; }
    setBatches(p => ({ ...p, [productId]: (data || []) as Batch[] }));
  };

  useEffect(() => { if (tenantId) loadProducts(); }, [tenantId]);

  const toggleExpand = async (p: Product) => {
    const open = !expanded[p.id];
    setExpanded(prev => ({ ...prev, [p.id]: open }));
    if (open && !batches[p.id]) await loadBatches(p.id);
  };

  const saveProduct = async () => {
    if (!editingProd?.name) return toast.error('Nome obrigatório');
    if (editingProd.id) {
      const { error } = await supabase.from('sac_products').update({
        name: editingProd.name, sku: editingProd.sku || null, is_active: editingProd.is_active ?? true,
        image_url: editingProd.image_url ?? null,
      }).eq('id', editingProd.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('sac_products').insert({
        tenant_id: tenantId!, name: editingProd.name, sku: editingProd.sku || null, is_active: true,
        image_url: editingProd.image_url ?? null,
      });
      if (error) return toast.error(error.message);
    }
    toast.success('Salvo'); setEditingProd(null); loadProducts();
  };

  const uploadProductImage = async (file: File) => {
    try {
      const blob = await resizeTo800(file);
      const path = `${tenantId}/products/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('sac-attachments').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
      if (error) throw error;
      const { signedUrl } = unwrap(await supabase.storage.from('sac-attachments').createSignedUrl(path, 60 * 60 * 24 * 365 * 5));
      if (!signedUrl) throw new Error('Não foi possível gerar URL.');
      setEditingProd(p => ({ ...p, image_url: signedUrl }));
      toast.success('Imagem carregada (800×800).');
    } catch (e: any) {
      toast.error('Falha ao processar imagem: ' + (e.message || ''));
    }
  };

  const removeProduct = async (id: string) => {
    if (!confirm('Remover produto e todos os seus lotes?')) return;
    const { error } = await supabase.from('sac_products').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Removido'); loadProducts();
  };

  const toggleProduct = async (p: Product) => {
    await supabase.from('sac_products').update({ is_active: !p.is_active }).eq('id', p.id);
    loadProducts();
  };

  const saveBatch = async () => {
    if (!editingBatch?.batch_code) return toast.error('Código do lote obrigatório');
    if (editingBatch.id) {
      const { error } = await supabase.from('sac_product_batches').update({
        batch_code: editingBatch.batch_code,
        manufactured_at: editingBatch.manufactured_at || null,
        expires_at: editingBatch.expires_at || null,
        is_active: editingBatch.is_active ?? true,
      }).eq('id', editingBatch.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('sac_product_batches').insert({
        tenant_id: tenantId!, product_id: editingBatch.product_id,
        batch_code: editingBatch.batch_code,
        manufactured_at: editingBatch.manufactured_at || null,
        expires_at: editingBatch.expires_at || null,
        is_active: true,
      });
      if (error) return toast.error(error.message);
    }
    toast.success('Salvo');
    const pid = editingBatch.product_id;
    setEditingBatch(null); loadBatches(pid);
  };

  const removeBatch = async (b: Batch) => {
    if (!confirm('Remover lote?')) return;
    const { error } = await supabase.from('sac_product_batches').delete().eq('id', b.id);
    if (error) return toast.error(error.message);
    loadBatches(b.product_id);
  };

  const toggleBatch = async (b: Batch) => {
    await supabase.from('sac_product_batches').update({ is_active: !b.is_active }).eq('id', b.id);
    loadBatches(b.product_id);
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold">Produtos & Lotes</h2>
          <p className="text-xs text-muted-foreground">Cadastre os produtos e seus lotes. O cliente escolherá no formulário do SAC.</p>
        </div>
        <Button onClick={() => setEditingProd({ name: '', sku: '', is_active: true })}>
          <Plus className="w-4 h-4 mr-1" />Novo produto
        </Button>
      </div>

      <div className="space-y-1">
        {products.map(p => (
          <div key={p.id} className="border rounded-md overflow-hidden">
            <div className="flex items-center gap-2 p-3 hover:bg-surface-2">
              <button onClick={() => toggleExpand(p)} className="p-1">
                {expanded[p.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {p.image_url ? (
                <img src={p.image_url} alt={p.name} className="w-10 h-10 rounded object-cover border bg-white shrink-0" />
              ) : (
                <Package className="w-4 h-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{p.name}</div>
                {p.sku && <div className="text-xs text-muted-foreground">SKU: {p.sku}</div>}
              </div>
              {!p.is_active && <Badge variant="secondary">inativo</Badge>}
              <Switch checked={p.is_active} onCheckedChange={() => toggleProduct(p)} />
              <Button size="sm" variant="ghost" onClick={() => setEditingProd(p)}><Pencil className="w-3.5 h-3.5" /></Button>
              <Button size="sm" variant="ghost" onClick={() => removeProduct(p.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
            </div>
            {expanded[p.id] && (
              <div className="border-t bg-surface-1/30 p-3 space-y-1">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">Lotes</span>
                  <Button size="sm" variant="outline" onClick={() => setEditingBatch({ product_id: p.id, batch_code: '', is_active: true })}>
                    <Plus className="w-3 h-3 mr-1" />Novo lote
                  </Button>
                </div>
                {(batches[p.id] || []).map(b => (
                  <div key={b.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-2 text-sm">
                    <Tag className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="font-mono">{b.batch_code}</span>
                    {b.manufactured_at && <span className="text-xs text-muted-foreground">Fab: {b.manufactured_at}</span>}
                    {b.expires_at && <span className="text-xs text-muted-foreground">Val: {b.expires_at}</span>}
                    <div className="flex-1" />
                    {!b.is_active && <Badge variant="secondary" className="text-[10px] h-4">inativo</Badge>}
                    <Switch checked={b.is_active} onCheckedChange={() => toggleBatch(b)} />
                    <Button size="sm" variant="ghost" onClick={() => setEditingBatch(b)}><Pencil className="w-3 h-3" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => removeBatch(b)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                  </div>
                ))}
                {(batches[p.id] || []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">Nenhum lote cadastrado.</p>
                )}
              </div>
            )}
          </div>
        ))}
        {products.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">Nenhum produto cadastrado.</div>
        )}
      </div>

      <Dialog open={!!editingProd} onOpenChange={(o) => !o && setEditingProd(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingProd?.id ? 'Editar' : 'Novo'} produto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome *</Label><Input value={editingProd?.name || ''} onChange={e => setEditingProd(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>SKU / Código (opcional)</Label><Input value={editingProd?.sku || ''} onChange={e => setEditingProd(p => ({ ...p, sku: e.target.value }))} /></div>
            <div>
              <Label>Imagem do produto (800×800)</Label>
              <div className="flex items-center gap-3 mt-1">
                {editingProd?.image_url ? (
                  <img src={editingProd.image_url} alt="" className="w-20 h-20 rounded border object-cover bg-white" />
                ) : (
                  <div className="w-20 h-20 rounded border bg-surface-2 flex items-center justify-center text-xs text-muted-foreground">sem foto</div>
                )}
                <div className="flex flex-col gap-1">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 h-9 rounded-md border border-border text-[13px] hover:bg-surface-2 w-fit">
                    <Plus className="w-3 h-3" />
                    {editingProd?.image_url ? 'Trocar imagem' : 'Enviar imagem'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadProductImage(f); e.target.value = ''; }} />
                  </label>
                  {editingProd?.image_url && (
                    <button type="button" className="text-xs text-destructive hover:underline w-fit" onClick={() => setEditingProd(p => ({ ...p, image_url: null }))}>Remover imagem</button>
                  )}
                  <p className="text-[11px] text-muted-foreground">Será redimensionada e centralizada em 800×800 com fundo branco.</p>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProd(null)}>Cancelar</Button>
            <Button onClick={saveProduct}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingBatch} onOpenChange={(o) => !o && setEditingBatch(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingBatch?.id ? 'Editar' : 'Novo'} lote</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código do lote *</Label><Input value={editingBatch?.batch_code || ''} onChange={e => setEditingBatch(p => p && ({ ...p, batch_code: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data de fabricação</Label><Input type="date" value={editingBatch?.manufactured_at || ''} onChange={e => setEditingBatch(p => p && ({ ...p, manufactured_at: e.target.value }))} /></div>
              <div><Label>Validade</Label><Input type="date" value={editingBatch?.expires_at || ''} onChange={e => setEditingBatch(p => p && ({ ...p, expires_at: e.target.value }))} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingBatch(null)}>Cancelar</Button>
            <Button onClick={saveBatch}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
