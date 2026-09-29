// Configurações de Compras — tela nova da LEVA P (2026-09-28). Compras virou setor na leva N e
// ficou sem configuração: as categorias de compra (`module='compras'`) não tinham onde ser
// editadas, e o teto de gasto morava no Financeiro. O dono decidiu: tudo o que é de compra num
// lugar só.
//
// A aba Chamados é a do molde de todo setor. Não há automações: o motor não conhece Compras
// (CHECK de `automation_workflows`), e o molde esconde a seção por isso.
import { Gauge, ShoppingCart } from 'lucide-react';
import { ConfiguracaoDoSetor } from '@/components/configuracoes/ConfiguracaoDoSetor';
import { BudgetSettingsCard } from '@/components/financeiro/BudgetSettingsCard';

export default function ComprasConfiguracoes() {
  return (
    <ConfiguracaoDoSetor
      label="Compras"
      icon={ShoppingCart}
      modulo="compras"
      nomeNaFrase="Compras"
      abas={[
        { valor: 'teto', permissao: 'teto', rotulo: 'Teto de gasto', icone: Gauge, conteudo: <BudgetSettingsCard /> },
      ]}
    />
  );
}
