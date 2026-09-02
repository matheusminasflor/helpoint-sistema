import { FinEntriesPage } from '@/components/financeiro/FinEntriesPage';

export default function FinPayables() {
  return (
    <FinEntriesPage
      kind="payable"
      description="Tudo que a empresa tem para pagar: vencimentos, pagamentos já feitos e o que está atrasado."
    />
  );
}
