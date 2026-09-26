-- O CATÁLOGO DE PRODUTOS DE COMPRA TEM PORTA, E NÃO SÓ BOTÃO CINZA
-- (migration 20261103050000)
--
-- Leva I (Compras), 2026-09-26.
--
-- A L8 fez a tela de catálogo ficar cinza para quem não tem
-- `purchases:manage_products`, e a RLS continuou `tenant_id = get_user_tenant_id()`
-- para INSERT e UPDATE: qualquer pessoa da empresa — inclusive `viewer` —
-- cadastrava e renomeava produto pela porta do PostgREST. Estava registrado em
-- `nao-funciona.md` como "controle só de tela".
--
-- Não foi fechado antes porque o **cadastro rápido** dentro do formulário de
-- compra dependia da porta aberta. Nesta leva o formulário ganhou a terceira
-- saída — usar o nome digitado sem cadastrar —, e por isso a porta pode fechar.
--
-- O QUE ESTA SUÍTE PRENDE:
--
-- 1. quem não tem a permissão não INSERE nem ATUALIZA produto;
-- 2. quem é gestor entra (a expressão da policy é a mesma que a tela usa em
--    `can()`: gestor para cima passa direto);
-- 3. quem NÃO é gestor mas tem a permissão marcada no perfil de acesso entra —
--    é isto que faz o escopo deixar de ser enfeite;
-- 4. **a compra continua possível sem o catálogo.** Esta é a asserção que impede
--    a correção virar bloqueio: `product_id` nulo com `product_name` escrito tem
--    de atravessar, senão fechar a porta tirou de muita gente a possibilidade de
--    abrir compra.
--
-- Regra 12 do pgTAP: INSERT barrado por WITH CHECK levanta 42501; UPDATE barrado
-- por policy NÃO levanta — a linha é filtrada e o comando afeta zero linhas. Por
-- isso a asserção do UPDATE conta linhas em vez de esperar erro.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-catalogo', 'Catalogo', false) as a;

create temporary table u on commit drop as
select tests.create_user('gestor@cat.test',  (select a from f)) as gestor,
       tests.create_user('comum@cat.test',   (select a from f)) as comum,
       tests.create_user('comperm@cat.test', (select a from f)) as com_permissao;
select tests.grant_module((select gestor from u),        (select a from f), 'financeiro');
select tests.grant_module((select comum from u),         (select a from f), 'financeiro');
select tests.grant_module((select com_permissao from u), (select a from f), 'financeiro');
select tests.grant_role((select gestor from u), 'manager');
select tests.grant_role((select comum from u), 'member');
select tests.grant_role((select com_permissao from u), 'member');
grant select on f, u to authenticated;

-- O perfil de acesso que concede a permissão. `tem_permissao` lê
-- `access_profiles.permissions -> 'purchases' -> 'manage_products'`, ou o
-- override em `user_access_profiles`.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  select a, 'financeiro', 'Cuida do catalogo',
         '{"purchases": {"manage_products": true}}'::jsonb
  from f returning id
) select id from ins;
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select a, (select com_permissao from u), 'financeiro', (select id from perfil) from f;
grant select on perfil to authenticated;

create temporary table prod on commit drop as
with ins as (
  insert into public.fin_purchase_products (tenant_id, name) select a, 'Resma A4' from f
  returning id
) select id from ins;
grant select on prod to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Quem não tem a permissão
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('comum@cat.test');

select throws_ok(
  $$ insert into public.fin_purchase_products (tenant_id, name)
     select a, 'Caneta' from f returning id $$,
  '42501',
  null,
  'quem nao tem a permissao NAO cadastra produto — nem pela porta do banco'
);

-- Regra 12: o UPDATE não levanta, é filtrado. Conta-se.
update public.fin_purchase_products set name = 'Resma renomeada' where id = (select id from prod);
select is(
  (select name from public.fin_purchase_products where id = (select id from prod)),
  'Resma A4',
  'e nao renomeia: o UPDATE nao levanta erro, so nao pega linha nenhuma'
);

-- E continua conseguindo VER o catálogo, que é o que o formulário de compra
-- precisa para oferecer a busca.
select is(
  (select count(*)::int from public.fin_purchase_products),
  1,
  'mas continua vendo o catalogo: e dele que sai a busca do formulario de compra'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Gestor e quem tem a permissão marcada
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('gestor@cat.test');
select lives_ok(
  $$ insert into public.fin_purchase_products (tenant_id, name)
     select a, 'Monitor' from f returning id $$,
  'gestor cadastra — a policy passa direto para owner/admin/manager, como a tela'
);
select tests.clear_authentication();

select tests.authenticate_as('comperm@cat.test');
select lives_ok(
  $$ insert into public.fin_purchase_products (tenant_id, name)
     select a, 'Teclado' from f returning id $$,
  'e quem NAO e gestor mas tem a permissao marcada tambem — o escopo deixou de ser enfeite'
);
select tests.clear_authentication();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A compra continua possível sem o catálogo
-- ───────────────────────────────────────────────────────────────────────────
-- A asserção que impede a correção virar bloqueio.
create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase)
  select a, 'financeiro', 'Compra', true from f returning id
) select id from ins;
create temporary table ch on commit drop as
with ins as (
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', 'Comprar coisa que nao esta no catalogo', 'x', 'medium', 'open',
         (select comum from u), (select id from cat) from f
  returning id
) select id from ins;
grant select on cat, ch to authenticated;

select lives_ok(
  $$ insert into public.fin_purchase_requests
       (tenant_id, ticket_id, product_id, product_name, department, estimated_amount, status, created_by)
     select a, (select id from ch), null, 'Parafuso sextavado M8', 'producao', 30.00,
            'pending_approval', (select comum from u)
     from f returning id $$,
  'compra com produto FORA do catalogo atravessa: product_id e opcional e sempre foi'
);

select is(
  (select product_id from public.fin_purchase_requests where ticket_id = (select id from ch)),
  null,
  'e ela fica com o nome escrito e sem produto do catalogo, que e a verdade sobre ela'
);

select * from finish();
rollback;
