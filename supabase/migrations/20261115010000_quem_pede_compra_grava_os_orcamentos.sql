-- LEVA P, parte 1 — pedir compra pelo lugar certo.
--
-- O dono, 2026-09-28: "quando eu vou fazer uma solicitação de compras … eu não consigo."
--
-- A CAUSA, reproduzida no test-helpoint com uma pessoa sem acesso a Compras: o chamado e o
-- pedido gravam (as policies de `tickets` e `compras_solicitacoes` deixam quem pede), e o
-- primeiro orçamento leva 42501 — `compras_orcamentos_escreve` exige `has_compras_access`.
-- O formulário obriga 3 orçamentos, então TODO pedido de quem não é de Compras falhava no
-- último passo, e deixava para trás um chamado aberto com um pedido sem orçamento, porque
-- eram três chamadas separadas do navegador.
--
-- Duas mudanças, uma para cada metade:
--   1. quem pediu grava os orçamentos DO PRÓPRIO PEDIDO, e só enquanto ele aguarda aprovação.
--      Depois, só Compras mexe — é a mesma fronteira que o trigger de três orçamentos usa;
--   2. `compras_abrir_pedido` grava chamado, pedido e orçamentos numa transação só. Se um
--      falhar, nenhum fica.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Quem pediu grava os orçamentos do próprio pedido, enquanto aguarda aprovação
-- ─────────────────────────────────────────────────────────────────────────────
-- Só INSERT: editar ou apagar orçamento continua de Compras. O EXISTS olha a tabela-mãe,
-- não a própria — o pedido já foi gravado por um comando anterior e está visível (a regra 13
-- do pgTAP é sobre reconsultar a MESMA tabela que está nascendo).
create policy compras_orcamentos_quem_pediu_insere on public.compras_orcamentos
  for insert to authenticated
  with check (
    tenant_id = (select public.get_user_tenant_id())
    and exists (
      select 1 from public.compras_solicitacoes r
       where r.id = compras_orcamentos.request_id
         and r.tenant_id = compras_orcamentos.tenant_id
         and r.created_by = auth.uid()
         and r.status = 'pending_approval'
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Chamado, pedido e orçamentos numa transação só
-- ─────────────────────────────────────────────────────────────────────────────
-- `security invoker`: cada insert passa pela policy de quem chama, exatamente como passava
-- quando o navegador fazia as três chamadas. A função não abre porta nenhuma — só junta.
--
-- `p_chamado`: title, description, category_id, category, subcategory, priority, due_date,
--              assigned_to (os campos que `useCreateTicket` já mandava).
-- `p_pedido`:  product_id, product_name, product_link, department.
-- `p_orcamentos`: [{supplier, supplier_id, amount, link, notes, file_path}] — o anexo sobe
--              ao Storage antes, porque arquivo não passa por SQL.
create or replace function public.compras_abrir_pedido(
  p_chamado jsonb,
  p_pedido jsonb,
  p_orcamentos jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_eu uuid := auth.uid();
  v_ticket uuid;
  v_pedido uuid;
  v_atribuido uuid := nullif(p_chamado ->> 'assigned_to', '')::uuid;
  v_estimado numeric;
begin
  if v_tenant is null or v_eu is null then
    raise exception 'Entre no sistema para pedir uma compra.' using errcode = '42501';
  end if;
  if coalesce(trim(p_pedido ->> 'product_name'), '') = '' then
    raise exception 'Informe o produto da solicitação de compra.' using errcode = '23514';
  end if;

  -- O menor orçamento válido é a estimativa, como o navegador calculava.
  select min((o ->> 'amount')::numeric) into v_estimado
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) o
   where coalesce(trim(o ->> 'supplier'), '') <> '' and (o ->> 'amount')::numeric > 0;

  insert into public.tickets (
    tenant_id, title, description, category_id, category, subcategory, priority,
    due_date, assigned_to, status, first_response_at, requester_id, created_by, module
  ) values (
    v_tenant,
    p_chamado ->> 'title',
    p_chamado ->> 'description',
    nullif(p_chamado ->> 'category_id', '')::uuid,
    p_chamado ->> 'category',
    p_chamado ->> 'subcategory',
    coalesce(nullif(p_chamado ->> 'priority', ''), 'medium')::public.ticket_priority,
    nullif(p_chamado ->> 'due_date', '')::timestamptz,
    v_atribuido,
    -- O mesmo que `useCreateTicket`: chamado já atribuído nasce em andamento e respondido.
    case when v_atribuido is not null then 'in_progress'::public.ticket_status else 'open'::public.ticket_status end,
    case when v_atribuido is not null then now() end,
    v_eu, v_eu, 'compras'
  )
  returning id into v_ticket;

  insert into public.compras_solicitacoes (
    tenant_id, ticket_id, product_id, product_name, product_link, department,
    estimated_amount, created_by
  ) values (
    v_tenant, v_ticket,
    nullif(p_pedido ->> 'product_id', '')::uuid,
    trim(p_pedido ->> 'product_name'),
    nullif(trim(p_pedido ->> 'product_link'), ''),
    nullif(p_pedido ->> 'department', ''),
    v_estimado, v_eu
  )
  returning id into v_pedido;

  insert into public.compras_orcamentos (
    tenant_id, request_id, supplier, supplier_id, amount, link, notes, file_path, position
  )
  select v_tenant, v_pedido,
         trim(o ->> 'supplier'),
         nullif(o ->> 'supplier_id', '')::uuid,
         (o ->> 'amount')::numeric,
         nullif(trim(o ->> 'link'), ''),
         nullif(trim(o ->> 'notes'), ''),
         nullif(o ->> 'file_path', ''),
         n::int
    from jsonb_array_elements(coalesce(p_orcamentos, '[]'::jsonb)) with ordinality as x(o, n)
   where coalesce(trim(o ->> 'supplier'), '') <> '' and (o ->> 'amount')::numeric > 0;

  return v_ticket;
end;
$$;

revoke all on function public.compras_abrir_pedido(jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.compras_abrir_pedido(jsonb, jsonb, jsonb) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.compras_abrir_pedido(jsonb, jsonb, jsonb)', 'execute') then
    raise exception 'compras_abrir_pedido aberta para anon';
  end if;
end $$;
