import { AppNoNavegador } from './cliente';

/**
 * A rota coringa que serve o app inteiro (leva L, passo 1 — 2026-09-26).
 *
 * `[[...slug]]` é opcional-coringa: casa `/`, `/comercial/insights`,
 * `/financeiro/compras/indicadores` — tudo. Quem decide o que desenhar continua
 * sendo o `react-router-dom` dentro do `App`, exatamente como hoje. É isto que
 * faz o passo 1 não mudar comportamento nenhum.
 *
 * `generateStaticParams` com uma entrada vazia existe porque, com `output`
 * estático, o Next precisa saber quais caminhos gerar. Um só (`/`) basta: o
 * `index.html` resultante atende qualquer endereço, que é como uma SPA funciona —
 * o mesmo papel do `historyApiFallback` do Vite.
 *
 * O PRÓXIMO PASSO mora aqui: cada tela que virar rota de verdade do Next sai
 * daqui e ganha o seu próprio `page.tsx`. Enquanto houver `<Route>` no
 * `StaffAppRoutes`, esta rota continua sendo o teto.
 */
export function generateStaticParams() {
  return [{ slug: [''] }];
}

export default function Pagina() {
  return <AppNoNavegador />;
}
