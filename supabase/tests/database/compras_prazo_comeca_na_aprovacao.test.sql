-- PRAZO DE COMPRAS COMEÇA NA APROVAÇÃO (migration 20270109010000; dono, 2026-10-14).
--   1  aguardando aprovação: o chamado fica sem prazo de resolução
--   2  ... e sem prazo de 1ª resposta
--   3  aprovada: o prazo de resolução começa cheio na aprovação, para quem compra
--   4  ... e o de 1ª resposta também
--   5  o recomeço fica marcado (prazo_desde)
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-compras-prazo', 'Compras Prazo', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@comprasprazo.test',  (select a from f)) as ana,
       tests.create_user('apr@comprasprazo.test',  (select a from f)) as apr,
       tests.create_user('dono@comprasprazo.test', (select a from f)) as dono;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'compras', 'Aprovador', '{"solicitacoes": {"approve": true}}'::jsonb from f;
select tests.grant_module((select apr from u), (select a from f), 'compras');
select tests.grant_profile((select apr from u), (select a from f), 'compras', 'Aprovador');
insert into public.compras_config (tenant_id, comprador_id) select a, (select dono from u) from f;
insert into public.sla_regras_do_setor (tenant_id, module, pausa_fim_de_semana) select a, 'compras', false from f;
insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
select a, 'compras', 'Compras média', 'medium', 120, 960 from f;

create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert on pedido to authenticated;

select tests.authenticate_as('ana@comprasprazo.test');
insert into pedido select public.compras_abrir_pedido('{"title":"Cadeira","priority":"medium"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti","quantidade":"1"}'::jsonb,
  '[{"supplier":"Loja","valor_unitario":"100","link":"https://l"}]'::jsonb);
select tests.clear_authentication();

select ok((select sla_due_at is null from public.tickets where id = (select ticket from pedido)), 'aguardando aprovacao: sem prazo de resolucao');
select ok((select first_response_due_at is null from public.tickets where id = (select ticket from pedido)), 'aguardando aprovacao: sem prazo de 1a resposta');

select tests.authenticate_as('apr@comprasprazo.test');
update public.compras_solicitacoes
   set status = 'approved', approved_by = auth.uid(), approved_at = now(), few_quotes_reason = 'unico',
       forma_pagamento = 'pix', filial = 'MF',
       approved_quote_id = (select q.id from public.compras_orcamentos q join public.compras_solicitacoes s on s.id = q.request_id
                             where s.ticket_id = (select ticket from pedido))
 where ticket_id = (select ticket from pedido) returning id;
select tests.clear_authentication();

select is((select sla_due_at from public.tickets where id = (select ticket from pedido)),
  public.prazo_padrao_do_chamado((select a from f), 'compras', 'medium', now(), (select dono from u), null),
  'aprovada: o prazo de resolucao comeca cheio na aprovacao, para quem compra');
select is((select first_response_due_at from public.tickets where id = (select ticket from pedido)),
  public.prazo_da_primeira_resposta((select a from f), 'compras', 'medium', now(), (select dono from u)),
  'aprovada: o prazo de 1a resposta tambem');
select is((select prazo_desde from public.tickets where id = (select ticket from pedido)), now(), 'o recomeco fica marcado');

select * from finish();
rollback;
