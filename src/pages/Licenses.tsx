import { useState } from 'react';
import { useQueryState } from '@/hooks/useQueryState';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { LicenseTable } from '@/components/licenses/LicenseTable';
import { LicenseDetail } from '@/components/licenses/LicenseDetail';
import { LicenseForm } from '@/components/licenses/LicenseForm';
import { LicenseAssignDialog } from '@/components/licenses/LicenseAssignDialog';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { WorkOSContainer } from '@/components/workos/WorkOSContainer';
import { WorkOSStatsCard } from '@/components/workos/WorkOSStatsCard';
import { useLicenses, useLicenseMutations } from '@/hooks/useLicenses';
import { LicensesKPIs } from '@/components/licenses/LicensesKPIs';
import { useAuth } from '@/contexts/AuthContext';
import { LicenseWithAssignments } from '@/types/it-management';
import { toast } from 'sonner';
import { Plus, Key, CheckCircle, AlertTriangle, ArrowLeft } from 'lucide-react';

type ViewMode = 'list' | 'detail' | 'form';

export default function Licenses() {
  const { role } = useAuth();
  const { data: licenses = [], isLoading, refetch } = useLicenses();
  const { createLicense, updateLicense, deleteLicense, assignLicense, unassignLicense } = useLicenseMutations();

  const [viewMode, setViewMode] = useQueryState<ViewMode>('vis', 'list');
  const [selectedLicense, setSelectedLicense] = useState<LicenseWithAssignments | null>(null);
  const [editingLicense, setEditingLicense] = useState<LicenseWithAssignments | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);

  const canCreate = role === 'owner' || role === 'admin' || role === 'manager';
  const canEdit = role === 'owner' || role === 'admin' || role === 'manager';
  const canDelete = role === 'owner' || role === 'admin';

  // Stats (seats apenas para software)
  const softwareLicenses = licenses.filter(l => (l.item_category || 'software') === 'software');
  const totalLicenses = softwareLicenses.reduce((sum, l) => sum + l.total_quantity, 0);
  const usedLicenses = softwareLicenses.reduce((sum, l) => sum + l.used_quantity, 0);
  const availableLicenses = totalLicenses - usedLicenses;
  const expiringCount = licenses.filter(l => {
    if (!l.expiry_date) return false;
    const days = Math.ceil((new Date(l.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return days > 0 && days <= 30;
  }).length;

  const handleSelect = (license: LicenseWithAssignments) => {
    setSelectedLicense(license);
    setViewMode('detail');
  };

  const handleCreateNew = () => {
    setEditingLicense(null);
    setViewMode('form');
  };

  const handleEdit = () => {
    setEditingLicense(selectedLicense);
    setViewMode('form');
  };

  const handleFormSubmit = async (data: any) => {
    try {
      if (editingLicense) {
        await updateLicense.mutateAsync({ id: editingLicense.id, ...data });
        toast.success('Licença atualizada com sucesso');
      } else {
        await createLicense.mutateAsync(data);
        toast.success('Licença criada com sucesso');
      }
      setViewMode('list');
      refetch();
    } catch (error: any) {
      console.error('[Licenças] erro ao salvar:', error);
      toast.error(error?.message || 'Erro ao salvar licença', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  const handleDelete = async () => {
    if (!selectedLicense) return;
    try {
      await deleteLicense.mutateAsync(selectedLicense.id);
      toast.success('Licença excluída com sucesso');
      setDeleteDialogOpen(false);
      setViewMode('list');
      setSelectedLicense(null);
      refetch();
    } catch (error: any) {
      console.error('[Licenças] erro ao excluir:', error);
      toast.error(error?.message || 'Erro ao excluir licença', {
        description: error?.details || error?.hint || undefined,
      });
    }
  };

  const handleAssign = async (data: any) => {
    try {
      await assignLicense.mutateAsync(data);
      toast.success('Licença atribuída com sucesso');
      setAssignDialogOpen(false);
      refetch();
    } catch (error) {
      toast.error('Erro ao atribuir licença. Tente novamente ou avise o suporte.');
    }
  };

  const handleUnassign = async (assignmentId: string) => {
    try {
      await unassignLicense.mutateAsync(assignmentId);
      toast.success('Atribuição removida');
      refetch();
    } catch (error) {
      toast.error('Erro ao remover atribuição. Tente novamente ou avise o suporte.');
    }
  };

  if (viewMode === 'form') {
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => setViewMode(selectedLicense ? 'detail' : 'list')} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">
              {editingLicense ? 'Editar Licença' : 'Nova Licença'}
            </h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border p-6">
            <LicenseForm
              license={editingLicense}
              onSubmit={handleFormSubmit}
              onCancel={() => setViewMode(selectedLicense ? 'detail' : 'list')}
              isLoading={createLicense.isPending || updateLicense.isPending}
            />
          </div>
        </div>
      </WorkOSContainer>
    );
  }

  if (viewMode === 'detail' && selectedLicense) {
    const updatedLicense = licenses.find(l => l.id === selectedLicense.id) || selectedLicense;
    return (
      <WorkOSContainer>
        <div className="h-14 px-6 flex items-center border-b border-border bg-card">
          <Button variant="ghost" size="icon" onClick={() => { setViewMode('list'); setSelectedLicense(null); }} className="mr-2">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="p-1.5 rounded bg-primary/10">
              <Key className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Detalhes da Licença</h1>
          </div>
        </div>
        <div className="p-6">
          <div className="bg-card border border-border">
            <LicenseDetail
              license={updatedLicense}
              onBack={() => { setViewMode('list'); setSelectedLicense(null); }}
              onEdit={handleEdit}
              onDelete={() => setDeleteDialogOpen(true)}
              onAssign={() => setAssignDialogOpen(true)}
              onUnassign={handleUnassign}
              canEdit={canEdit}
              canDelete={canDelete}
            />
          </div>
        </div>
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="bg-card border-border">
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir a licença "{selectedLicense.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                A licença e seu histórico de renovações serão removidos. Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                Excluir licença
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <LicenseAssignDialog
          open={assignDialogOpen}
          onOpenChange={setAssignDialogOpen}
          licenseId={selectedLicense.id}
          onAssign={handleAssign}
          isLoading={assignLicense.isPending}
        />
      </WorkOSContainer>
    );
  }

  return (
    <WorkOSContainer>
      <WorkOSPageHeader
        icon={Key}
        title="Licenças de Software"
        description="Gerencie as licenças de software da organização"
        action={
          canCreate && (
            <Button onClick={handleCreateNew} className="gap-2">
              <Plus className="h-4 w-4" />
              Nova Licença
            </Button>
          )
        }
      />

      {/* KPIs */}
      <div className="px-6 pt-6">
        <LicensesKPIs />
      </div>

      {/* Table */}
      <div className="px-6 pb-6">
        <div className="bg-card border border-border">
          <LicenseTable licenses={licenses} onSelect={handleSelect} isLoading={isLoading} />
        </div>
      </div>
    </WorkOSContainer>
  );
}
