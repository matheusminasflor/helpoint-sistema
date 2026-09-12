-- Leva "CRM módulo próprio" (ADR-009). 2026-09-12.
-- Decisão do dono: CRM e Comercial "são coisas distintas". Tudo de vendas
-- (funil, contatos, negócios, pedidos, produtos, importação, indicadores e as
-- configurações deles) passa a ser o módulo `crm`; o Comercial fica só com
-- chamados. No banco isso significa: a concessão de acesso é `crm` (não mais
-- `comercial`), as policies e funções do CRM perguntam `has_crm_access`, e os
-- fluxos de venda vivem no módulo `crm`.
--
-- O que este arquivo faz, em uma frase cada:
--   has_crm_access(user)          quem tem o módulo `crm` concedido, ou é supervisor/acima
--   user_module_access            quem tinha `comercial` ganha `crm` (ninguém perde acesso na virada)
--   tenants.plan_config           `crm` entra em available_modules de toda empresa
--   policies de crm_* e funções   has_comercial_access → has_crm_access (reescrita mecânica, conferida)
--   automation_workflows          CHECK aceita `crm`; fluxos de venda mudam de módulo; o motor casa
--                                 registro do CRM com fluxo do módulo `crm`; "abrir chamado" sem módulo
--                                 explícito num fluxo do CRM cai no Comercial (CRM não tem chamados)
--   has_comercial_access          apagada: não sobra quem a use (se sobrar, este arquivo falha aqui)

-- ───────────────────────────────────────────────────────────────────────────
-- Acesso
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.has_crm_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'crm'
  ) or public.is_supervisor_or_higher(_user_id);
$$;
revoke all on function public.has_crm_access(uuid) from public, anon;
grant execute on function public.has_crm_access(uuid) to authenticated, service_role;

insert into public.user_module_access (tenant_id, user_id, module, granted_by)
select tenant_id, user_id, 'crm', granted_by
  from public.user_module_access
 where module = 'comercial'
on conflict (tenant_id, user_id, module) do nothing;

update public.tenants
   set plan_config = jsonb_set(plan_config, '{available_modules}', (plan_config->'available_modules') || '["crm"]'::jsonb)
 where jsonb_typeof(plan_config->'available_modules') = 'array'
   and not (plan_config->'available_modules') ? 'crm';

-- ───────────────────────────────────────────────────────────────────────────
-- Policies e funções do CRM: has_comercial_access → has_crm_access
-- (reescrita mecânica sobre o que está no banco; cada troca é conferida)
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
  p record;
  v_qual text;
  v_check text;
  n_pol int := 0;
  f record;
  d text;
  n_fn int := 0;
begin
  for p in
    select pol.polname, c.relname, pol.polcmd,
           pg_get_expr(pol.polqual, pol.polrelid) as qual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and (coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') like '%has_comercial_access%'
            or coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '') like '%has_comercial_access%')
  loop
    v_qual  := replace(p.qual, 'has_comercial_access', 'has_crm_access');
    v_check := replace(p.with_check, 'has_comercial_access', 'has_crm_access');
    if p.polcmd = 'r' or p.polcmd = 'd' then
      execute format('alter policy %I on public.%I using (%s)', p.polname, p.relname, v_qual);
    elsif p.polcmd = 'a' then
      execute format('alter policy %I on public.%I with check (%s)', p.polname, p.relname, v_check);
    else
      execute format('alter policy %I on public.%I using (%s)%s', p.polname, p.relname, v_qual,
                     case when v_check is not null then format(' with check (%s)', v_check) else '' end);
    end if;
    n_pol := n_pol + 1;
  end loop;

  for f in
    select pr.oid
      from pg_proc pr
      join pg_namespace n on n.oid = pr.pronamespace
     where n.nspname = 'public'
       and pr.proname <> 'has_comercial_access'
       and pr.prosrc like '%has_comercial_access%'
  loop
    d := replace(pg_get_functiondef(f.oid), 'has_comercial_access', 'has_crm_access');
    execute d;
    n_fn := n_fn + 1;
  end loop;

  raise notice 'crm_modulo_proprio: % policies e % funcoes reescritas', n_pol, n_fn;
  if n_pol = 0 then raise exception 'crm_modulo_proprio: nenhuma policy com has_comercial_access — o banco nao e o esperado'; end if;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- Fluxos de automação: o módulo `crm` existe e é onde os registros do CRM disparam
-- ───────────────────────────────────────────────────────────────────────────
alter table public.automation_workflows drop constraint if exists automation_workflows_module_check;
alter table public.automation_workflows
  add constraint automation_workflows_module_check
  check (module in ('tickets', 'marketing', 'qualidade', 'rh', 'financeiro', 'comercial', 'educacional', 'crm'));

-- Fluxo de venda = gatilho num registro do CRM, ou fluxo do Comercial que observa chamado de outro
-- módulo (o modelo "cadastro concluído → cobrar"): passa a viver no CRM.
update public.automation_workflows
   set module = 'crm'
 where module = 'comercial'
   and ((trigger->>'entity') in ('crm_deal', 'crm_contact', 'crm_order')
        or nullif(trigger->>'ticket_module', '') is not null);

do $$
declare d text; n int;
begin
  -- Registro do CRM dispara fluxo do módulo `crm` (era 'comercial').
  select pg_get_functiondef('public.automation_on_record_event()'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$else 'comercial' end;$x$, ''))) / length($x$else 'comercial' end;$x$);
  if n <> 1 then raise exception 'automation_on_record_event: esperava 1 ocorrencia, achei %', n; end if;
  execute replace(d, $x$else 'comercial' end;$x$, $x$else 'crm' end;$x$);

  -- "Abrir chamado" sem módulo explícito num fluxo do CRM: o CRM não tem chamados, cai no Comercial.
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$coalesce(nullif(cfg->>'module', ''), w.module),$x$, ''))) / length($x$coalesce(nullif(cfg->>'module', ''), w.module),$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 ocorrencia, achei %', n; end if;
  execute replace(d, $x$coalesce(nullif(cfg->>'module', ''), w.module),$x$, $x$coalesce(nullif(cfg->>'module', ''), case when w.module = 'crm' then 'comercial' else w.module end),$x$);
end $$;

-- Ninguém mais pergunta por ela. Se este DROP falhar, sobrou um uso — e é para falhar.
drop function public.has_comercial_access(uuid);
