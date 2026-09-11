import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { KanbanSquare, Plus, Search, Trophy, XCircle } from 'lucide-react';
import { DndContext, useDraggable, useDroppable, type DragEndEvent, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useCRMPipelines, useCRMStages, useCRMDeals, useMoveDeal, useClosedDeals, type CRMDealWithRelations } from '@/hooks/useCRM';
import { formatBRL, STAGE_COLORS } from '@/lib/crm';
import { DealDialog } from '@/components/crm/DealDialog';
import { ComercialSetupWizard } from '@/components/crm/ComercialSetupWizard';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

function daysSince(dateISO: string): string {
  const days = Math.floor((Date.now() - new Date(dateISO).getTime()) / 86_400_000);
  if (days <= 0) return 'hoje';
  return `há ${days}d`;
}

function DealCard({ deal }: { deal: CRMDealWithRelations }) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && navigate(tenantPath(`/comercial/negocios/${deal.id}`))}
      className="rounded-lg border bg-card p-3 space-y-1.5 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <p className="text-sm font-medium leading-tight">{deal.title}</p>
      <p className="text-xs text-muted-foreground">
        {deal.contact?.name}
        {deal.contact?.company ? ` — ${deal.contact.company}` : ''}
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="text-sm font-semibold">{formatBRL(deal.value)}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-muted-foreground">{daysSince(deal.updated_at)}</span>
          <Avatar className="h-5 w-5">
            <AvatarFallback className="text-[10px]">{getInitials(deal.owner?.full_name)}</AvatarFallback>
          </Avatar>
        </div>
      </div>
    </div>
  );
}

