import { ModuloRelatorios } from '@/telas/modulo/ModuloRelatorios';
import { TreinamentosNosIndicadores } from '@/components/educacional/TreinamentosNosIndicadores';

export default function EducacionalRelatorios() {
  return (
    <ModuloRelatorios
      module="educacional"
      label="Educacional"
      subtitle="Treinamentos internos e de clientes: turmas, inscritos, quem concluiu (certificado), presença e chamados."
      tutorial="educacional-indicadores"
      acima={(p) => <TreinamentosNosIndicadores {...p} />}
    />
  );
}
