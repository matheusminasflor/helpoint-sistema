import { ModuloRelatorios } from '@/telas/modulo/ModuloRelatorios';

export default function ExpedicaoRelatorios() {
  return (
    <ModuloRelatorios
      module="expedicao"
      label="Expedição"
      titulo="Indicadores da Expedição"
      subtitle="Chamados da Expedição: envios, rastreio, entrega, avarias e trocas."
      tutorial="expedicao-indicadores"
    />
  );
}
