import type { Metadata } from 'next';
import '../src/index.css';

/**
 * O casco do Next (leva L, passo 1 — 2026-09-26).
 *
 * É o que o `index.html` do Vite era: a página que carrega o CSS e abre a raiz. O
 * `index.html` continua existindo e continua sendo o do Vite — os dois builds
 * coexistem neste passo, de propósito.
 *
 * `suppressHydrationWarning` no `<html>` por causa do modo escuro (leva J): o
 * `next-themes` escreve a classe `dark` antes da primeira pintura, então o HTML
 * que o servidor mandou e o que o navegador tem divergem por um instante. Sem
 * isto, o React reclama no console de uma diferença que é o comportamento certo.
 *
 * A fonte NÃO migrou para `next/font` nesta etapa: ela é carregada por `@import`
 * dentro do `index.css`, que os dois builds compartilham. Trocar por `next/font`
 * agora quebraria o Vite — é trabalho do passo em que o Vite sair.
 */
export const metadata: Metadata = {
  title: 'Helpoint',
  description: 'Sistema operacional corporativo da Minasflor',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
