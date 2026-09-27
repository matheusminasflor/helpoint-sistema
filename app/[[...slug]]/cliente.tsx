'use client';

import dynamic from 'next/dynamic';

/**
 * O app só no navegador (leva L, passo 1 — 2026-09-26).
 *
 * `ssr: false` NÃO é preguiça: o `App` monta `BrowserRouter`, `AuthProvider` (que
 * fala com o Supabase no primeiro efeito) e o `ThemeProvider`. Nada disso existe
 * no servidor, e 43 arquivos deste repositório tocam `window`/`document`. Renderizar
 * no servidor produziria uma casca vazia que o navegador jogaria fora — mais lento
 * e igual ao que se tem hoje.
 *
 * É o formato honesto do passo 1: o Next serve a SPA, e a renderização no servidor
 * é ganho do passo em que cada tela virar rota de verdade. Fingir SSR agora seria
 * dizer que o porte deu algo que ele não deu.
 *
 * O `loading` é o mesmo lugar em branco que o Vite mostra enquanto o bundle chega —
 * sem "Carregando…", que numa SPA aparece rápido demais para ser lido e pisca.
 */
const App = dynamic(() => import('../../src/App'), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-background" />,
});

export function AppNoNavegador() {
  return <App />;
}
