import { PageHeader } from '@/components/layout/PageHeader';
import { Megaphone } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';

export default function MKTConfiguracoes() {
  const { can } = useDepartmentPermissions('marketing');
  const canEdit = can('categories', 'edit') || can('categories', 'create');

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Megaphone}
        title="Configurações de Marketing"
        description="Gerencie categorias, subcategorias e formulários das solicitações de Marketing"
      />

      <Card>
        <CardHeader>
          <CardTitle>Categorias de Marketing</CardTitle>
          <CardDescription>
            Defina as categorias e subcategorias das demandas e personalize o formulário de cada categoria.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryManager module="marketing" allowForms readOnly={!canEdit} emptyLabel="o Marketing" />
        </CardContent>
      </Card>
    </div>
  );
}
