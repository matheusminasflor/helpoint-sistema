-- Carteiras e metas do Comercial (L6d). Ver
-- .scratch/plano-l6d-metas-e-carteiras.md e
-- docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
begin;
\ir _helpers.psql

select plan(18);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), um owner em cada, mais dois membros
-- comerciais sem permissão granular nenhuma (`sem_permissao`) e com
-- `metas.definir`+`carteiras.gerir` (`com_permissao`) — regra 12 do pgTAP:
-- RLS de escrita não se prova só com owner. `rep_vip`/`rep_mg` são pessoas do
-- comercial, cada uma numa carteira, para o teste do sino (bloco F/G).
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-l6d', 'Comercial L6d', false) as tenant,
       tests.create_tenant('com-l6d-outro', 'Comercial L6d Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-l6d.test',        (select tenant from f)) as owner,
       tests.create_user('sem-permissao@com-l6d.test', (select tenant from f)) as sem_permissao,
       tests.create_user('com-permissao@com-l6d.test', (select tenant from f)) as com_permissao,
       tests.create_user('rep-vip@com-l6d.test',       (select tenant from f)) as rep_vip,
       tests.create_user('rep-mg@com-l6d.test',        (select tenant from f)) as rep_mg,
       tests.create_user('outro-owner@com-l6d.test',   (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
select tests.grant_role((select sem_permissao from u), 'member');
select tests.grant_module((select sem_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_permissao from u), 'member');
select tests.grant_module((select com_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select rep_vip from u), 'member');
select tests.grant_role((select rep_mg from u), 'member');

-- Perfil que concede carteiras.gerir e metas.definir — só para `com_permissao`.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Carteiras e Metas Teste L6d',
          '{"carteiras": {"gerir": true}, "metas": {"definir": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select com_permissao from u), 'comercial', (select perfil from perfil);

grant select on f, u, perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Empresa nova nasce com as quatro carteiras do dono — mesmo trigger da
-- grade de cashback (`after insert on tenants`). Roda ANTES de qualquer
-- `authenticate_as` (papel do runner) porque este tenant não tem usuário.
--
-- Mutação (rodada e confirmada): `drop trigger trg_com_semear_carteiras on
-- public.tenants;` faz a asserção 1 acusar — `have: 0 want: 4`. Trigger
-- recriado com a definição exata da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f2 on commit drop as
select tests.create_tenant('com-l6d-carteiras-novas', 'Comercial L6d Carteiras Novas', false) as tenant;
grant select on f2 to authenticated;

select is(
  (select count(*)::int from public.com_carteiras where tenant_id = (select tenant from f2)),
  4,
  'tenant novo já nasce com as quatro carteiras do dono — não depende de db push nem de tela'
);
select is(
  (select array_agg(nome order by nome) from public.com_carteiras where tenant_id = (select tenant from f2)),
  array['Berçário', 'Demais Estados', 'MG', 'VIP'],
  'as quatro carteiras nascem com os nomes exatos do §15'
);

select tests.authenticate_as('owner@com-l6d.test');

-- Mapa nome → id das carteiras do tenant principal, para o resto da suíte.
create temporary table carteiras on commit drop as
select nome, id from public.com_carteiras where tenant_id = (select tenant from f);
grant select on carteiras to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixture de clientes e vendas: C1 → VIP, C2 → MG, C3 sem carteira. Uma
-- competência (2025-04) com venda líquida distinta para cada um, mais uma
-- bonificação de C1 no MESMO mês/filial — tudo numa chamada só, porque
-- `com_importar_vendas` reserva a competência por (tenant, filial, mês): uma
-- segunda chamada para o mesmo mês/filial seria "substituir", não somar.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo, carteira_id) values
  ('C1', 'Cliente Um', 'ATACADISTA', true, (select id from carteiras where nome = 'VIP')),
  ('C2', 'Cliente Dois', 'ATACADISTA', true, (select id from carteiras where nome = 'MG')),
  ('C3', 'Cliente Três (sem carteira)', 'ATACADISTA', true, null);

select public.com_importar_vendas('MF', 'fixture-l6d.xlsx', 4, '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-10","documento":"9301","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PL6D","produto_nome":"Produto L6d","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9302","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"Cliente Dois","produto_codigo":"PL6D","produto_nome":"Produto L6d","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9303","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C3","cliente_nome":"Cliente Três","produto_codigo":"PL6D","produto_nome":"Produto L6d","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-15","documento":"9304","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PL6D","produto_nome":"Produto L6d","quantidade":1,"valor_nota":123.45,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Soma das carteiras + "sem carteira" = o total do mês — a conferência
-- que impede a tela de mentir. Comparado contra uma conta independente
-- (soma direta de `com_vendas_itens`), não contra um número fixo: se
-- QUALQUER carteira ficar de fora da soma, os dois lados divergem.
--
-- Mutação (rodada e confirmada): tirar o `union all select null::uuid, 'Sem
-- carteira'` de `carteiras_do_tenant` (o balde deixa de existir na grade)
-- faz esta asserção acusar — com a fixture C1(VIP)=1000 + C3(sem
-- carteira)=500, `have: 1000 want: 1500`, porque a soma passa a não contar
-- C3. Função restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select sum(realizado) from public.com_metas_x_realizado(2025) where competencia = '2025-04-01'),
  (select coalesce(sum(valor_curva) filter (where classe in ('venda', 'devolucao')), 0)
     from public.com_vendas_itens where competencia = '2025-04-01'),
  'soma das carteiras + Sem carteira, em com_metas_x_realizado, fecha com o total independente do mês'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Mês sem meta definida devolve meta NULA (não zero) — e a cobertura
-- também é nula (não divisão por zero). Maio/2025 não tem meta nenhuma.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select meta from public.com_metas_x_realizado(2025) where competencia = '2025-05-01' and carteira_nome = 'VIP'),
  null::numeric,
  'mês sem meta definida devolve meta NULA — "não definiu" ≠ "definiu zero"'
);
select is(
  (select cobertura from public.com_metas_x_realizado(2025) where competencia = '2025-05-01' and carteira_nome = 'VIP'),
  null::numeric,
  'sem meta, a cobertura também é nula — nunca divisão por zero'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Duas metas TOTAIS (carteira_id nulo) no mesmo mês são recusadas — é o
-- índice único com `coalesce` que resolve NULL não ser igual a NULL.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_metas (ano, mes, carteira_id, valor) values (2025, 6, null, 500000);
select throws_like(
  $sql$ insert into public.com_metas (ano, mes, carteira_id, valor) values (2025, 6, null, 600000) $sql$,
  '%duplicate key%',
  'uma segunda meta TOTAL no mesmo ano/mês é recusada pelo índice único'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Reimportar o CSV de clientes não apaga `carteira_id` — `com_importar_
-- clientes` não lista a coluna no `on conflict do update set`.
--
-- Mutação (rodada e confirmada): acrescentar `carteira_id = excluded.
-- carteira_id` (lido como NULL, porque a linha do CSV não traz carteira)
-- ao `on conflict do update set` de `com_importar_clientes` faz esta
-- asserção acusar — `have: (null) want: (não nulo)`. Função restaurada à
-- definição de 20261014010000 antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select public.com_importar_clientes('fixture-l6d-reimport.csv',
  '[{"codigo":"C1","razao_social":"Cliente Um Renomeado","fantasia":null,"tabela_preco":"ATACADISTA","ativo":true}]'::jsonb);

select isnt(
  (select carteira_id from public.com_clientes where codigo = 'C1'),
  null::uuid,
  'reimportar o CSV de clientes não apaga a carteira atribuída a C1'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Definir meta de uma carteira avisa as pessoas dela, e só elas — pelo
-- caminho do usuário (regra 8 do pgTAP: o INSERT que a tela faz, não o
-- trigger chamado na mão). rep_vip está em VIP; rep_mg está em MG.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_carteira_membros (carteira_id, user_id) values
  ((select id from carteiras where nome = 'VIP'), (select rep_vip from u)),
  ((select id from carteiras where nome = 'MG'), (select rep_mg from u));

create temporary table meta_vip on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira_id, valor)
  values (2025, 7, (select id from carteiras where nome = 'VIP'), 50000)
  returning id
)
select id from ins;
grant select on meta_vip to authenticated;

-- A policy de SELECT de `notifications` é "cada um vê só a sua" (`user_id =
-- auth.uid()`) — autenticado como owner, eu só veria as notificações DO
-- OWNER. `clear_authentication` volta ao papel do runner (que ignora RLS),
-- o único jeito de conferir a caixa de rep_vip/rep_mg de fora delas mesmas.
select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications
    where user_id = (select rep_vip from u) and type = 'meta_definida'
      and reference_id = (select id from meta_vip)),
  1,
  'quem é da carteira VIP recebe o aviso da meta de VIP'
);
select is(
  (select count(*)::int from public.notifications
    where user_id = (select rep_mg from u) and type = 'meta_definida'
      and reference_id = (select id from meta_vip)),
  0,
  'quem é de outra carteira (MG) NÃO recebe o aviso da meta de VIP'
);
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Meta TOTAL (carteira_id nulo) não avisa ninguém — é da empresa, não de
-- uma pessoa.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table meta_total on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira_id, valor)
  values (2025, 8, null, 700000)
  returning id
)
select id from ins;
grant select on meta_total to authenticated;

