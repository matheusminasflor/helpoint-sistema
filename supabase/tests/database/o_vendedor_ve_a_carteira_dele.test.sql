-- O VENDEDOR VÊ A CARTEIRA DELE (migration 20261109030000)
--
-- Pedido do dono em 2026-09-27: uma chave nas Configurações do Comercial que, quando
-- ligada, faz o vendedor ver só os clientes da carteira dele.
--
-- AS DUAS ASSERÇÕES QUE MAIS IMPORTAM, e nenhuma é o caminho feliz:
--
--   1 e 2 — **com a chave DESLIGADA nada muda.** É o que permite esta migration
--   entrar em produção sem mexer no que funciona. Suíte que só testa a restrição
--   ligada não prova isso, e é a metade que quebraria a empresa inteira;
--   6 — **gestor continua vendo tudo**, com a chave ligada. Um total recortado por
--   carteira apresentado como o total da empresa é número que mente.
--
-- E a 5 cobre a venda: restringir o cliente e esquecer `com_vendas_itens` deixaria o
-- vendedor somar o faturamento de carteira alheia no painel — 39 das 40 funções do
-- Comercial são `security invoker`, então é a RLS que governa o painel.
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-carteira', 'Carteira Vendedor', false) as a;

create temporary table u on commit drop as
select tests.create_user('vendedora@cart.test', (select a from f)) as vendedora,
       tests.create_user('chefe@cart.test',     (select a from f)) as chefe;

-- Quem tem o Comercial e nenhum cargo é o vendedor. O chefe leva `manager`.
select tests.grant_module((select vendedora from u), (select a from f), 'comercial');
select tests.grant_module((select chefe from u),     (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'manager');

-- Ela é membro de SUL; NORTE é de outra pessoa; e um cliente sem carteira nenhuma.
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select vendedora from u), 'SUL', true);

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem)
values ((select a from f), 'S-1', 'CLIENTE DO SUL',   'SUL',   true, 'cadastro'),
       ((select a from f), 'N-1', 'CLIENTE DO NORTE', 'NORTE', true, 'cadastro'),
       ((select a from f), 'X-1', 'CLIENTE SEM CARTEIRA', null, true, 'cadastro');

-- A venda precisa de uma importação: `importacao_id` é NOT NULL. E `competencia`,
-- `valor_curva` e `quantidade_curva` são colunas GERADAS — não se escreve nelas.
create temporary table imp on commit drop as
select id from (
  insert into public.com_vendas_importacoes (tenant_id, tipo, file_name, linhas_lidas)
  select a, 'vendas', 'pgtap-carteira.xls', 2 from f
  returning id
) x;

insert into public.com_vendas_itens
  (tenant_id, importacao_id, filial, emissao, documento, serie, cfop, classe,
   cliente_codigo, produto_codigo, produto_nome, quantidade, valor_nota)
values ((select a from f), (select id from imp), 'MF', '2026-09-10', '1001', '1', '5102', 'venda',
        'S-1', 'P1', 'Produto', 1, 100),
       ((select a from f), (select id from imp), 'MF', '2026-09-10', '1002', '1', '5102', 'venda',
        'N-1', 'P1', 'Produto', 1, 200);

-- ── Chave DESLIGADA (o padrão): nada muda ────────────────────────────────────
select tests.authenticate_as('vendedora@cart.test');

select is(
  (select count(*)::int from public.com_clientes),
  3,
  'chave desligada: a vendedora ve os tres clientes, como sempre'
);

select is(
  (select count(*)::int from public.com_vendas_itens),
  2,
  'chave desligada: e ve as duas vendas'
);

select tests.clear_authentication();

-- ── Chave LIGADA ─────────────────────────────────────────────────────────────
update public.tenants
   set settings = coalesce(settings, '{}'::jsonb)
       || jsonb_build_object('comercial', jsonb_build_object('vendedorSoVeSuaCarteira', true))
 where id = (select a from f);

select tests.authenticate_as('vendedora@cart.test');

select is(
  (select count(*)::int from public.com_clientes),
  1,
  'chave ligada: a vendedora ve so o cliente da carteira dela'
);

select is(
  (select codigo from public.com_clientes),
  'S-1',
  'e e o do SUL, a carteira de que ela e membro'
);

select is(
  (select count(*)::int from public.com_vendas_itens),
  1,
  'a venda segue a carteira do cliente: ela nao soma o faturamento do NORTE'
);

select is(
  (select valor_nota from public.com_vendas_itens),
  100::numeric,
  'e o valor que ela ve e o da venda dela, nao os 300 da empresa'
);

select tests.clear_authentication();

-- ── Gestor continua vendo tudo, com a chave ligada ───────────────────────────
select tests.authenticate_as('chefe@cart.test');
select is(
  (select count(*)::int from public.com_clientes),
  3,
  'gestor continua vendo a empresa inteira: total recortado seria numero que mente'
);
select tests.clear_authentication();

select * from finish();
rollback;
