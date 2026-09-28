import { Banknote } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { TechnicianView } from '@/components/helpdesk/TechnicianView';

export default function FinTickets() {
  return (
    <div className="flex flex-col min-h-full">
      {/* A descrição dizia "Solicitações de compra, reembolsos e demais pedidos".
          Compra saiu daqui em 2026-09-28: o chamado dela virou do módulo Compras, e
          esta tela filtra `module = 'financeiro'` — então ela para de mostrar compra
          sozinha. Deixar a frase antiga seria a tela prometendo o que não entrega. */}
      <PageHeader
        title="Chamados do Financeiro"
        description="Reembolsos, adiantamentos e demais pedidos enviados ao Financeiro. Compras têm tela própria."
        icon={Banknote}
      />
      <TechnicianView module="financeiro" />
    </div>
  );
}
