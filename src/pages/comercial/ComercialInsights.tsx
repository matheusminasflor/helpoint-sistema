// Insights do Comercial — uma porta só para as duas coisas que o módulo
// mede (pedido do dono, 2026-09-21).
//
// Os nomes são o que se MEDE, não o artefato: dentro do módulo Comercial
// tudo é comercial, então "Painel Comercial" não distinguia nada.
//   • Vendas      — o relatório do Forteplus (faturamento, clientes, produtos)
//   • Atendimento — os chamados do Comercial
//
// A escolha vive na URL (`?visao=`), então o link que a pessoa manda abre na
// mesma visão — e o seletor entra nas AÇÕES do cabeçalho de cada tela, em vez
// de empilhar um segundo título em cima do que já existe.
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryState } from '@/hooks/useQueryState';
import { ComercialPainel } from '@/pages/comercial/ComercialPainel';
import ComercialChamadosRelatorios from '@/pages/comercial/ComercialChamadosRelatorios';

type Visao = 'vendas' | 'atendimento';

/** Rótulo e ordem do dropdown. A L6b entra aqui como mais um item, não como outra rota. */
const VISOES: { valor: Visao; rotulo: string }[] = [
  { valor: 'vendas', rotulo: 'Vendas' },
  { valor: 'atendimento', rotulo: 'Atendimento' },
];

export default function ComercialInsights() {
  const [visao, setVisao] = useQueryState<Visao>('visao', 'vendas');

  const seletor = (
    <Select value={visao} onValueChange={(v) => setVisao(v as Visao)}>
      <SelectTrigger className="w-40" aria-label="Escolher o que ver">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {VISOES.map((v) => (
          <SelectItem key={v.valor} value={v.valor}>{v.rotulo}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return visao === 'atendimento'
    ? <ComercialChamadosRelatorios acoes={seletor} />
    : <ComercialPainel acoes={seletor} />;
}
