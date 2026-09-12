import { ModuloRelatorios } from '@/pages/modulo/ModuloRelatorios';

/** Indicadores dos chamados do Comercial (ADR-009: os de venda ficam no CRM, em `/crm/indicadores`). */
export default function ComercialChamadosRelatorios() {
  return (
    <ModuloRelatorios
      module="comercial"
      label="Comercial"
      subtitle="Chamados do Comercial: orçamentos, pedidos e pós-venda."
    />
  );
}
