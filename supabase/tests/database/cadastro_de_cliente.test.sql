-- O CADASTRO DE CLIENTE DO COMERCIAL (migration 20261105010000)
--
-- Leva G (2026-09-26), quatro decisões do dono. As três que o banco garante:
--
-- 1. **A importação não apaga o que é nosso.** Esta é a asserção que a leva
--    inteira depende, e é a CORRENTE (regra 8), não o comando: cadastrar com
--    telefone e CNPJ, rodar a importação do Forteplus com a razão social
--    diferente, e conferir que a razão social voltou ao que o ERP manda **e** que
--    o telefone e o CNPJ continuam lá. Testar só o `update` provaria nada:
--    quem apaga seria a importação.
--
-- 2. **O documento é só dígitos, 11 ou 14.** Porque é por ele que o chamado do
--    SAC encontra o cliente, e `08.319.138/0001-60` nunca casa com
--    `08319138000160`. O sintoma de errar isso não é erro: é "nenhum chamado",
--    que é indistinguível de "não tem chamado".
--
-- 3. **Quem tem o Comercial edita; a Diretoria lê e não edita.** A ficha é o
--    MESMO componente nos dois módulos, e a policy de SELECT inclui a Diretoria.
--    Sem esta asserção, o diretor puro veria o botão "Editar", salvaria, e o
--    PostgREST responderia 200 com zero linhas.
--
-- Regra 12 do pgTAP: UPDATE barrado por policy NÃO levanta erro — a linha é
-- filtrada e o comando afeta zero linhas. Por isso a asserção do diretor confere
-- o VALOR, e não espera exceção.
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-cadcli', 'Cadastro Cliente', false) as a;

create temporary table u on commit drop as
select tests.create_user('vendedor@cadcli.test',   (select a from f)) as vendedor,
       tests.create_user('importador@cadcli.test', (select a from f)) as importador,
       tests.create_user('diretor@cadcli.test',    (select a from f)) as diretor;
-- Ninguém leva cargo: cargo de gestor abriria o Comercial por trás
-- (`is_supervisor_or_higher` dentro de `has_comercial_access`) e o teste mediria
-- outra coisa.
--
-- E são TRÊS pessoas porque são três portas diferentes, o que este teste
-- descobriu ao ser escrito: **quem tem o Comercial edita o cadastro mas NÃO
-- importa**. A importação pede `is_admin_or_higher` ou a permissão
-- `vendas:importar`, porque ela escreve em `com_vendas_importacoes` também. Está
-- certo assim — o vendedor corrige o telefone do cliente dele, e não substitui a
-- base inteira.
select tests.grant_module((select vendedor from u),   (select a from f), 'comercial');
select tests.grant_module((select importador from u), (select a from f), 'comercial');
select tests.grant_module((select diretor from u),    (select a from f), 'diretoria');

create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  select a, 'comercial', 'Importa vendas', '{"vendas": {"importar": true}}'::jsonb
  from f returning id
) select id from ins;
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select a, (select importador from u), 'comercial', (select id from perfil) from f;
grant select on f, u, perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A forma do documento
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento)
     select a, 'P1', 'Pontuado', true, 'cadastro', '08.319.138/0001-60' from f $$,
  '23514', null,
  'documento PONTUADO e recusado — o SAC grava so digitos, e texto pontuado nunca casa'
);
select throws_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento)
     select a, 'P2', 'Treze digitos', true, 'cadastro', '0831913800016' from f $$,
  '23514', null,
  'nem 13 digitos: CNPJ tem 14 e CPF tem 11'
);
select lives_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento)
     select a, 'CPF1', 'Salao da esquina', true, 'cadastro', '12345678909' from f returning id $$,
  'CPF de 11 digitos passa: salao que compra como pessoa fisica existe'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Um documento, um cliente
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table c1 on commit drop as
with ins as (
  insert into public.com_clientes (tenant_id, codigo, razao_social, fantasia, tabela_preco, ativo, origem,
                                   documento, telefone, email, endereco)
  select a, '2010', 'MAKER INDUSTRIA LTDA', 'Maker', 'ATACADISTA', true, 'cadastro',
         '08319138000160', '(32) 99999-0000', 'compras@maker.test', 'Rua A, 100 — Juiz de Fora'
  from f returning id
) select id from ins;
grant select on c1 to authenticated;

select throws_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento)
     select a, '2011', 'MAKER DE NOVO', true, 'cadastro', '08319138000160' from f $$,
  '23505', null,
  'o mesmo documento duas vezes na empresa e recusado — seria o chamado do SAC em duas fichas'
);
select lives_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem)
     select a, '3000', 'Sem documento 1', true, 'cadastro' from f returning id $$,
  'mas dois clientes SEM documento convivem: o indice e parcial, e nulo nao colide com nulo'
);
select lives_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem)
     select a, '3001', 'Sem documento 2', true, 'cadastro' from f returning id $$,
  'e o segundo tambem'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A CORRENTE: a importação não apaga o que é nosso
-- ═══════════════════════════════════════════════════════════════════════════
-- `com_importar_clientes` não é `security definer`: ela grava com os poderes de
-- quem chama, então o teste autentica antes — é o caminho que o usuário percorre.
-- E é o IMPORTADOR quem roda, não o vendedor: a importação também escreve em
-- `com_vendas_importacoes`, cuja policy pede `is_admin_or_higher` ou
-- `vendas:importar`.
select tests.authenticate_as('importador@cadcli.test');

select public.com_importar_clientes('CLIENTESXTABELA.csv', jsonb_build_array(
  jsonb_build_object(
    'codigo', '2010',
    'razao_social', 'MAKER INDUSTRIA, COMERCIO, IMPORTACAO E EXPORTACAO',
    'fantasia', 'Maker Cosmeticos',
    'tabela_preco', 'VIP',
    'ativo', true
  )
));

select is(
  (select razao_social from public.com_clientes where codigo = '2010'),
  'MAKER INDUSTRIA, COMERCIO, IMPORTACAO E EXPORTACAO',
  'a importacao MANDA nos cinco campos dela: a razao social voltou ao que o ERP diz'
);
select is(
  (select tabela_preco from public.com_clientes where codigo = '2010'),
  'VIP',
  'e a tabela de preco tambem'
);
select is(
  (select row(documento, telefone, email, endereco)
     from public.com_clientes where codigo = '2010'),
  row('08319138000160'::text, '(32) 99999-0000'::text, 'compras@maker.test'::text,
      'Rua A, 100 — Juiz de Fora'::text),
  'e NAO TOCA no que nasceu aqui: documento, telefone, e-mail e endereco atravessam a carga'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quem edita
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('vendedor@cadcli.test');
select lives_ok(
  $$ insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem)
     select a, '4000', 'Cadastrado pelo vendedor', true, 'cadastro' from f returning id $$,
  'quem tem o Comercial cadastra cliente — era so admin ou quem importa, e o vendedor nao corrigia nem telefone'
);
select tests.clear_authentication();

-- O diretor puro: LÊ (a policy de SELECT inclui a Diretoria) e não grava.
select tests.authenticate_as('diretor@cadcli.test');
update public.com_clientes set telefone = '(11) 0000-0000' where codigo = '2010';
select is(
  (select telefone from public.com_clientes where codigo = '2010'),
  '(32) 99999-0000',
  'e o diretor puro LE o cadastro e nao grava: o UPDATE nao levanta erro, so nao pega linha'
);
select tests.clear_authentication();

select * from finish();
rollback;
