// Configurações › Empresa › Prazos de atendimento (LEVA P). O prazo PADRÃO: vale para todo setor
// que não tiver o próprio. O de cada setor fica na aba Chamados da configuração dele — e as
// duas telas usam o mesmo componente, então as duas mostram a mesma tabela.
import { Clock } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { PrazosDeAtendimento } from '@/components/configuracoes/PrazosDeAtendimento';

export default function PrazosDaEmpresa() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Clock}
        title="Prazos de atendimento"
        description="O prazo padrão da empresa. Cada setor pode ter o próprio na configuração dele."
      />
      <PrazosDeAtendimento />
    </div>
  );
}
