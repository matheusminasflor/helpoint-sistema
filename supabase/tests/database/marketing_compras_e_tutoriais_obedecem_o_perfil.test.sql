-- Marketing, Compras, fornecedores e tutoriais obedecem ao perfil no banco
-- (migration 20261124010000; decisão do dono, 2026-10-02: "escrever pelo perfil, ler só o necessário").
--
--   mkt   Marketing, Operador — cria e edita post; não exclui
--   ana   ninguém: só pede compra e lê o que é da empresa toda
--   oper  Compras, Operador — executa compra; não aprova
--   gest  Compras, Gestor — aprova
--   fin   Financeiro, Operador — cadastra fornecedor ao lançar conta
--   ti    TI, Operador — escreve tutorial
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-perfil-mcp', 'Perfil MCP', false) as a;
create temporary table u on commit drop as
select tests.create_user('mkt@mcp.test',  (select a from f)) as mkt,
       tests.create_user('ana@mcp.test',  (select a from f)) as ana,
       tests.create_user('oper@mcp.test', (select a from f)) as oper,
       tests.create_user('gest@mcp.test', (select a from f)) as gest,
       tests.create_user('fin@mcp.test',  (select a from f)) as fin,
       tests.create_user('ti@mcp.test',   (select a from f)) as ti;
select tests.grant_module((select mkt from u), (select a from f), 'marketing');
select tests.grant_profile((select mkt from u), (select a from f), 'marketing', 'Operador');
select tests.grant_module(x, (select a from f), 'compras') from (select oper x from u union all select gest from u) s;
select tests.grant_profile((select oper from u), (select a from f), 'compras', 'Operador');
select tests.grant_profile((select gest from u), (select a from f), 'compras', 'Gestor');
select tests.grant_module((select fin from u), (select a from f), 'financeiro');
select tests.grant_profile((select fin from u), (select a from f), 'financeiro', 'Operador');
select tests.grant_module((select ti from u), (select a from f), 'ti');
select tests.grant_profile((select ti from u), (select a from f), 'ti', 'Operador');

insert into public.mkt_social_posts (tenant_id, title, platform, status)
select a, 'Post do mes', 'instagram', 'draft' from f;
insert into public.suppliers (tenant_id, name) select a, 'Papelaria' from f;
insert into public.pops (tenant_id, title, content, category, is_active, visibility_type)
select a, 'Como trocar o toner', 'x', 'geral', true, 'all' from f;

create temporary table cnt (n int) on commit drop;
create temporary table pedido (ticket uuid) on commit drop;
grant select on f, u to authenticated;
grant select, insert, delete on cnt, pedido to authenticated;

-- ═══ 1-3. Calendário: a Operadora cria (como o PostgREST) e não exclui; quem não é do Marketing não vê. ═══
select tests.authenticate_as('mkt@mcp.test');
select lives_ok($$ insert into public.mkt_social_posts (tenant_id, title, platform, status)
  select a, 'Outro post', 'instagram', 'draft' from f returning id $$, 'a Operadora do Marketing cria post');
with x as (delete from public.mkt_social_posts where title = 'Post do mes' returning 1) insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'e nao exclui (zero linhas, licao 12)');
select tests.clear_authentication();

select tests.authenticate_as('ana@mcp.test');
select is((select count(*)::int from public.mkt_social_posts), 0, 'quem nao e do Marketing nao ve o calendario');

-- ═══ 4-5. Fornecedor: todo mundo lê; cadastrar é do perfil. ═══
select is((select count(*)::int from public.suppliers), 1, 'o fornecedor continua legivel pela empresa toda');
select throws_ok($$ insert into public.suppliers (tenant_id, name) select a, 'Loja da Ana' from f returning id $$,
  '42501', null, 'mas cadastrar fornecedor pede o perfil (antes bastava ser member)');

-- ═══ 6. A Ana pede compra (como a tela pede). ═══
insert into pedido
select public.compras_abrir_pedido(
  '{"title":"Cadeira","description":"A minha quebrou","priority":"low"}'::jsonb,
  '{"product_name":"Cadeira","department":"ti"}'::jsonb,
  '[{"supplier":"Loja A","amount":"500"},{"supplier":"Loja B","amount":"450"},{"supplier":"Loja C","amount":"600"}]'::jsonb
);
-- ═══ 7. A brecha: quem pediu aprovava a própria compra pela API. ═══
select throws_ok($$ update public.compras_solicitacoes
  set status = 'approved', approved_quote_id = (select q.id from public.compras_orcamentos q order by q.amount limit 1)
  where product_name = 'Cadeira' returning id $$,
  '42501', null, 'quem PEDIU nao aprova a propria compra');
select tests.clear_authentication();

select is((select status from public.compras_solicitacoes where product_name = 'Cadeira'), 'pending_approval',
  'o pedido nasceu e continua aguardando aprovacao');

-- ═══ 8-9. Compras: o Operador vê e não aprova; o Gestor aprova. ═══
select tests.authenticate_as('oper@mcp.test');
select throws_ok($$ update public.compras_solicitacoes
  set status = 'approved', approved_quote_id = (select q.id from public.compras_orcamentos q order by q.amount limit 1)
  where product_name = 'Cadeira' returning id $$,
  '42501', null, 'o Operador de Compras (executa, nao aprova) nao aprova');
select tests.clear_authentication();

select tests.authenticate_as('gest@mcp.test');
select lives_ok($$ update public.compras_solicitacoes
  set status = 'approved', approved_quote_id = (select q.id from public.compras_orcamentos q order by q.amount limit 1)
  where product_name = 'Cadeira' returning id $$, 'o Gestor de Compras aprova');
select tests.clear_authentication();

-- ═══ 10. Financeiro cadastra fornecedor ao lançar a conta (SeletorFornecedor). ═══
select tests.authenticate_as('fin@mcp.test');
select lives_ok($$ insert into public.suppliers (tenant_id, name) select a, 'Contabilidade' from f returning id $$,
  'quem lanca conta a pagar cadastra o fornecedor na hora');
select tests.clear_authentication();

-- ═══ 11-13. Tutoriais: escrever é do perfil; o rascunho só aparece para quem escreve. ═══
select tests.authenticate_as('ti@mcp.test');
select lives_ok($$ insert into public.pops (tenant_id, title, content, category, is_active, visibility_type)
  select a, 'Rascunho da TI', 'x', 'geral', false, 'all' from f returning id $$,
  'a TI escreve tutorial e ve o rascunho que acabou de gravar (com returning, licao 11)');
select tests.clear_authentication();

select tests.authenticate_as('ana@mcp.test');
select is((select array_agg(title) from public.pops), array['Como trocar o toner'],
  'quem nao escreve ve o tutorial publicado e nao ve o rascunho');
select throws_ok($$ insert into public.pops (tenant_id, title, content, category, is_active, visibility_type)
  select a, 'Da Ana', 'x', 'geral', true, 'all' from f returning id $$,
  '42501', null, 'e nao escreve tutorial');
select tests.clear_authentication();

-- ═══ 14. As funções novas não abrem para anon (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.compras_ve_as_solicitacoes()', 'execute')
      and not has_function_privilege('anon', 'public.pode_nos_tutoriais(text)', 'execute'), 'anon nao chama');

select * from finish();
rollback;
