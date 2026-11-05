-- As sugestões da IA nos Indicadores da TI (proposta aprovada em 2026-11-05,
-- https://claude.ai/artifact/N98z6fDomjp8skuZxy5U9f). Nascem só no clique do administrador e ficam guardadas:
-- abrir a tela de novo lê daqui e não gasta IA. O que foi recusado volta para a próxima análise como "não sugerir".
create table public.ia_sugestoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('categoria_nova', 'categoria_errada', 'tutorial')),
  titulo text not null,
  motivo text not null,
  dados jsonb not null default '{}'::jsonb,
  chamados jsonb not null default '[]'::jsonb,
  status text not null default 'pendente' check (status in ('pendente', 'aprovada', 'recusada')),
  criada_por uuid references public.profiles(id) on delete set null,
  decidida_por uuid references public.profiles(id) on delete set null,
  decidida_em timestamptz,
  created_at timestamptz not null default now()
);
create index ia_sugestoes_do_tenant on public.ia_sugestoes (tenant_id, status, created_at desc);

alter table public.ia_sugestoes enable row level security;
revoke all on public.ia_sugestoes from anon;

create policy ia_sugestoes_admin_ve on public.ia_sugestoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()));
create policy ia_sugestoes_admin_cria on public.ia_sugestoes for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()));
create policy ia_sugestoes_admin_decide on public.ia_sugestoes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()));
create policy ia_sugestoes_admin_apaga on public.ia_sugestoes for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()));
