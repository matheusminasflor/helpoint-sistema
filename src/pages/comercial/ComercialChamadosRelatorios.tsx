import { ModuloRelatorios } from '@/pages/modulo/ModuloRelatorios';

/**
 * A visão "Atendimento" do Insights do Comercial: os indicadores dos
 * chamados. Os de venda ficam na visão "Vendas" (ADR-009 mandava os do CRM
 * para `/crm/indicadores`, e o CRM está em construção).
 */
export default function ComercialChamadosRelatorios() {
  return (
    <ModuloRelatorios
      module="comercial"
      label="Comercial"
      titulo="Atendimento"
      subtitle="Chamados do Comercial: orçamentos, pedidos e pós-venda."
    />
  );
}
