import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCRMPipelines } from '@/hooks/useCRM';
import { useCRMSegments, useDeleteSegment, usePriceTables, useSaveSegment, type CRMSegment } from '@/hooks/useCRMConfig';

const NONE = '__none__';

interface EditorState {
  id?: string;
  name: string;
  pipeline_id: string;
  price_table_id: string;
}

/**
 * Configurações do Comercial → aba "Segmentos" (CRM-1b). Cada segmento diz em
 * que funil o negócio nasce e com que tabela de preço o pedido é montado. O
 * contato escolhe o segmento; o resto o sistema deduz.
 */
export function SegmentsManager() {
  const { data: segments = [], isLoading } = useCRMSegments(true);
  const { data: pipelines = [] } = useCRMPipelines();
  const { data: tables = [] } = usePriceTables(true);
  const saveSegment = useSaveSegment();
  const deleteSegment = useDeleteSegment();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [deleting, setDeleting] = useState<CRMSegment | null>(null);

  const pipelineName = (id: string | null) => pipelines.find((p) => p.id === id)?.name;
  const tableName = (id: string | null) => tables.find((t) => t.id === id)?.name;

  const openNew = () => setEditor({ name: '', pipeline_id: NONE, price_table_id: NONE });
  const openEdit = (s: CRMSegment) => setEditor({ id: s.id, name: s.name, pipeline_id: s.pipeline_id ?? NONE, price_table_id: s.price_table_id ?? NONE });

  const canSave = !!editor && editor.name.trim().length > 0 && !saveSegment.isPending;
  const handleSave = () => {
    if (!editor || !canSave) return;
    saveSegment.mutate(
      {
        id: editor.id,
        name: editor.name.trim(),
        pipeline_id: editor.pipeline_id === NONE ? null : editor.pipeline_id,
        price_table_id: editor.price_table_id === NONE ? null : editor.price_table_id,
        is_active: editor.id ? segments.find((s) => s.id === editor.id)?.is_active ?? true : true,
      },
      { onSuccess: () => setEditor(null) },
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Segmentos de cliente</CardTitle>
            <CardDescription>Ex.: consumidor, salão, distribuidor. O segmento do contato escolhe o funil e a tabela de preço.</CardDescription>
          </div>
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Novo segmento</Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : segments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Nenhum segmento ainda. Sem segmento, todo negócio nasce no funil padrão e o pedido usa a tabela padrão.</p>
        ) : (
          <div className="space-y-2">
            {segments.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${s.is_active ? '' : 'text-muted-foreground line-through'}`}>{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Funil: {pipelineName(s.pipeline_id) ?? 'padrão'} · Tabela: {tableName(s.price_table_id) ?? 'padrão'}
                  </p>
                </div>
                {!s.is_active && <Badge variant="outline" className="text-[10px]">inativo</Badge>}
                <Switch
                  checked={s.is_active}
                  onCheckedChange={(active) => saveSegment.mutate({ id: s.id, name: s.name, pipeline_id: s.pipeline_id, price_table_id: s.price_table_id, is_active: active })}
                  aria-label="Ativo"
                />
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" onClick={() => setDeleting(s)} aria-label="Apagar"><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={!!editor} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editor?.id ? 'Editar segmento' : 'Novo segmento'}</DialogTitle>
            <DialogDescription>Funil e tabela são os padrões do segmento; cada contato pode ter a sua tabela.</DialogDescription>
          </DialogHeader>
          {editor && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome *</Label>
                <Input value={editor.name} onChange={(e) => setEditor({ ...editor, name: e.target.value })} maxLength={60} placeholder="Ex.: Distribuidor" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Funil</Label>
                  <Select value={editor.pipeline_id} onValueChange={(v) => setEditor({ ...editor, pipeline_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Funil padrão</SelectItem>
                      {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Tabela de preço</Label>
                  <Select value={editor.price_table_id} onValueChange={(v) => setEditor({ ...editor, price_table_id: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Tabela padrão</SelectItem>
                      {tables.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
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
            <DialogTitle>Apagar o segmento "{deleting?.name}"?</DialogTitle>
            <DialogDescription>Os contatos dele ficam sem segmento; o funil e a tabela continuam existindo. Para só esconder, desative.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={deleteSegment.isPending} onClick={() => deleting && deleteSegment.mutate(deleting.id, { onSuccess: () => setDeleting(null) })}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
