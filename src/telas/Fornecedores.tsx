import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { SupplierTable } from '@/components/mkt/SupplierTable';
import { SupplierForm } from '@/components/mkt/SupplierForm';
import { useSuppliers } from '@/hooks/useSuppliers';
import type { Supplier } from '@/types/suppliers';

export default function Fornecedores() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const { data: suppliers, isLoading } = useSuppliers();

  const handleEdit = (supplier: Supplier) => {
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
        description="Um cadastro só, da empresa: o Marketing usa nas cotações e as Compras nos orçamentos"
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
