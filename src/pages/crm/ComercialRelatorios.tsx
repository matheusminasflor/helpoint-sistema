import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { SalesDashboard } from '@/components/crm/SalesDashboard';

/**
 * Indicadores de venda (E4, `crm_sales_metrics`): funil, ganhos, conversão e
 * ciclo. Os indicadores dos CHAMADOS do Comercial são outra tela
 * (`/comercial/indicadores`), desde que o CRM virou módulo próprio (ADR-009).
 */
export default function ComercialRelatorios() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader title="Indicadores de venda" description="Funil, ganhos, conversão e ciclo de venda." icon={BarChart3} />
      <div className="p-4 lg:p-6 max-w-7xl">
        <SalesDashboard />
      </div>
    </div>
  );
}
