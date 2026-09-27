import type { Metadata } from 'next';
import Terms from '../../src/telas/Terms';

/**
 * A PRIMEIRA rota de verdade do Next (leva L, passo 2 — 2026-09-26).
 *
 * Sem `'use client'`: é **componente de servidor**. O HTML dos Termos chega
 * pronto, com zero JavaScript — a tela não tem estado, não tem sessão e não fala
 * com o banco. É o ganho concreto do porte, visível no `next build` como rota
 * estática com tamanho próprio.
 *
 * Por que ESTA tela primeiro: ela era a única que não precisava do roteador depois
 * de trocar um `<Link to="/">` por `<a href="/">`. A regra do passo 2 é essa —
 * **uma tela vira rota do Next quando deixa de precisar do roteador** —, e é ela
 * que diz quais são as próximas: as que não usam sessão, `useParams` nem
 * `navigate`.
 *
 * A rota `/termos` do `react-router` continua de pé: os dois builds coexistem, e
 * esta rota é a que ganha quando o endereço é aberto direto. Ordem no Next: uma
 * rota específica (`/termos`) ganha da coringa (`[[...slug]]`).
 *
 * `metadata` aqui é o que o `<title>` do `index.html` nunca deu por página: cada
 * rota portada passa a ter o seu.
 */
export const metadata: Metadata = {
  title: 'Termos de Uso · Helpoint',
  description: 'Termos de uso da plataforma Helpoint.',
};

export default function PaginaTermos() {
  return <Terms />;
}