function StageColumn({ stageId, name, color, deals }: { stageId: string; name: string; color: string; deals: CRMDealWithRelations[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const total = deals.reduce((sum, d) => sum + d.value, 0);
  const palette = STAGE_COLORS[color] ?? STAGE_COLORS.slate;

  return (
    <div className="flex flex-col w-72 shrink-0">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} aria-hidden />
          {name}
        </h3>
        <span className="text-xs text-muted-foreground">{deals.length} · {formatBRL(total)}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 rounded-lg p-2 min-h-[120px] transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/30' : palette.soft}`}
      >
        {deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}
      </div>
    </div>
  );
}

function ClosedStageCounter({ stageId, name, icon: Icon }: { stageId: string; name: string; icon: typeof Trophy }) {
  const { setNodeRef, isOver } = useDroppable({ id: stageId });
  const { data: closedDeals = [], isLoading } = useClosedDeals(stageId);
  const total = closedDeals.reduce((sum, d) => sum + d.value, 0);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          ref={setNodeRef}
          className={`flex flex-col w-40 shrink-0 rounded-lg border p-3 text-left transition-colors ${isOver ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-card hover:bg-muted/50'}`}
        >
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <Icon className="h-3.5 w-3.5" /> {name}
          </div>
          <span className="text-xs text-muted-foreground mt-1">
            {isLoading ? '...' : `${closedDeals.length} nos últimos 30 dias`}
          </span>
          <span className="text-xs font-medium">{formatBRL(total)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72">
        <p className="text-xs font-semibold text-muted-foreground mb-2">{name} — últimos 30 dias</p>
        {closedDeals.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum negócio.</p>
        ) : (
          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {closedDeals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between text-xs">
                <span className="truncate">{deal.title}</span>
                <span className="font-medium shrink-0 ml-2">{formatBRL(deal.value)}</span>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default function ComercialFunil() {
  const { user } = useAuth();
  const { isManagerOrHigher } = useVisibleModules();
  const { data: pipelines = [], isLoading: pipelinesLoading } = useCRMPipelines();
  const { data: allStages = [], isLoading: stagesLoading } = useCRMStages();
  const { data: deals = [], isLoading: dealsLoading } = useCRMDeals();
  const moveDeal = useMoveDeal();

  // O funil escolhido vive na URL (`?funil=`): recarregar ou compartilhar o link mantém a escolha.
  const [searchParams, setSearchParams] = useSearchParams();
  const pipelineId = searchParams.get('funil') ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id;
  const stages = useMemo(() => allStages.filter((s) => s.pipeline_id === pipelineId), [allStages, pipelineId]);

  const [ownerFilter, setOwnerFilter] = useState<'mine' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [dealDialogOpen, setDealDialogOpen] = useState(false);
  const [dealDialogStageId, setDealDialogStageId] = useState<string | undefined>();

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const openStages = useMemo(
    () => stages.filter((s) => s.kind === 'open').sort((a, b) => a.position - b.position),
    [stages],
  );
  const wonStage = stages.find((s) => s.kind === 'won');
  const lostStage = stages.find((s) => s.kind === 'lost');

  const filteredDeals = useMemo(() => {
    const term = search.trim().toLowerCase();
    const stageIds = new Set(stages.map((s) => s.id));
    return deals.filter((d) => {
      if (!stageIds.has(d.stage_id)) return false;
      if (ownerFilter === 'mine' && d.owner_id !== user?.id) return false;
      if (!term) return true;
      return (
        d.title.toLowerCase().includes(term) ||
        (d.contact?.name ?? '').toLowerCase().includes(term) ||
        (d.contact?.company ?? '').toLowerCase().includes(term)
      );
    });
  }, [deals, stages, ownerFilter, search, user?.id]);

  const dealsByStage = useMemo(() => {
    const map = new Map<string, CRMDealWithRelations[]>();
    for (const deal of filteredDeals) {
      const list = map.get(deal.stage_id) ?? [];
      list.push(deal);
      map.set(deal.stage_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [filteredDeals]);

  const openNewDeal = (stageId?: string) => {
    setDealDialogStageId(stageId ?? openStages[0]?.id);
    setDealDialogOpen(true);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const deal = deals.find((d) => d.id === active.id);
    const targetStageId = String(over.id);
    if (!deal || deal.stage_id === targetStageId) return;
    const targetCount = dealsByStage.get(targetStageId)?.length ?? 0;
    moveDeal.mutate({ id: deal.id, stage_id: targetStageId, position: targetCount });
  };

  const isLoading = pipelinesLoading || stagesLoading || dealsLoading;

  // Empresa sem funil ainda (CRM-1b): o assistente monta; quem não é gerente vê o aviso.
  if (!pipelinesLoading && pipelines.length === 0) {
    return (
      <div className="flex flex-col min-h-full">
        <PageHeader title="Funil" description="Negócios em andamento, por etapa." icon={KanbanSquare} />
        <div className="p-4 lg:p-6">
          <ComercialSetupWizard canConfigure={isManagerOrHigher} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Funil"
        description="Negócios em andamento, por etapa."
        icon={KanbanSquare}
        actions={
          <Button onClick={() => openNewDeal()}>
            <Plus className="w-4 h-4 mr-1.5" /> Novo negócio
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {pipelines.length > 1 && (
            <Select value={pipelineId ?? ''} onValueChange={(v) => setSearchParams({ funil: v })}>
              <SelectTrigger className="w-52 h-9"><SelectValue placeholder="Funil" /></SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar negócio ou contato"
              className="pl-8 max-w-xs"
            />
          </div>
          <div className="flex rounded-lg border p-0.5">
            <Button
              size="sm"
              variant={ownerFilter === 'mine' ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setOwnerFilter('mine')}
            >
              Meus
            </Button>
            <Button
              size="sm"
              variant={ownerFilter === 'all' ? 'default' : 'ghost'}
              className="h-7"
              onClick={() => setOwnerFilter('all')}
            >
              Todos
            </Button>
          </div>
        </div>
      </PageHeader>

      <div className="p-4 lg:p-6 flex-1 overflow-x-auto">
        {isLoading ? (
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-80 w-72" />)}
          </div>
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="flex gap-4 items-start">
              {openStages.map((stage) => (
                <StageColumn
                  key={stage.id}
                  stageId={stage.id}
                  name={stage.name}
                  color={stage.color}
                  deals={dealsByStage.get(stage.id) ?? []}
                />
              ))}
              <div className="flex flex-col gap-2 pt-7">
                {wonStage && <ClosedStageCounter stageId={wonStage.id} name={wonStage.name} icon={Trophy} />}
                {lostStage && <ClosedStageCounter stageId={lostStage.id} name={lostStage.name} icon={XCircle} />}
              </div>
            </div>
          </DndContext>
        )}
      </div>

      <DealDialog open={dealDialogOpen} onOpenChange={setDealDialogOpen} defaultPipelineId={pipelineId} defaultStageId={dealDialogStageId} />
    </div>
  );
}
