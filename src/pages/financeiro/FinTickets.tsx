import { Banknote } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TechnicianView } from '@/components/helpdesk/TechnicianView';

export default function FinTickets() {
  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Chamados do Financeiro"
        description="Solicitações de compra, reembolsos e demais pedidos enviados ao Financeiro."
        icon={Banknote}
      />
      <TechnicianView module="financeiro" />
    </div>
  );
}
