import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ModuloRelatorios } from '@/pages/modulo/ModuloRelatorios';
import { SalesDashboard } from '@/components/crm/SalesDashboard';

/** Indicadores do Comercial: "Vendas" (E4, `crm_sales_metrics`) e "Chamados" (o painel genérico de módulo). */
export default function ComercialRelatorios() {
  const [tab, setTab] = useState('vendas');
  return (
    <div className="flex flex-col min-h-full">
      {tab === 'vendas' && (
        <PageHeader title="Indicadores do Comercial" description="Funil, ganhos, conversão e ciclo de venda." icon={BarChart3} />
      )}
      <Tabs value={tab} onValueChange={setTab} className={tab === 'vendas' ? 'p-4 lg:p-6 max-w-7xl' : 'px-6 pt-4 max-w-7xl mx-auto w-full'}>
        <TabsList>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="chamados">Chamados</TabsTrigger>
        </TabsList>
        <TabsContent value="vendas" className="mt-4">
          <SalesDashboard />
        </TabsContent>
        <TabsContent value="chamados" className="mt-0 -mx-6">
          <ModuloRelatorios module="comercial" label="Comercial" subtitle="Orçamentos, pedidos, pós-venda e cadastro de clientes." />
        </TabsContent>
      </Tabs>
    </div>
  );
}
