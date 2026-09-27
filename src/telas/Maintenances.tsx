import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { MaintenanceTable } from '@/components/maintenances/MaintenanceTable';
import { MaintenanceDetail } from '@/components/maintenances/MaintenanceDetail';
import { MaintenanceForm } from '@/components/maintenances/MaintenanceForm';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { WorkOSStatsCard } from '@/components/workos/WorkOSStatsCard';
import { useMaintenances, useMaintenanceMutations } from '@/hooks/useMaintenances';
import { useAuth } from '@/contexts/AuthContext';
import { MaintenanceWithDetails } from '@/types/it-management';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryState } from '@/hooks/useQueryState';
import { toast } from 'sonner';
import { Plus, Wrench, Calendar, CheckCircle, Clock, ArrowLeft, Search } from 'lucide-react';

type ViewMode = 'list' | 'detail' | 'form';

export default function Maintenances() {
  const { role } = useAuth();
  const { data: maintenances = [], isLoading, refetch } = useMaintenances();
  const { createMaintenance, updateMaintenance, deleteMaintenance } = useMaintenanceMutations();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedMaintenance, setSelectedMaintenance] = useState<MaintenanceWithDetails | null>(null);
  const [editingMaintenance, setEditingMaintenance] = useState<MaintenanceWithDetails | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [search, setSearch] = useQueryState<string>('busca', '');
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'todos');
  const [typeFilter, setTypeFilter] = useQueryState<string>('tipo', 'todos');
  const [sort, setSort] = useQueryState<string>('ordem', 'recentes');

  const canCreate = ['member', 'manager', 'admin', 'owner'].includes(role || '');
  const canEdit = ['member', 'manager', 'admin', 'owner'].includes(role || '');
  const canDelete = ['admin', 'owner'].includes(role || '');

  const scheduledCount = maintenances.filter(m => m.status === 'scheduled').length;
  const inProgressCount = maintenances.filter(m => m.status === 'in_progress').length;
  const completedCount = maintenances.filter(m => m.status === 'completed').length;

  const visibleMaintenances = useMemo(() => {
    const q = search.toLowerCase().trim();
    const rows = maintenances.filter(m => {
      if (statusFilter !== 'todos' && m.status !== statusFilter) return false;
      if (typeFilter !== 'todos' && m.maintenance_type !== typeFilter) return false;
      if (!q) return true;
      return (m.title || '').toLowerCase().includes(q)
        || (m.asset?.name || '').toLowerCase().includes(q)
        || (m.asset?.asset_tag || '').toLowerCase().includes(q)
        || (m.technician?.full_name || '').toLowerCase().includes(q);
    });
    const dateOf = (m: MaintenanceWithDetails) =>
      new Date(m.completed_date || m.scheduled_date || m.created_at).getTime();
    return [...rows].sort((a, b) => {
      if (sort === 'antigas') return dateOf(a) - dateOf(b);
      if (sort === 'custo') return (Number(b.cost) || 0) - (Number(a.cost) || 0);
      if (sort === 'titulo') return (a.title || '').localeCompare(b.title || '');
      return dateOf(b) - dateOf(a);
    });
  }, [maintenances, search, statusFilter, typeFilter, sort]);

  const handleFormSubmit = async (data: any) => {
    try {
      if (editingMaintenance) {
        await updateMaintenance.mutateAsync({ id: editingMaintenance.id, ...data });
        toast.success('Manutenção atualizada');
      } else {
        await createMaintenance.mutateAsync(data);
        toast.success('Manutenção criada');
      }
      setViewMode('list');
      refetch();
    } catch (error) {
      toast.error('Erro ao salvar manutenção. Tente novamente ou avise o suporte.');
    }
  };

  const handleDelete = async () => {
    if (!selectedMaintenance) return;
    try {
      await deleteMaintenance.mutateAsync(selectedMaintenance.id);
      toast.success('Manutenção excluída');
      setDeleteDialogOpen(false);
      setViewMode('list');
      refetch();
    } catch (error) {
      toast.error('Erro ao excluir. Tente novamente ou avise o suporte.');
    }
  };

  if (viewMode === 'form') {
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setViewMode(selectedMaintenance ? 'detail' : 'list')} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              {editingMaintenance ? 'Editar Manutenção' : 'Nova Manutenção'}
            </h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border p-6">
            <MaintenanceForm
              maintenance={editingMaintenance}
              onSubmit={handleFormSubmit}
              onCancel={() => setViewMode(selectedMaintenance ? 'detail' : 'list')}
              isLoading={createMaintenance.isPending || updateMaintenance.isPending}
            />
          </div>
        </div>
      </WorkOSContainer>
    );
  }

  if (viewMode === 'detail' && selectedMaintenance) {
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => { setViewMode('list'); setSelectedMaintenance(null); }} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <Wrench className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Detalhes da Manutenção</h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border">
            <MaintenanceDetail
              maintenance={maintenances.find(m => m.id === selectedMaintenance.id) || selectedMaintenance}
              onBack={() => { setViewMode('list'); setSelectedMaintenance(null); }}
              onEdit={() => { setEditingMaintenance(selectedMaintenance); setViewMode('form'); }}
              onDelete={() => setDeleteDialogOpen(true)}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
        </div>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a manutenção "{selectedMaintenance?.title}"?</AlertDialogTitle>
              <AlertDialogDescription>O registro sai da lista de manutenções e não pode ser recuperado.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir manutenção</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </WorkOSContainer>
    );
  }

  return (
    <WorkOSContainer>
      <WorkOSPageHeader
        icon={Wrench}
        title="Manutenções"
        description="Histórico de manutenções preventivas e corretivas"
        action={
          canCreate && (
            <Button onClick={() => { setEditingMaintenance(null); setViewMode('form'); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Manutenção
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border p-6">
        <WorkOSStatsCard icon={Wrench} label="Total" value={maintenances.length} />
        <WorkOSStatsCard icon={Calendar} label="Agendadas" value={scheduledCount} color="info" />
        <WorkOSStatsCard icon={Clock} label="Em Andamento" value={inProgressCount} color="warning" />
        <WorkOSStatsCard icon={CheckCircle} label="Concluídas" value={completedCount} color="success" />
      </div>

      {/* Filtros */}
      <div className="px-6 pb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Buscar por título, ativo ou técnico" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="scheduled">Agendadas</SelectItem>
            <SelectItem value="in_progress">Em andamento</SelectItem>
            <SelectItem value="completed">Concluídas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="preventive">Preventiva</SelectItem>
            <SelectItem value="corrective">Corretiva</SelectItem>
            <SelectItem value="upgrade">Upgrade</SelectItem>
            <SelectItem value="cleaning">Limpeza</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="recentes">Mais recentes</SelectItem>
            <SelectItem value="antigas">Mais antigas</SelectItem>
            <SelectItem value="custo">Maior custo</SelectItem>
            <SelectItem value="titulo">Título (A-Z)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        <div className="bg-card border border-border">
          <MaintenanceTable maintenances={visibleMaintenances} onSelect={(m) => { setSelectedMaintenance(m); setViewMode('detail'); }} isLoading={isLoading} />
        </div>
      </div>
    </WorkOSContainer>
  );
}