select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications where type = 'meta_definida' and reference_id = (select id from meta_total)),
  0,
  'meta TOTAL da empresa não gera nenhum aviso — carteira_id nulo aqui não é "Sem carteira"'
);
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. `com_atribuir_carteira` por tabela de preço atinge só os daquela
-- tabela, e devolve a contagem certa.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('H1', 'Cliente H Um', 'BERCARIO', true),
  ('H2', 'Cliente H Dois', 'BERCARIO', true),
  ('H3', 'Cliente H Três (outra tabela)', 'VIP MAIS', true);

select is(
  (select public.com_atribuir_carteira((select id from carteiras where nome = 'Berçário'), null, 'BERCARIO')),
  2,
  'com_atribuir_carteira por tabela de preço devolve a contagem certa (2 clientes BERCARIO)'
);
select is(
  (select carteira_id from public.com_clientes where codigo = 'H3'),
  null::uuid,
  'H3 (outra tabela de preço) não foi atingido pela atribuição em lote'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Quem não tem `metas.definir` (e não é admin) não escreve em `com_metas`
-- (42501, via RLS); quem tem, escreve — com RETURNING (regra 11 do pgTAP).
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('sem-permissao@com-l6d.test');
select throws_like(
  $sql$ insert into public.com_metas (ano, mes, carteira_id, valor) values (2025, 9, null, 1000) $sql$,
  '%row-level security%',
  'quem não tem metas.definir (e não é admin) não escreve em com_metas'
);
select tests.clear_authentication();

select tests.authenticate_as('com-permissao@com-l6d.test');
create temporary table ins_meta on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira_id, valor)
  values (2025, 9, (select id from carteiras where nome = 'MG'), 30000)
  returning id
)
select id from ins;
grant select on ins_meta to authenticated;
select is(
  (select count(*)::int from ins_meta),
  1,
  'quem tem metas.definir escreve em com_metas — provado com RETURNING'
);
select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Isolamento entre empresas em com_carteiras e com_metas.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-l6d.test');
insert into public.com_metas (ano, mes, carteira_id, valor)
values (2025, 10, (select id from public.com_carteiras where tenant_id = (select outro_tenant from f) and nome = 'VIP'), 999999);
select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

