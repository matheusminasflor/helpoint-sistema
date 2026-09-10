# pgTAP local, sem Docker

O CI prova as migrations e o RLS subindo o Supabase inteiro em containers
(`supabase start` + `supabase test db`). Onde não há Docker — a sessão de um
agente, por exemplo — este harness faz a mesma prova num **Postgres 16 comum**:

```
scripts/pgtap-local/run.sh                 # banco do zero + 139 migrations + pg_prove
scripts/pgtap-local/run.sh --keep          # reusa o banco da última vez
scripts/pgtap-local/run.sh --keep supabase/tests/database/crm_*.test.sql
```

O que ele simula, e só isso (`supabase-lite.sql`): papéis `anon` /
`authenticated` / `service_role`, `auth.users` com as colunas do GoTrue,
`auth.uid()` / `auth.role()` / `auth.jwt()` lendo `request.jwt.claims`,
`storage.buckets` / `storage.objects` e suas três funções, a publicação
`supabase_realtime`, as permissões padrão do schema `public`, `pg_cron` de
verdade (precisa de `shared_preload_libraries`; o script ajusta e reinicia
uma vez) e três extensões de mentira instaladas por `fake-extensions.sh`:
`pg_net` (não faz HTTP), `supabase_vault` (guarda em claro) e `pgmq` (fila em
tabela). Nada disso serve para rodar o sistema — serve para a migration
aplicar e o pgTAP provar trigger, função e policy.

Pré-requisitos (Ubuntu): `postgresql-16 postgresql-16-pgtap
postgresql-16-cron libtap-parser-sourcehandler-pgtap-perl` e `sudo` sem
senha na primeira execução.

Limites conhecidos: `auth.uid()` aqui vem só de `request.jwt.claims`, como no
Supabase; funções que dependem do GoTrue, do Storage ou do PostgREST reais não
são cobertas. O CI continua sendo a prova final.
