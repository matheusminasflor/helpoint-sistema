// Insights do Comercial — uma rota, várias visões (pedido do dono,
// 2026-09-21). A escolha vive na URL (`?visao=`), então o link que a pessoa
// manda abre na mesma visão.
//
// Quem oferece a escolha é o MENU LATERAL: clicar em "Insights" abre as
// opções recuadas abaixo dele, como os módulos já fazem com seus itens. Esta
// página não desenha seletor nenhum — houve um dropdown no canto superior
// direito por algumas horas, e o dono pediu para tirar: a navegação do
// sistema é o menu, e ter dois lugares que navegam é ter que aprender dois.
//
// A lista de visões mora em `src/config/comercial-insights.ts`, para o menu
// lê-la sem importar esta página.
import { useSearchParams } from 'react-router-dom';
import { resolverVisao } from '@/config/comercial-insights';
import { ComercialPainel } from '@/pages/comercial/ComercialPainel';
import ComercialCurvaAbc from '@/pages/comercial/ComercialCurvaAbc';
import ComercialClientes from '@/pages/comercial/ComercialClientes';
import ComercialBonificacao from '@/pages/comercial/ComercialBonificacao';
import ComercialChamadosRelatorios from '@/pages/comercial/ComercialChamadosRelatorios';

export default function ComercialInsights() {
  const [params] = useSearchParams();
  // `resolverVisao` é a MESMA função que o menu lateral usa para decidir qual
  // item acende: `?visao=` desconhecido cai no padrão nos dois lados. Cada um
  // resolvendo por conta própria era o achado A4 da auditoria — a tela
  // mostrava Vendas e o menu não acendia nada.
  const visao = resolverVisao(params.get('visao'));

  switch (visao) {
    case 'curva': return <ComercialCurvaAbc />;
    case 'clientes': return <ComercialClientes />;
    case 'bonificacao': return <ComercialBonificacao />;
    case 'atendimento': return <ComercialChamadosRelatorios />;
    default: return <ComercialPainel />;
  }
}
