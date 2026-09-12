-- Correção da auditoria de 2026-09-12 (ADR-009), duas coisas pequenas e uma fila.
--
-- 1. O passo "abrir chamado" de um fluxo do CRM gravava `config.module = 'crm'`
--    (a tela escrevia o módulo do fluxo). `tickets.module` recusa 'crm' — o
--    fluxo salvava verde e só quebrava na execução, com erro de constraint. A
--    tela deixou de oferecer 'crm'; aqui o banco passa a traduzir de qualquer
--    origem: pedido pelo fluxo, pela API, ou de um fluxo salvo antes desta
--    correção. `nullif(..., 'crm')` faz o `coalesce` cair no módulo do fluxo,
--    que por sua vez vira 'comercial' quando o fluxo é do CRM.
-- 2. `automation_validate_flow` recusa 'crm' em `config.module` e em
--    `trigger.ticket_module`: erro de configuração aparece ao salvar, não na
--    primeira execução.
-- 3. Empresa NOVA nascia sem `crm` em `plan_config.available_modules` (o
--    default da coluna não tinha sido tocado): o dono não conseguiria conceder
--    o CRM a ninguém.

do $$
declare d text; n int;
begin
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$coalesce(nullif(cfg->>'module', ''), case when w.module = 'crm' then 'comercial' else w.module end),$x$, ''))) / length($x$coalesce(nullif(cfg->>'module', ''), case when w.module = 'crm' then 'comercial' else w.module end),$x$);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 ocorrencia do modulo do chamado, achei %', n; end if;
  execute replace(d,
    $x$coalesce(nullif(cfg->>'module', ''), case when w.module = 'crm' then 'comercial' else w.module end),$x$,
    $x$coalesce(nullif(nullif(cfg->>'module', ''), 'crm'), case when w.module = 'crm' then 'comercial' else w.module end),$x$);

  select pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, $x$    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then$x$, ''))) / length($x$    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then$x$);
  if n <> 1 then raise exception 'automation_validate_flow: esperava 1 ocorrencia do guard de next, achei %', n; end if;
  execute replace(d,
    $x$    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then$x$,
    $x$    -- O CRM nao tem fila de chamados (ADR-009): `tickets.module` recusa 'crm'.
    if s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm' then
      raise exception 'o CRM nao tem fila de chamados: escolha o modulo onde o chamado nasce';
    end if;
    if s ? 'next' and jsonb_typeof(s->'next') <> 'array' then$x$);
end $$;

update public.automation_workflows w
   set steps = (
     select jsonb_agg(
       case when s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm'
            then jsonb_set(s, '{config,module}', '"comercial"'::jsonb)
            else s end
       order by idx)
       from jsonb_array_elements(w.steps) with ordinality as e(s, idx))
 where exists (
   select 1 from jsonb_array_elements(w.steps) s
    where s->>'kind' = 'create_ticket' and s->'config'->>'module' = 'crm');

alter table public.tenants
  alter column plan_config set default jsonb_build_object(
    'plan', 'free',
    'trial_ends_at', null,
    'max_users', 5,
    'available_modules', jsonb_build_array('ti', 'crm', 'comercial', 'marketing', 'rh', 'financeiro', 'producao', 'expedicao', 'educacional', 'qualidade'),
    'features', jsonb_build_object('lyra_advanced', true, 'advanced_reports', true, 'export_data', true)
  );
