-- IMPORTAÇÃO DAS CARTEIRAS PELO MODELO (migrations 20261117010000 e 20261117020000)
--
-- O arquivo sai do próprio sistema com a carteira atual de cada cliente; o dono decidiu que o que
-- estiver na planilha manda (2026-09-29). As provas:
--   1 — a prévia não grava nada;
--   2 — a prévia conta: entram, mudam (com de onde), grupos, códigos que não existem;
--   3 — confirmar grava a carteira, já com a renomeação da Diretoria (VIP → ESPECIAL);
--   4 — a planilha muda: cliente que estava em outra carteira passa para a da planilha;
--   5 — grupo preenchido e diferente muda; vazio não toca;
--   6 — a vendedora escolhida vira a responsável da carteira;
--   7 — rodar de novo não muda nada (entram 0, mudam 0);
--   8 — a PROVA DO "SEM CONFLITO FUTURO": a importação de clientes do Forteplus roda depois e
--       carteira e grupo continuam iguais;
--   9 — quem não gere as carteiras não importa;
--  10 — código repetido no envio é recusado.
begin;
\ir _helpers.psql

select plan(10);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-imp-carteiras', 'Importa Carteiras', false) as a;
create temporary table u on commit drop as
select tests.create_user('gestor@impcart.test', (select a from f)) as gestor,
       tests.create_user('vendedora@impcart.test', (select a from f)) as vendedora,
       tests.create_user('comum@impcart.test', (select a from f)) as comum;
select tests.grant_module((select gestor from u), (select a from f), 'comercial');
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select comum from u), (select a from f), 'comercial');
grant select on f, u to authenticated;

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, grupo, origem) values
  ((select a from f), 'C1', 'CLIENTE UM', null, null, 'cadastro'),
  ((select a from f), 'C2', 'CLIENTE DOIS', 'MG', null, 'cadastro'),
  ((select a from f), 'C3', 'LOJA TRES', null, null, 'cadastro'),
  ((select a from f), 'C4', 'LOJA QUATRO', null, 'ANTIGO', 'cadastro');
insert into public.com_carteira_renomeacoes (tenant_id, de, para) values ((select a from f), 'VIP', 'ESPECIAL');

-- O envio, como a tela manda: a carteira VIP, com um cliente sem carteira, dois com grupo, um que
-- está na MG e um código que não existe no cadastro.
create temporary table envio on commit drop as
select jsonb_build_array(jsonb_build_object(
  'carteira', 'VIP',
  'responsavel', (select vendedora from u),
  'clientes', jsonb_build_array(
    jsonb_build_object('codigo', 'C1', 'nome', 'CLIENTE UM', 'grupo', null),
    jsonb_build_object('codigo', 'C3', 'nome', 'LOJA TRES', 'grupo', 'GRUPO LOJAS'),
    jsonb_build_object('codigo', 'C4', 'nome', 'LOJA QUATRO', 'grupo', 'GRUPO LOJAS'),
    jsonb_build_object('codigo', 'C2', 'nome', 'CLIENTE DOIS', 'grupo', ''),
    jsonb_build_object('codigo', '9999', 'nome', 'NAO EXISTE', 'grupo', null)
  )
)) as p;
create temporary table previa (r jsonb) on commit drop;
grant select on envio to authenticated;
grant select, insert, delete on previa to authenticated;

select tests.authenticate_as('gestor@impcart.test');
insert into previa select public.com_importar_carteiras((select p from envio), false);
select tests.clear_authentication();

select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = 'C1'),
  null::text, 'a previa nao grava nada');