select is(
  (select count(*)::int from public.com_metas where valor = 999999),
  0,
  'o tenant principal não enxerga a meta gravada pela outra empresa'
);
select is(
  (select count(*)::int from public.com_carteiras where tenant_id = (select outro_tenant from f)),
  0,
  'o tenant principal não enxerga as carteiras da outra empresa'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. `com_conciliacao` devolve a diferença como ela é — nunca arredonda,
-- nunca esconde, nunca some. Bonificação separada de venda líquida.
--
-- Mutação (rodada e confirmada): trocar a `diferenca` por `round(...)`
-- (arredondando para a centena) ou por `case when abs(diferenca) < 100 then
-- 0 else diferenca end` (escondendo diferença pequena) faz a asserção do
-- valor exato acusar — o documento proíbe as duas coisas com todas as
-- letras ("não tente fechar a diferença ajustando número"). Função
-- restaurada à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select soma from public.com_conciliacao(2025, 'MF', null)),
  3500.00 + 123.45,
  'com_conciliacao soma venda líquida + bonificação, exatamente — sem arredondar'
);
select is(
  (select diferenca from public.com_conciliacao(2025, 'MF', 4000.00)),
  4000.00 - (3500.00 + 123.45),
  'a diferença aparece exata (apresentação − soma), nunca ajustada para fechar bonito'
);

select * from finish();
rollback;
