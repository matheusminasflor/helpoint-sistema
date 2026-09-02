import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { SupplierTable } from '@/components/mkt/SupplierTable';
import { SupplierForm } from '@/components/mkt/SupplierForm';
import { useMKTSuppliers } from '@/hooks/useMKTSuppliers';
import type { MKTSupplier } from '@/types/mkt-expanded';

export default function MKTSuppliers() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<MKTSupplier | null>(null);
  const { data: suppliers, isLoading } = useMKTSuppliers();

  const handleEdit = (supplier: MKTSupplier) => {
    setEditingSupplier(supplier);
    setIsFormOpen(true);
  };

  const handleClose = () => {
    setIsFormOpen(false);
    setEditingSupplier(null);
  };

  return (
    <div className="space-y-6">
      <WorkOSPageHeader
        icon={Truck}
        title="Fornecedores"
        description="Gerencie seus fornecedores de marketing e publicidade"
        action={
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Fornecedor
          </Button>
        }
      />

      <div className="px-6">
        <SupplierTable
          suppliers={suppliers || []}
          isLoading={isLoading}
          onEdit={handleEdit}
        />
      </div>

      <SupplierForm
        open={isFormOpen}
        onClose={handleClose}
        supplier={editingSupplier}
      />
    </div>
  );
}
