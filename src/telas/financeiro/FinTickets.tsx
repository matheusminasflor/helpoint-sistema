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
      {/* "Solicitações" (dono, 2026-10-28): é aqui que chega tudo o que os setores pedem ao Financeiro pelo Novo. */}
      <PageHeader
        title="Solicitações"
        description="Tudo o que os setores pedem ao Financeiro: reembolso, adiantamento, pagamento a fornecedor, nota fiscal e boleto, cobrança, desconto ao cliente e outros. Compra tem tela própria, em Compras."
        icon={Banknote}
      />
      <TechnicianView module="financeiro" />
    </div>
  );
}