select is(
  (select jsonb_build_object('carteira', c ->> 'carteira', 'entram', (c ->> 'entram')::int,
                             'mudam', c -> 'mudam',
                             'nao_encontrados', c -> 'nao_encontrados', 'grupos', (c ->> 'grupos')::int)
     from previa, jsonb_array_elements(r -> 'carteiras') c),
  '{"carteira": "ESPECIAL", "entram": 3, "mudam": [{"codigo": "C2", "nome": "CLIENTE DOIS", "de": "MG"}],
    "nao_encontrados": ["9999"], "grupos": 2}'::jsonb,
  'a previa conta: 3 entram, 1 muda de MG, 2 grupos, 1 codigo que nao existe, ja na carteira renomeada');

select tests.authenticate_as('gestor@impcart.test');
select public.com_importar_carteiras((select p from envio), true);
select tests.clear_authentication();

select is(
  (select array_agg(carteira order by codigo) from public.com_clientes
    where tenant_id = (select a from f) and codigo in ('C1', 'C3', 'C4')),
  array['ESPECIAL', 'ESPECIAL', 'ESPECIAL'],
  'confirmar grava a carteira, com a renomeacao da Diretoria');
select is((select carteira from public.com_clientes where tenant_id = (select a from f) and codigo = 'C2'),
  'ESPECIAL', 'a planilha muda: quem estava na MG passa para a carteira da planilha');
select is(
  (select array_agg(coalesce(grupo, '-') order by codigo) from public.com_clientes
    where tenant_id = (select a from f) and codigo in ('C1', 'C2', 'C3', 'C4')),
  array['-', '-', 'GRUPO LOJAS', 'GRUPO LOJAS'],
  'grupo preenchido e diferente muda (ANTIGO vira GRUPO LOJAS); vazio nao toca');
select is(
  (select carteira || ':' || responsavel::text from public.com_carteira_membros
    where tenant_id = (select a from f) and user_id = (select vendedora from u)),
  'ESPECIAL:true', 'a vendedora escolhida vira a responsavel da carteira');

delete from previa;
select tests.authenticate_as('gestor@impcart.test');
insert into previa select public.com_importar_carteiras((select p from envio), true);
select tests.clear_authentication();
select is(
  (select (c ->> 'entram')::int + jsonb_array_length(c -> 'mudam') + (c ->> 'grupos')::int
     from previa, jsonb_array_elements(r -> 'carteiras') c),
  0, 'rodar de novo nao muda nada');

-- 8. A importação de clientes do Forteplus, depois: atualiza o cadastro e não toca na carteira.
select tests.authenticate_as('gestor@impcart.test');
select public.com_importar_clientes('clientes.csv', jsonb_build_array(
  jsonb_build_object('codigo', 'C1', 'razao_social', 'CLIENTE UM NOVO NOME', 'tabela_preco', 'VIP', 'ativo', true),
  jsonb_build_object('codigo', 'C3', 'razao_social', 'LOJA TRES', 'tabela_preco', 'ATACADISTA', 'ativo', true)
));
select tests.clear_authentication();
select is(
  (select array_agg(razao_social || '|' || carteira || '|' || coalesce(grupo, '-') order by codigo)
     from public.com_clientes where tenant_id = (select a from f) and codigo in ('C1', 'C3')),
  array['CLIENTE UM NOVO NOME|ESPECIAL|-', 'LOJA TRES|ESPECIAL|GRUPO LOJAS'],
  'a importacao do Forteplus depois atualiza o cadastro e nao toca em carteira nem grupo');

select tests.authenticate_as('comum@impcart.test');
select throws_ok($$ select public.com_importar_carteiras((select p from envio), false) $$,
  '42501', null, 'quem nao gere as carteiras nao importa');
select tests.clear_authentication();

select tests.authenticate_as('gestor@impcart.test');
select throws_ok(
  $$ select public.com_importar_carteiras('[{"carteira":"MG","clientes":[{"codigo":"C1","nome":"A"}]},{"carteira":"ESPECIAL","clientes":[{"codigo":"C1","nome":"B"}]}]'::jsonb, false) $$,
  '22023', null, 'codigo repetido no envio e recusado');
select tests.clear_authentication();

select * from finish();
rollback;
