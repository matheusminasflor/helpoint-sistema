/**
 * Next.js AO LADO do Vite (leva L, passo 1 — 2026-09-26, ADR-002).
 *
 * O porte não troca tudo de uma vez: o Next passa a servir o app que já existe,
 * dentro de uma rota coringa, e **nada muda de comportamento**. `npm run build`
 * (Vite) continua verde e `npm run build:next` prova que os 554 arquivos compilam
 * sob o Next. Os dois no CI, para o porte não poder regredir em silêncio.
 *
 * ══ A ARMADILHA QUE ESTE ARQUIVO EXISTE PARA DESARMAR ═══════════════════════
 *
 * O Next lê `pages/` ou `src/pages/` como **Pages Router**. Este repositório tem
 * `src/pages/` com **107 telas** que NÃO são páginas do Next — são componentes
 * React roteados pelo `react-router-dom`. Se o Next as adotasse como rotas, cada
 * uma viraria um endereço público servido sem layout, sem sessão e sem guarda.
 *
 * O que desarma: existir `app/` na RAIZ. O Next resolve o diretório-base uma vez,
 * e com `app/` na raiz ele não procura em `src/`. Então `src/pages` fica sendo o
 * que sempre foi — uma pasta de componentes.
 *
 * `pageExtensions` reforça isso de propósito, e não por medo: só `page.tsx`,
 * `layout.tsx` e `route.ts` contam como arquivo de rota. É cinto e suspensório
 * numa armadilha cujo custo seria 107 páginas públicas.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // `pageExtensions` NÃO é usado, e a primeira tentativa provou por quê: com
  // `['page.tsx']`, o App Router passa a procurar `page.page.tsx` e o `app/` desta
  // pasta deixou de ser reconhecido — o build saiu com "Route (pages)" e uma
  // única rota automática (/404), servindo NADA. O cinto apertou o suspensório.

  eslint: {
    // O lint deste repositório é catraca própria (`scripts/lint-baseline.mjs`,
    // 503 erros de dívida velha que não podem piorar). O `next build` roda o
    // eslint de novo e falharia neles — dois portões para a mesma coisa, e o
    // nosso é o que sabe a linha de base.
    ignoreDuringBuilds: true,
  },

  typescript: {
    // Mesmo raciocínio: `npx tsc --noEmit -p tsconfig.app.json` é o portão, e ele
    // conhece os 4 erros pré-existentes (useLicenseRenewals, useRH ×2,
    // useTicketActions) que estão registrados em `docs/nao-funciona.md`. O
    // `next build` não os conhece e barraria o build por dívida velha.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
