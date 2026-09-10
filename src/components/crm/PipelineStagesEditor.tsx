import { useEffect, useMemo, useState } from 'react';
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  useCRMPipelines, useCRMStages, useSavePipeline, useSaveStages, useDeleteStage,
  type CRMStage, type StageInput, type StageKind,
} from '@/hooks/useCRM';
import { STAGE_COLORS, STAGE_KIND_LABELS } from '@/lib/crm';

type Row = StageInput & { key: string };

const EMPTY_STAGES: CRMStage[] = [];

function toRows(stages: CRMStage[]): Row[] {
  return stages.map((s) => ({
    key: s.id, id: s.id, pipeline_id: s.pipeline_id, name: s.name, color: s.color, kind: s.kind as StageKind, position: s.position,
  }));
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="Cor da etapa">
      {Object.entries(STAGE_COLORS).map(([name, c]) => (
        <button
          key={name}
          type="button"
          role="radio"
          aria-checked={value === name}
          title={c.label}
          onClick={() => onChange(name)}
          className={cn('h-4 w-4 rounded-full transition-transform', c.dot, value === name ? 'ring-2 ring-ring ring-offset-1 ring-offset-background scale-110' : 'opacity-70 hover:opacity-100')}
        />
      ))}
    </div>
  );
}

function StageRow({
  row, canBeWon, canBeLost, onChange, onDelete,
}: {
  row: Row; canBeWon: boolean; canBeLost: boolean;
  onChange: (patch: Partial<Row>) => void; onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <div ref={setNodeRef} style={style} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
      <button type="button" className="cursor-grab text-muted-foreground touch-none" {...attributes} {...listeners} aria-label="Arrastar">
        <GripVertical className="h-4 w-4" />
      </button>
      <ColorPicker value={row.color} onChange={(color) => onChange({ color })} />
      <Input value={row.name} onChange={(e) => onChange({ name: e.target.value })} className="max-w-xs" maxLength={60} placeholder="Nome da etapa" />
      <Select value={row.kind} onValueChange={(kind) => onChange({ kind: kind as StageKind })}>
        <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="open">{STAGE_KIND_LABELS.open}</SelectItem>
          <SelectItem value="won" disabled={!canBeWon && row.kind !== 'won'}>{STAGE_KIND_LABELS.won}</SelectItem>
          <SelectItem value="lost" disabled={!canBeLost && row.kind !== 'lost'}>{STAGE_KIND_LABELS.lost}</SelectItem>
        </SelectContent>
      </Select>
      {row.kind === 'open' ? (
        <Button variant="ghost" size="icon" className="ml-auto h-8 w-8 text-muted-foreground" onClick={onDelete} aria-label="Apagar etapa">
          <Trash2 className="h-4 w-4" />
        </Button>
      ) : (
        <Badge variant="outline" className="ml-auto text-[10px]">fixa</Badge>
      )}
    </div>
  );
}

/**
 * Configurações do Comercial → aba "Funil" (E1). Escolhe o funil, edita as
 * etapas (nome, cor, tipo, ordem por arrastar), cria etapa e funil, apaga
 * etapa movendo os negócios. Um "ganho" e um "perdido" por funil — o banco
 * garante; aqui só se evita oferecer o que ele recusaria.
 */
