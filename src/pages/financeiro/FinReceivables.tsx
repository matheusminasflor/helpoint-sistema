import { FinEntriesPage } from '@/components/financeiro/FinEntriesPage';

export default function FinReceivables() {
  return (
    <FinEntriesPage
      kind="receivable"
      description="Tudo que a empresa tem para receber: previsões, recebimentos confirmados e valores em atraso."
    />
  );
}
