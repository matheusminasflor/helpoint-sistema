import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WorkOSPageHeader } from '@/components/workos/WorkOSPageHeader';
import { SupplierTable } from '@/components/mkt/SupplierTable';
import { SupplierForm } from '@/components/mkt/SupplierForm';
import { useSuppliers } from '@/hooks/useSuppliers';
import type { Supplier } from '@/types/suppliers';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';

export default function Fornecedores() {
  // A mesma tela abre pelo Marketing e por Compras: vale a caixinha de qualquer um dos dois,
  // como a policy de `suppliers` (20261124010000).
  const { can: noMkt } = useDepartmentPermissions('marketing');
  const { can: emCompras } = useDepartmentPermissions('compras');
  const pode = (acao: string) => noMkt('suppliers', acao) || emCompras('fornecedores', acao);
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
        action={pode('create') ? (
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Fornecedor
          </Button>
        ) : undefined}
      />

      <div className="px-6">
        <SupplierTable
          suppliers={suppliers || []}
          isLoading={isLoading}
          onEdit={handleEdit}
          podeEditar={pode('edit')}
          podeExcluir={pode('delete')}
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