export function PipelineStagesEditor() {
  const { data: pipelines = [], isLoading: pipelinesLoading } = useCRMPipelines();
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const activePipeline = pipelineId ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id;
  // Referência estável enquanto a consulta não respondeu: `= []` inline criaria
  // uma lista nova a cada render e o useEffect abaixo entraria em laço infinito
  // (a aba congelava ao abrir "Funil").
  const { data: stages = EMPTY_STAGES, isLoading: stagesLoading } = useCRMStages(activePipeline);

  const savePipeline = useSavePipeline();
  const saveStages = useSaveStages();
  const deleteStage = useDeleteStage();

  const [rows, setRows] = useState<Row[]>([]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    setRows(toRows(stages));
    setDirty(false);
  }, [stages]);

  const [newPipelineOpen, setNewPipelineOpen] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [moveTo, setMoveTo] = useState<string | undefined>();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const hasWon = rows.some((r) => r.kind === 'won');
  const hasLost = rows.some((r) => r.kind === 'lost');
  const canSave = dirty && rows.every((r) => r.name.trim().length > 0) && !saveStages.isPending;

  const update = (key: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((prev) => {
      const from = prev.findIndex((r) => r.key === active.id);
      const to = prev.findIndex((r) => r.key === over.id);
      return arrayMove(prev, from, to);
    });
    setDirty(true);
  };

  const addRow = () => {
    if (!activePipeline) return;
    const key = `new-${Date.now()}`;
    setRows((prev) => [...prev, { key, pipeline_id: activePipeline, name: '', color: 'slate', kind: 'open', position: prev.length + 1 }]);
    setDirty(true);
  };

  const removeRow = (row: Row) => {
    if (!row.id) {
      setRows((prev) => prev.filter((r) => r.key !== row.key));
      return;
    }
    setMoveTo(rows.find((r) => r.id && r.id !== row.id && r.kind === 'open')?.id);
    setDeleting(row);
  };

  const confirmDelete = () => {
    if (!deleting?.id) return;
    deleteStage.mutate({ id: deleting.id, moveTo }, { onSuccess: () => setDeleting(null) });
  };

  const handleSave = () => {
    saveStages.mutate(rows.map((r, i) => ({ ...r, name: r.name.trim(), position: i + 1 })));
  };

  const createPipeline = () => {
    const name = newPipelineName.trim();
    if (!name) return;
    savePipeline.mutate({ name }, {
      onSuccess: (id) => {
        setPipelineId(id);
        setNewPipelineOpen(false);
        setNewPipelineName('');
      },
    });
  };

  const destinationOptions = useMemo(
    () => rows.filter((r) => r.id && r.id !== deleting?.id),
    [rows, deleting],
  );

  const isLoading = pipelinesLoading || stagesLoading;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Etapas do funil</CardTitle>
            <CardDescription>Arraste para ordenar. Cada funil tem um "Ganho" e um "Perdido"; o resto é seu.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={activePipeline ?? ''} onValueChange={setPipelineId}>
              <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Funil" /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.is_default ? ' (padrão)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => setNewPipelineOpen(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Novo funil
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Carregando...</div>
        ) : (
          <div className="space-y-2">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={rows.map((r) => r.key)} strategy={verticalListSortingStrategy}>
                {rows.map((row) => (
                  <StageRow
                    key={row.key}
                    row={row}
                    canBeWon={!hasWon}
                    canBeLost={!hasLost}
                    onChange={(patch) => update(row.key, patch)}
                    onDelete={() => removeRow(row)}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" size="sm" onClick={addRow}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Etapa
              </Button>
              <Button size="sm" onClick={handleSave} disabled={!canSave}>Salvar etapas</Button>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={newPipelineOpen} onOpenChange={setNewPipelineOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo funil</DialogTitle>
            <DialogDescription>Um funil por produto, canal ou equipe. Ele nasce vazio: crie as etapas em seguida.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={newPipelineName} onChange={(e) => setNewPipelineName(e.target.value)} maxLength={60} placeholder="Ex.: Funil B2B" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewPipelineOpen(false)}>Cancelar</Button>
            <Button onClick={createPipeline} disabled={!newPipelineName.trim() || savePipeline.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apagar a etapa "{deleting?.name}"?</DialogTitle>
            <DialogDescription>Se houver negócios nela, eles vão para a etapa escolhida abaixo. A mudança fica na linha do tempo de cada um.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Mover os negócios para</Label>
            <Select value={moveTo ?? ''} onValueChange={setMoveTo}>
              <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
              <SelectContent>
                {destinationOptions.map((r) => <SelectItem key={r.id} value={r.id!}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteStage.isPending}>Apagar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
