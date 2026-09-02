import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ContractTable } from '@/components/contracts/ContractTable';
import { ContractDetail } from '@/components/contracts/ContractDetail';
import { ContractForm } from '@/components/contracts/ContractForm';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { WorkOSStatsCard } from '@/components/workos/WorkOSStatsCard';
import { useContracts, useContractMutations } from '@/hooks/useContracts';
import { useAuth } from '@/contexts/AuthContext';
import { SoftwareContract } from '@/types/it-management';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryState } from '@/hooks/useQueryState';
import { toast } from 'sonner';
import { Plus, FileText, CheckCircle, AlertTriangle, XCircle, ArrowLeft, Search } from 'lucide-react';

type ViewMode = 'list' | 'detail' | 'form';

export default function Contracts() {
  const { role } = useAuth();
  const { data: contracts = [], isLoading, refetch } = useContracts();
  const { createContract, updateContract, deleteContract } = useContractMutations();

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedContract, setSelectedContract] = useState<SoftwareContract | null>(null);
  const [editingContract, setEditingContract] = useState<SoftwareContract | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [search, setSearch] = useQueryState<string>('busca', '');
  const [statusFilter, setStatusFilter] = useQueryState<string>('status', 'todos');
  const [sort, setSort] = useQueryState<string>('ordem', 'vencimento');

  const canCreate = role === 'owner' || role === 'admin' || role === 'manager';
  const canEdit = role === 'owner' || role === 'admin' || role === 'manager';
  const canDelete = role === 'owner' || role === 'admin';

  const activeCount = contracts.filter(c => c.status === 'active').length;
  const expiringCount = contracts.filter(c => c.status === 'expiring').length;
  const expiredCount = contracts.filter(c => c.status === 'expired').length;

  const visibleContracts = useMemo(() => {
    const q = search.toLowerCase().trim();
    let rows = contracts.filter(c => {
      if (statusFilter !== 'todos' && c.status !== statusFilter) return false;
      if (!q) return true;
      return (c.name || '').toLowerCase().includes(q) || (c.vendor || '').toLowerCase().includes(q);
    });
    rows = [...rows].sort((a, b) => {
      if (sort === 'nome') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'valor') return (Number(b.value) || 0) - (Number(a.value) || 0);
      return new Date(a.end_date || 0).getTime() - new Date(b.end_date || 0).getTime();
    });
    return rows;
  }, [contracts, search, statusFilter, sort]);

  const handleSelect = (contract: SoftwareContract) => {
    setSelectedContract(contract);
    setViewMode('detail');
  };

  const handleFormSubmit = async (data: any) => {
    try {
      if (editingContract) {
        await updateContract.mutateAsync({ id: editingContract.id, ...data });
        toast.success('Contrato atualizado');
      } else {
        await createContract.mutateAsync(data);
        toast.success('Contrato criado');
      }
      setViewMode('list');
      refetch();
    } catch (error: any) {
      console.error('[Contratos] erro ao salvar:', error);
      toast.error(error?.message || 'Erro ao salvar contrato', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedContract) return;
    try {
      await deleteContract.mutateAsync(selectedContract.id);
      toast.success('Contrato excluído');
      setDeleteDialogOpen(false);
      setViewMode('list');
      refetch();
    } catch (error: any) {
      console.error('[Contratos] erro ao excluir:', error);
      toast.error(error?.message || 'Erro ao excluir contrato', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  if (viewMode === 'form') {
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setViewMode(selectedContract ? 'detail' : 'list')} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              {editingContract ? 'Editar Contrato' : 'Novo Contrato'}
            </h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border p-6">
            <ContractForm
              contract={editingContract}
              onSubmit={handleFormSubmit}
              onCancel={() => setViewMode(selectedContract ? 'detail' : 'list')}
              isLoading={createContract.isPending || updateContract.isPending}
            />
          </div>
        </div>
      </WorkOSContainer>
    );
  }

  if (viewMode === 'detail' && selectedContract) {
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => { setViewMode('list'); setSelectedContract(null); }} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Detalhes do Contrato</h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border">
            <ContractDetail
              contract={contracts.find(c => c.id === selectedContract.id) || selectedContract}
              onBack={() => { setViewMode('list'); setSelectedContract(null); }}
              onEdit={() => { setEditingContract(selectedContract); setViewMode('form'); }}
              onDelete={() => setDeleteDialogOpen(true)}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
        </div>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir o contrato "{selectedContract.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                O contrato sai da lista e não pode ser recuperado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">Excluir contrato</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </WorkOSContainer>
    );
  }

  return (
    <WorkOSContainer>
      <WorkOSPageHeader
        icon={FileText}
        title="Contratos de Software"
        description="Gerencie contratos e acompanhe renovações"
        action={
          canCreate && (
            <Button onClick={() => { setEditingContract(null); setViewMode('form'); }} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Contrato
            </Button>
          )
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-px bg-border p-6">
        <WorkOSStatsCard icon={FileText} label="Total" value={contracts.length} />
        <WorkOSStatsCard icon={CheckCircle} label="Ativos" value={activeCount} color="success" />
        <WorkOSStatsCard icon={AlertTriangle} label="Expirando" value={expiringCount} color="warning" />
        <WorkOSStatsCard icon={XCircle} label="Expirados" value={expiredCount} color="danger" />
      </div>

      {/* Filtros */}
      <div className="px-6 pb-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input className="pl-8 h-9" placeholder="Buscar por contrato ou fornecedor" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="active">Ativos</SelectItem>
            <SelectItem value="expiring">Expirando</SelectItem>
            <SelectItem value="expired">Expirados</SelectItem>
            <SelectItem value="cancelled">Cancelados</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger className="w-[180px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="vencimento">Vencimento mais próximo</SelectItem>
            <SelectItem value="nome">Nome (A-Z)</SelectItem>
            <SelectItem value="valor">Maior valor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        <div className="bg-card border border-border">
          <ContractTable contracts={visibleContracts} onSelect={handleSelect} isLoading={isLoading} />
        </div>
      </div>
    </WorkOSContainer>
  );
}
