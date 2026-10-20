-- O NOME DA CATEGORIA VEM DO BANCO (migration 20270129110000; dono, 2026-10-20 — o #142 da automação nasceu
-- "sem categoria": tinha o id, não o nome). Vale para todo chamado aberto sem passar pelo formulário.
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-nome-categoria', 'NomeCategoria', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@nomecat.test', (select a from f)) as dono;

create temporary table cat on commit drop as
with raiz as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'tickets', 'Sistemas' from f returning id
), sub as (
  insert into public.ti_categories (tenant_id, module, name, parent_id) select a, 'tickets', 'Forteplus', (select id from raiz) from f returning id
), item as (
  insert into public.ti_categories (tenant_id, module, name, parent_id) select a, 'tickets', 'Relatórios', (select id from sub) from f returning id
), outra as (
  insert into public.ti_categories (tenant_id, module, name) select a, 'tickets', 'Hardware' from f returning id
) select (select id from raiz) as raiz, (select id from item) as item, (select id from outra) as outra;

-- ═══ 1-2. Só com o id (como a automação faz): o banco escreve categoria e caminho ═══
create temporary table t on commit drop as
with x as (
  insert into public.tickets (tenant_id, module, title, description, category_id, requester_id, created_by)
  select a, 'tickets', 'Importação', 'x', (select item from cat), (select dono from u), (select dono from u) from f
  returning id
) select id from x;

select is((select category from public.tickets where id = (select id from t)), 'Sistemas',
  'chamado aberto so com o id ganha a categoria principal');
select is((select subcategory from public.tickets where id = (select id from t)), 'Forteplus › Relatórios',
  'e o caminho ate o item, no formato do formulario');

-- ═══ 3. O nome que o formulário mandou fica ═══
insert into public.tickets (tenant_id, module, title, description, category_id, category, requester_id, created_by)
select a, 'tickets', 'Do formulario', 'x', (select raiz from cat), 'Sistemas', (select dono from u), (select dono from u) from f;
select is((select subcategory from public.tickets where title = 'Do formulario' and tenant_id = (select a from f)), null,
  'o banco nao reescreve o que o formulario ja mandou');

-- ═══ 4. Trocar só o id (transferência entre setores) atualiza o nome ═══
update public.tickets set category_id = (select outra from cat) where id = (select id from t);
select is((select category || coalesce(' / ' || subcategory, '') from public.tickets where id = (select id from t)), 'Hardware',
  'trocar so o id troca o nome e limpa a subcategoria');

-- ═══ 5. Chamado sem categoria nenhuma continua passando (os caminhos sem id são outros) ═══
select lives_ok($$
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by)
  select a, 'tickets', 'Sem id', 'x', (select dono from u), (select dono from u) from f $$,
  'sem id o gatilho nao atrapalha');

select * from finish();
rollback;
