-- O modelo único de clientes (migration 20261119040000_modelo_unico_de_clientes.sql)
--
-- Um arquivo só para cadastro, tabela, ficha e carteira. A regra do dono: a planilha muda (valor
-- diferente substitui; vazio não mexe), e a prévia (p_confirmar = false) é a mesma conta da gravação.
--
--   gestor  Comercial Gestor (importa vendas e gere carteiras)
--   comum   só o módulo Comercial — não importa cadastro
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('modelo-clientes', 'Modelo Clientes', false) as a;

create temporary table u on commit drop as
select tests.create_user('gestor@modelocli.test', (select a from f)) as gestor,
       tests.create_user('comum@modelocli.test',  (select a from f)) as comum;
select tests.grant_module((select gestor from u), (select a from f), 'comercial');
select tests.grant_profile((select gestor from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_module((select comum from u), (select a from f), 'comercial');

insert into public.com_clientes (tenant_id, codigo, razao_social, tabela_preco, cidade, carteira, origem) values
  ((select a from f), '100', 'CLIENTE CEM', 'VAREJO', 'BH', 'MG', 'cadastro');

grant select on f, u to authenticated;

-- O arquivo: o 100 muda tabela e endereço e deixa a cidade em branco; o 200 é novo; o 300 é novo
-- sem razão social.
create temporary table arq on commit drop as
select '[{"codigo":"100","tabela_preco":"ATACADO","endereco":"RUA A, 10"},
         {"codigo":"200","razao_social":"CLIENTE DUZENTOS","tabela_preco":"VAREJO","carteira":"SP"},
         {"codigo":"300","cidade":"RIO"}]'::jsonb as linhas;
grant select on arq to authenticated;

-- ═══ 1 a 4. A prévia: lista e não grava. ═══
select tests.authenticate_as('gestor@modelocli.test');
create temporary table previa on commit drop as
select public.com_importar_modelo_de_clientes('m.xlsx', (select linhas from arq), '[]'::jsonb, false) as r;

select is((select jsonb_array_length(r -> 'novos') from previa), 1, 'a prévia conta 1 cliente novo (o 200)');
select is(
  (select jsonb_agg(c ->> 'campo' order by c ->> 'campo') from previa, jsonb_array_elements(r -> 'mudam' -> 0 -> 'campos') c),
  '["endereco", "tabela_preco"]'::jsonb,
  'o 100 muda tabela e endereço — a cidade em branco não aparece'
);
select is((select r -> 'sem_razao' from previa), '["300"]'::jsonb, 'código novo sem razão social fica de fora');
select is((select tabela_preco from public.com_clientes where codigo = '100'), 'VAREJO', 'e a prévia não gravou nada');

-- ═══ 5 a 9. Gravar. ═══
select lives_ok(
  $$select public.com_importar_modelo_de_clientes('m.xlsx', (select linhas from arq), '[]'::jsonb, true)$$,
  'o gestor importa'
);
select is((select tabela_preco from public.com_clientes where codigo = '100'), 'ATACADO', 'a planilha muda a tabela');
select is((select cidade from public.com_clientes where codigo = '100'), 'BH', 'e a célula vazia não mexeu na cidade');
select is((select count(*)::int from public.com_clientes_tabela_historico where cliente_codigo = '100'), 1,
  'a tabela trocada ficou no histórico');
select is((select carteira from public.com_clientes where codigo = '200'), 'SP', 'o cliente novo nasceu já na carteira');

-- ═══ 10. Rodar o mesmo arquivo de novo não muda nada. ═══
select is(
  (select jsonb_array_length(public.com_importar_modelo_de_clientes('m.xlsx', (select linhas from arq), '[]'::jsonb, false) -> 'mudam')),
  0,
  'o mesmo arquivo de novo: ninguém muda'
);
select tests.clear_authentication();

-- ═══ 11. Quem só tem o módulo não importa cadastro. ═══
select tests.authenticate_as('comum@modelocli.test');
select throws_ok(
  $$select public.com_importar_modelo_de_clientes('m.xlsx', (select linhas from arq), '[]'::jsonb, false)$$,
  '42501', null,
  'sem "importar" no perfil, nada passa'
);
select tests.clear_authentication();

-- ═══ 12. anon não alcança (lição 14). ═══
select is(has_function_privilege('anon', 'public.com_importar_modelo_de_clientes(text, jsonb, jsonb, boolean)', 'execute'),
  false, 'anon não chama a importação');

select * from finish();
rollback;
