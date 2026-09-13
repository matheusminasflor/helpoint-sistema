-- ENC-3: o passo de fluxo "emitir nota fiscal". 2026-09-13 (ADR-009).
--
-- Molde do `bling_order` da CRM-2b: é passo **externo**. O banco valida e marca
-- o run como `waiting`; quem executa é a edge function `automation-worker`, que
-- fala com a Focus NFe usando o token da empresa. Sem isto o dono teria que
-- clicar "emitir" pedido a pedido, e o encaixe não fecharia o fluxo
-- "pedido pago → nota".
--
-- Exige um pedido no gatilho, como o `bling_order`.

-- ── O executor aceita o passo novo ──────────────────────────────────────────
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$  when 'bling_order' then$x$;
  select pg_get_functiondef('public.automation_run_step(public.automation_runs, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_run_step: esperava 1 ramo bling_order, achei %', n; end if;

  execute replace(d, alvo,
    $x$  when 'emitir_nfe' then
    -- Nota fiscal pela Focus NFe (ENC-3): externo, com o token da empresa.
    if v_entity <> 'crm_order' then raise exception 'a acao "emitir nota fiscal" exige um pedido'; end if;
    return jsonb_build_object('status', 'waiting', 'pending_kind', p_step->>'kind');

  when 'bling_order' then$x$);
end $do$;

-- ── A validação conhece o passo novo ────────────────────────────────────────
do $do$
declare d text; n int; alvo text;
begin
  alvo := $x$'send_email', 'http_request', 'ai_text', 'create_receivable', 'bling_order') then$x$;
  select pg_get_functiondef('public.automation_validate_flow(jsonb, jsonb)'::regprocedure) into d;
  n := (length(d) - length(replace(d, alvo, ''))) / length(alvo);
  if n <> 1 then raise exception 'automation_validate_flow: esperava 1 lista de passos, achei %', n; end if;

  execute replace(d, alvo,
    $x$'send_email', 'http_request', 'ai_text', 'create_receivable', 'bling_order', 'emitir_nfe') then$x$);
end $do$;
