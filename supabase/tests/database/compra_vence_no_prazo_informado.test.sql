-- O PRAZO DE PAGAMENTO DA COMPRA (migration 20261103030000)
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: quem executa a compra informa o
-- prazo, no laudo.
--
-- ANTES: `fin_compra_vira_conta_a_pagar` gravava sempre a data de hoje, porque
-- não havia onde informar o prazo. Compra de 30 dias nascia vencendo hoje e
-- aparecia em atraso no dia seguinte; o relatório de vencidas mentia até alguém
-- corrigir de cor.
--
-- AS TRÊS COISAS QUE ESTA SUÍTE PRENDE:
--
-- 1. com prazo informado, a conta vence NELE — e a **competência acompanha**,
--    porque competência é o mês em que a despesa cai no caixa. Errar isto joga a
--    despesa no mês errado do fluxo de caixa sem nada acusar;
-- 2. sem prazo, à vista: vence hoje, como antes. O caminho velho continua;
-- 3. o dia é o do **Brasil**. A asserção compara com
--    `(now() at time zone 'America/Sao_Paulo')::date` e não com `current_date`:
--    o CI roda em UTC, e depois das 21h os dois são dias diferentes — é a regra
--    10 do pgTAP, que já reprovou o CI #36 sem nada ter mudado.
begin;
\ir _helpers.psql

select plan(6);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-venc', 'Vencimento', false) as a;
create temporary table u on commit drop as
select tests.create_user('exec@venc.test', (select a from f)) as pa;
select tests.grant_module((select pa from u), (select a from f), 'financeiro');
select tests.grant_role((select pa from u), 'manager');
grant select on f, u to authenticated;

create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase)
  select a, 'financeiro', 'Compra', true from f returning id
) select id from ins;
grant select on cat to authenticated;

-- Uma compra completa, pronta para concluir. Três orçamentos para a regra da L8
-- não entrar no caminho.
create or replace function pg_temp.montar_compra(p_nome text, p_valor numeric)
returns uuid language plpgsql as $$
declare
  v_ch uuid; v_req uuid; v_q uuid;
begin
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', p_nome, 'x', 'medium', 'open', (select pa from u), (select id from cat) from f
  returning id into v_ch;

  insert into public.compras_solicitacoes
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select a, v_ch, p_nome, 'ti', p_valor, 'pending_approval', (select pa from u) from f
  returning id into v_req;

  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'Fornecedor 1', p_valor, 1 from f returning id into v_q;
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'Fornecedor 2', p_valor + 10, 2 from f;
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'Fornecedor 3', p_valor + 20, 3 from f;

  update public.compras_solicitacoes
     set status = 'approved', approved_quote_id = v_q,
         approved_by = (select pa from u), approved_at = now()
   where id = v_req;
  return v_req;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Com prazo informado
-- ───────────────────────────────────────────────────────────────────────────
create temporary table a_prazo on commit drop as select pg_temp.montar_compra('Cadeira a prazo', 900.00) as req;
grant select on a_prazo to authenticated;

update public.compras_solicitacoes
   set status = 'completed', purchase_report = 'Comprado em 30 dias',
       payment_due_date = ((now() at time zone 'America/Sao_Paulo')::date + 30),
       executed_by = (select pa from u), executed_at = now()
 where id = (select req from a_prazo);

select is(
  (select due_date from public.fin_entries where purchase_request_id = (select req from a_prazo)),
  ((now() at time zone 'America/Sao_Paulo')::date + 30),
  'a conta a pagar vence no prazo informado no laudo, nao hoje'
);
select is(
  (select competence from public.fin_entries where purchase_request_id = (select req from a_prazo)),
  date_trunc('month', ((now() at time zone 'America/Sao_Paulo')::date + 30))::date,
  'e a competencia acompanha o vencimento — e o mes em que a despesa cai no caixa'
);
select is(
  (select status::text from public.fin_entries where purchase_request_id = (select req from a_prazo)),
  'pending',
  'e ela nasce pendente, nao vencida'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Sem prazo: à vista, como antes
-- ───────────────────────────────────────────────────────────────────────────
create temporary table a_vista on commit drop as select pg_temp.montar_compra('Cabo a vista', 50.00) as req;
grant select on a_vista to authenticated;

update public.compras_solicitacoes
   set status = 'completed', purchase_report = 'Comprado na hora',
       executed_by = (select pa from u), executed_at = now()
 where id = (select req from a_vista);

select is(
  (select due_date from public.fin_entries where purchase_request_id = (select req from a_vista)),
  (now() at time zone 'America/Sao_Paulo')::date,
  'sem prazo informado, a conta vence HOJE — o caminho a vista continua'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Data absurda
-- ───────────────────────────────────────────────────────────────────────────
-- O CHECK é de janela fixa (2020–2100) porque CHECK não aceita `now()`. Pega o
-- dedo escorregando no milênio, e não o ano vizinho errado — isso está dito na
-- migration e é limitação conhecida.
select throws_ok(
  format($$ update public.compras_solicitacoes set payment_due_date = '0226-05-10' where id = %L::uuid $$,
         (select req from a_vista)),
  '23514',
  null,
  'ano absurdo no vencimento e recusado'
);
select lives_ok(
  format($$ update public.compras_solicitacoes set payment_due_date = '2024-01-10' where id = %L::uuid $$,
         (select req from a_vista)),
  'mas data no PASSADO passa: compra lancada depois de paga existe'
);

select * from finish();
rollback;
