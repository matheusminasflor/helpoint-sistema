-- Responsáveis da categoria (migration 20261126010000; decisão do dono, 2026-10-03).
--
--   mel   Marketing — a única que faz "Criação de Arte"
--   gi    Marketing — divide "Evento" com a Mel
--   ana   pede chamado; não configura nada
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-resp-cat', 'Resp Cat', false) as a;
create temporary table u on commit drop as
select tests.create_user('mel@respcat.test', (select a from f)) as mel,
       tests.create_user('gi@respcat.test',  (select a from f)) as gi,
       tests.create_user('ana@respcat.test', (select a from f)) as ana;
select tests.grant_module(x, (select a from f), 'marketing') from (select mel x from u union all select gi from u) s;

create temporary table cat on commit drop as
with arte as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Criação de Arte' from f returning id
), banner as (
  insert into public.ti_categories (tenant_id, module, name, parent_id) select a, 'marketing', 'Banner', (select id from arte) from f returning id
), evento as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Evento' from f returning id
), outros as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'marketing', 'Outros' from f returning id
) select (select id from arte) arte, (select id from banner) banner, (select id from evento) evento, (select id from outros) outros;

insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
select a, (select arte from cat), (select mel from u) from f
union all select a, (select evento from cat), (select mel from u) from f
union all select a, (select evento from cat), (select gi from u) from f;

create temporary table novo (id uuid, assigned uuid) on commit drop;
grant select on f, u, cat to authenticated;
grant select, insert, delete on novo to authenticated;

select tests.authenticate_as('ana@respcat.test');

-- ═══ 1. A subcategoria herda: o banner vai para a Mel sem ninguém escolher. ═══
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'marketing', 'Banner da feira', 'x', (select ana from u), (select banner from cat) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), (select mel from u), 'a subcategoria herda a responsavel da categoria de cima');
delete from novo;

-- ═══ 2. Responsável único manda: escolher outra pessoa não vale. ═══
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id, assigned_to)
  select a, 'marketing', 'Arte do post', 'x', (select ana from u), (select arte from cat), (select gi from u) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), (select mel from u), 'com uma so responsavel, o chamado vai para ela mesmo escolhendo outra');
delete from novo;

-- ═══ 3-4. Com duas: escolher uma delas vale; não escolher é recusado. ═══
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id, assigned_to)
  select a, 'marketing', 'Feira', 'x', (select ana from u), (select evento from cat), (select gi from u) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), (select gi from u), 'com duas, a escolhida entre elas fica');
delete from novo;
select throws_ok($$ insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'marketing', 'Feira 2', 'x', (select ana from u), (select evento from cat) from f returning id $$,
  '23514', null, 'com duas e sem escolha, o banco pede para escolher');

-- ═══ 5. Categoria sem responsável: fila, como antes. ═══
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'marketing', 'Outra coisa', 'x', (select ana from u), (select outros from cat) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), null::uuid, 'sem responsavel, o chamado cai na fila do setor');
delete from novo;

-- ═══ 6. Quem não configura o setor não mexe nos responsáveis. ═══
select throws_ok($$ insert into public.ti_category_responsaveis (tenant_id, category_id, user_id)
  select a, (select outros from cat), (select ana from u) from f returning id $$,
  '42501', null, 'quem nao configura o Marketing nao define responsavel');

-- ═══ 7. O formulário lê a lista (e o nome). ═══
select is((select count(*)::int from public.responsaveis_da_categoria((select evento from cat))), 2,
  'quem abre o chamado consegue ler os responsaveis');
select tests.clear_authentication();

-- ═══ 8. A Mel perdeu o acesso ao Marketing: deixa de contar, e o chamado vai para a fila. ═══
delete from public.user_module_access where user_id = (select mel from u) and module = 'marketing';
select tests.authenticate_as('ana@respcat.test');
with t as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, category_id)
  select a, 'marketing', 'Arte 2', 'x', (select ana from u), (select arte from cat) from f
  returning id, assigned_to
) insert into novo select * from t;
select is((select assigned from novo), null::uuid, 'responsavel sem acesso ao setor nao recebe: fila');
select tests.clear_authentication();

-- ═══ 9. anon não chama (lição 14). ═══
select ok(not has_function_privilege('anon', 'public.responsaveis_da_categoria(uuid)', 'execute'), 'anon nao chama');

select * from finish();
rollback;
