import { ModuloRelatorios } from '@/telas/modulo/ModuloRelatorios';

export default function ProducaoRelatorios() {
  return (
    <ModuloRelatorios
      module="producao"
      label="Produção"
      titulo="Indicadores da Produção"
      subtitle="Chamados da Produção: ordens, matéria-prima, problemas no lote e manutenção."
      tutorial="producao-indicadores"
    />
  );
}
