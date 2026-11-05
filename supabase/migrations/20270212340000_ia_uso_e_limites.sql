-- IA COM LIMITE E COM CONTA (dono, 2026-11-04, proposta https://claude.ai/artifact/CTFtxXCMwSV63P9PzRR3Hs).
-- Toda chamada de IA passa por `_shared/ai.ts`, que confere o limite aqui, registra o consumo e guarda a resposta de
-- texto repetido. Padrão: 100 usos por pessoa ao dia e US$ 30 por mês na empresa.
-- ponytail: os limites vêm de `tenants.settings -> 'ia'` (`limite_dia`, `teto_mes`), sem tela; a tela entra se mudarem.

create table if not exists public.ia_uso (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  recurso text not null,
  modelo text,
  tokens_entrada integer not null default 0,
  tokens_saida integer not null default 0,
  custo_usd numeric(12, 6) not null default 0,
  do_cache boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists ia_uso_por_empresa on public.ia_uso (tenant_id, created_at);
create index if not exists ia_uso_por_pessoa on public.ia_uso (user_id, created_at);
alter table public.ia_uso enable row level security;
revoke all on public.ia_uso from public, anon, authenticated;

-- Texto repetido não paga de novo. Fica 30 dias: é o texto das pessoas, não é histórico.
create table if not exists public.ia_cache (
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  chave text not null,
  resposta jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, chave)
);
alter table public.ia_cache enable row level security;
revoke all on public.ia_cache from public, anon, authenticated;

-- Nulo = pode usar. Resposta em cache não conta: não custou nada.
create or replace function public.ia_motivo_do_bloqueio(p_tenant uuid, p_user uuid)
returns text language sql stable security definer set search_path = public as $$
  with cfg as (
    select coalesce((t.settings -> 'ia' ->> 'limite_dia')::int, 100) as limite_dia,
           coalesce((t.settings -> 'ia' ->> 'teto_mes')::numeric, 30) as teto_mes
      from public.tenants t where t.id = p_tenant
  ), hoje as (select (now() at time zone 'America/Sao_Paulo')::date as d)
  select case
    when (select coalesce(sum(u.custo_usd), 0) from public.ia_uso u, hoje
           where u.tenant_id = p_tenant
             and date_trunc('month', u.created_at at time zone 'America/Sao_Paulo') = date_trunc('month', hoje.d::timestamp))
         >= (select teto_mes from cfg)
      then 'A IA atingiu o limite do mês da empresa. Os formulários continuam funcionando.'
    when (select count(*) from public.ia_uso u, hoje
           where u.user_id = p_user and not u.do_cache
             and (u.created_at at time zone 'America/Sao_Paulo')::date = hoje.d)
         >= (select limite_dia from cfg)
      then 'Você atingiu o limite de uso da IA de hoje. Amanhã ele volta.'
  end;
$$;
revoke all on function public.ia_motivo_do_bloqueio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.ia_motivo_do_bloqueio(uuid, uuid) to service_role;

-- O cartão de Integrações: só dono e administrador veem o gasto.
create or replace function public.ia_situacao()
returns table (usos bigint, custo_usd numeric, teto_mes numeric, limite_dia integer)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where not u.do_cache), coalesce(sum(u.custo_usd), 0), c.teto, c.dia
    from (select coalesce((t.settings -> 'ia' ->> 'teto_mes')::numeric, 30) as teto,
                 coalesce((t.settings -> 'ia' ->> 'limite_dia')::int, 100) as dia, t.id
            from public.tenants t
           where t.id = public.get_user_tenant_id() and public.is_admin_or_higher(auth.uid())) c
    left join public.ia_uso u on u.tenant_id = c.id
     and date_trunc('month', u.created_at at time zone 'America/Sao_Paulo') = date_trunc('month', now() at time zone 'America/Sao_Paulo')
   group by c.teto, c.dia;
$$;
revoke all on function public.ia_situacao() from public, anon;
grant execute on function public.ia_situacao() to authenticated;

select cron.schedule('ia-cache-30-dias', '17 4 * * *', $$delete from public.ia_cache where created_at < now() - interval '30 days'$$);
