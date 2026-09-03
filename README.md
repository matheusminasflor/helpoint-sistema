# Helpoint

Sistema operacional corporativo multi-tenant: chamados e inventário de TI,
qualidade e SAC, marketing, RH e financeiro, com uma camada de IA (Lyra).
Cada empresa cliente é um tenant, isolado por RLS no Postgres.

**Stack:** React 18 + Vite + TypeScript + react-router + TanStack Query +
shadcn/ui + Tailwind, falando direto com a Supabase (Postgres, Auth, Storage,
Realtime, Edge Functions em Deno).

## Rodar

Node 20+ e npm.

```sh
npm ci
cp .env.example .env      # preencha com o projeto test-helpoint
npm run dev               # http://localhost:8080
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção em `dist/` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest |
| `npm run types:gen` | Regenera `src/integrations/supabase/types.ts` a partir do banco de teste |

## Onde está o quê

| | |
|---|---|
| `src/pages/`, `src/components/`, `src/hooks/` | Telas, componentes e hooks por módulo |
| `src/integrations/supabase/` | Cliente e tipos gerados |
| `supabase/migrations/` | Schema, RLS, triggers, funções SQL, jobs |
| `supabase/functions/` | Edge functions; `_shared/` é o código comum |
| `supabase/tests/database/` | pgTAP |
| `docs/ambientes.md` | Projetos Supabase, chaves, segredos, deploy no teste |
| `docs/deploy.md` | Como sobe em cada alvo (Supabase Cloud + Vercel, VPS) |
| `docs/inventario-sistema.md` | O sistema, módulo a módulo |
| `docs/nao-funciona.md` | O que existe no código e não funciona |
| `docs/decisoes.md` | Decisões de arquitetura |
| `CLAUDE.md` | Protocolo de trabalho dos agentes |
