-- Carteiras e metas do Comercial (L6d). Ver
-- .scratch/plano-l6d-metas-e-carteiras.md e
-- docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
begin;
\ir _helpers.psql

select plan(39);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), um owner em cada, mais dois membros
-- comerciais sem permissão granular nenhuma (`sem_permissao`) e com
-- `metas.definir`+`carteiras.gerir` (`com_permissao`) — regra 12 do pgTAP:
-- RLS de escrita não se prova só com owner. `rep_vip`/`rep_mg` são pessoas do
-- comercial, cada uma numa carteira, para o teste do sino (bloco F/G).
-- `diretor_puro` (L6d lacuna 2) só tem o módulo Diretoria — nem módulo
-- Comercial, nem cargo owner/admin/manager: é o diretor que a lacuna 2
-- deixava sem acesso a Meta×Realizado/Conciliação.
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
       tests.create_user('diretor-puro@com-l6d.test',  (select tenant from f)) as diretor_puro,
       tests.create_user('outro-owner@com-l6d.test',   (select outro_tenant from f)) as outro_owner;

select tests.grant_role((select owner from u), 'owner');
select tests.grant_role((select outro_owner from u), 'owner');
select tests.grant_role((select sem_permissao from u), 'member');
select tests.grant_module((select sem_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select com_permissao from u), 'member');
select tests.grant_module((select com_permissao from u), (select tenant from f), 'comercial');
select tests.grant_role((select rep_vip from u), 'member');
select tests.grant_role((select rep_mg from u), 'member');
select tests.grant_role((select diretor_puro from u), 'member');
select tests.grant_module((select diretor_puro from u), (select tenant from f), 'diretoria');

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
-- Mutação (rodada e confirmada, correção da lacuna 3 do plano): trocar
-- 'Berçário' por 'Bercario' (sem acento) em com_semear_carteiras faz esta
-- asserção acusar — `have: {Bercario,Demais Estados,MG,VIP} want:
-- {Berçário,Demais Estados,MG,VIP}`. Função restaurada à definição da
-- migration antes de seguir.
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
-- Mutação (rodada e confirmada — comentário corrigido pela correção da
-- auditoria, item 4: o relato anterior dizia `have: 1000 want: 1500`, e não
-- é o que a mutação produz): tirar o `union all select null::uuid, 'Sem
-- carteira'` de `carteiras_do_tenant` (o balde deixa de existir na grade)
-- faz esta asserção acusar — com a fixture C1(VIP)=1000 + C2(MG)=2000 +
-- C3(sem carteira)=500, o total independente é 3500 e a soma da função cai
-- para 3000 (nenhuma linha da grade tem carteira_id nulo para C3 casar):
-- `have: 3000 want: 3500`. Função restaurada à definição da migration antes
-- de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select sum(realizado) from public.com_metas_x_realizado(2025) where competencia = '2025-04-01'),
  (select coalesce(sum(valor_curva) filter (where classe in ('venda', 'devolucao')), 0)
     from public.com_vendas_itens where competencia = '2025-04-01'),
  'soma das carteiras + Sem carteira, em com_metas_x_realizado, fecha com o total independente do mês'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2b (item 1 da correção da auditoria, achado GRAVE) — o peso ANUAL da
-- carteira é a fatia dela do realizado do ANO (os dois lados somados
-- primeiro, divididos depois), nunca a média dos pesos MENSAIS. Mês sem
-- venda entrava nessa média como zero e afundava o peso de quem vende
-- concentrado: com esta mesma fixture (VIP só vende em abril, 1000 de 3500
-- no ano), a média dos meses dava 2,38% onde a verdade é 28,57%.
-- `com_metas_x_realizado_ano` é a irmã anual que faz a conta certa no
-- banco.
--
-- Mutação (rodada e confirmada): trocar o `peso` por "média dos pesos
-- mensais de com_metas_x_realizado, tratando mês sem venda como zero" (a
-- fórmula antiga do navegador) faz a PRIMEIRA asserção acusar — o peso de
-- VIP cai para `have: 0.0238 want: 0.2857`. Função restaurada à definição
-- da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select peso from public.com_metas_x_realizado_ano(2025) where carteira_nome = 'VIP'),
  0.2857::numeric,
  'peso anual da carteira VIP é a fatia dela do realizado do ano (1000/3500 = 28,57%), nunca a média dos pesos mensais'
);
select is(
  (select round(sum(peso), 4) from public.com_metas_x_realizado_ano(2025)),
  1::numeric,
  'os pesos anuais de todas as carteiras + Sem carteira somam 100% do realizado do ano'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Mês sem meta definida devolve meta NULA (não zero) — e a cobertura
-- também é nula (não divisão por zero). Maio/2025 não tem meta nenhuma.
--
-- Mutação (rodada e confirmada): trocar `mm.valor as meta` por `coalesce
-- (mm.valor, 0) as meta` faz a primeira asserção acusar — `have: 0 want:
-- null`. Trocar a `cobertura` por `coalesce((case ...), 0)` faz a segunda
-- acusar do mesmo jeito. Função restaurada à definição da migration antes
-- de seguir.
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
--
-- Mutação (rodada e confirmada): `drop index com_metas_unica;` faz a
-- segunda meta TOTAL do mesmo mês ser aceita em vez de recusada — a
-- asserção deixa de ver a exceção esperada (`throws_like` reporta "not
-- ok"). Índice recriado com a definição exata da migration antes de seguir.
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
--
-- Mutação (rodada e confirmada, uma por vez): (a) trocar o `where
-- carteira_id = new.carteira_id` de `notify_on_meta_definida` por `where
-- carteira_id is null` faz a primeira asserção acusar — `have: 0 want: 1`
-- (rep_vip deixa de ser avisado). (b) trocar o mesmo `where` por `where
-- true` (avisar todo mundo, sem filtrar carteira) faz a SEGUNDA acusar —
-- `have: 1 want: 0` (rep_mg passa a ser avisado da meta de VIP). Função
-- restaurada à definição da migration antes de seguir, entre uma mutação e
-- outra.
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
-- 6b (item 5.1 da correção da auditoria) — editar uma meta que JÁ EXISTE
-- também avisa: o trigger cobre `update of valor`, não só `insert`. Sem
-- esta asserção, tirar o `update of valor` do trigger deixava a suíte
-- verde (achado do auditor).
--
-- Mutação (rodada e confirmada): trocar o trigger para `after insert on
-- com_metas` (sem `or update of valor`) faz esta asserção acusar — editar a
-- meta de VIP não gera o segundo aviso: `have: 1 want: 2`. Trigger
-- restaurado à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
update public.com_metas set valor = 55000 where id = (select id from meta_vip);

select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications
    where user_id = (select rep_vip from u) and type = 'meta_definida'
      and reference_id = (select id from meta_vip)),
  2,
  'editar uma meta que já existe também avisa — o trigger cobre insert E update of valor'
);
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Meta TOTAL (carteira_id nulo) não avisa ninguém — é da empresa, não de
-- uma pessoa.
--
-- Mutação (rodada e confirmada): remover o `if new.carteira_id is null then
-- return new; end if;` de `notify_on_meta_definida` e trocar o `where
-- carteira_id = new.carteira_id` da busca de membros por `where true` faz
-- esta asserção acusar — a meta TOTAL passa a avisar quem está em qualquer
-- carteira (`have: 1 want: 0`). Função restaurada à definição da migration
-- antes de seguir.
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
--
-- Mutação (rodada e confirmada, uma por vez): (a) trocar o `or` do `where`
-- por `and` faz a primeira asserção acusar — com `p_codigos` nulo, a
-- condição vira sempre falsa e nada é atualizado (`have: 0 want: 2`). (b)
-- soltar a checagem de tabela para `(p_tabela_base is not null)`, sem
-- comparar o valor, faz a SEGUNDA acusar — H3 (outra tabela) também é
-- atingido (`have: <não nulo> want: null`). Função restaurada à definição
-- da migration antes de seguir, entre uma mutação e outra.
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
-- 8b (item 5.2 da correção da auditoria) — com_atribuir_carteira recusa
-- carteira de OUTRA empresa. A conferência já existia na função desde a
-- migration original (§4 — "misturaria dado entre empresas") mas nenhuma
-- asserção a exercitava: achado do auditor, tirar a conferência deixava a
-- suíte verde.
--
-- O id da carteira de outra empresa é capturado com `clear_authentication`
-- (volta ao papel do runner, sem RLS) — autenticado como o owner do tenant
-- principal essa linha é invisível (mesmo motivo do bloco 10), e a captura
-- devolveria NULL em vez do id de verdade.
--
-- Mutação (rodada e confirmada): tirar o `if p_carteira_id is not null and
-- not exists (...) then raise exception` de com_atribuir_carteira faz esta
-- asserção acusar — a atribuição passa (`throws_like` reporta "not ok") e
-- H4 ficaria com a carteira de outra empresa. Função restaurada à
-- definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
create temporary table carteira_outro_tenant on commit drop as
select id from public.com_carteiras where tenant_id = (select outro_tenant from f) and nome = 'VIP';
grant select on carteira_outro_tenant to authenticated;
select tests.authenticate_as('owner@com-l6d.test');

insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('H4', 'Cliente H Quatro (ataque)', 'BERCARIO', true);

select throws_like(
  $sql$ select public.com_atribuir_carteira((select id from carteira_outro_tenant), array['H4'], null) $sql$,
  '%Carteira não pertence a esta empresa%',
  'com_atribuir_carteira recusa carteira de outra empresa'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Quem não tem `metas.definir` (e não é admin) não escreve em `com_metas`
-- (42501, via RLS); quem tem, escreve — com RETURNING (regra 11 do pgTAP).
--
-- Mutação (rodada e confirmada, uma por vez): (a) tirar a checagem de
-- permissão do `with check` de `com_metas_insert` (só `tenant_id = ...`)
-- faz a primeira asserção acusar — `sem_permissao` passa a escrever sem
-- exceção nenhuma (`throws_like` reporta "not ok"). (b) trocar a ação
-- exigida por uma que `com_permissao` não tem (`'metas','aprovar'` em vez
-- de `'metas','definir'`) faz a SEGUNDA acusar — o INSERT de quem TEM
-- `metas.definir` passa a ser bloqueado com 42501 (erro, onde devia haver
-- RETURNING com 1 linha). Policy restaurada à definição da migration antes
-- de seguir, entre uma mutação e outra.
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
--
-- Mutação (rodada e confirmada, uma por vez): (a) tirar o `tenant_id =
-- get_user_tenant_id()` de `com_metas_select` faz a primeira asserção
-- acusar — o tenant principal passa a ver a meta de valor 999999 da outra
-- empresa (`have: 1 want: 0`). (b) o mesmo em `com_carteiras_select` faz a
-- SEGUNDA acusar — passa a ver as 4 carteiras seedadas da outra empresa
-- (`have: 4 want: 0`). Policies restauradas à definição da migration antes
-- de seguir, entre uma mutação e outra.
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
-- Mutação (rodada e confirmada, uma por vez): (a) arredondar a `soma` com
-- `round(..., -2)` (para a centena) faz a PRIMEIRA asserção acusar —
-- `have: 3600 want: 3623.45`. (b) trocar a `diferenca` por `round(...)`
-- (arredondando para a centena) ou por `case when abs(diferenca) < 100 then
-- 0 else diferenca end` (escondendo diferença pequena) faz a asserção do
-- valor exato acusar — o documento proíbe as duas coisas com todas as
-- letras ("não tente fechar a diferença ajustando número"). Função
-- restaurada à definição da migration antes de seguir, entre uma mutação e
-- outra.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 12 (lacuna 1 do plano) — uma pessoa só pode estar em UMA carteira.
-- `rep_mg` já está em MG desde o bloco 6; pôr a mesma pessoa em VIP também
-- é recusado pelo índice único (tenant_id, user_id) — é a mesma porta que a
-- tela de "Quem responde por cada carteira" usa para escrever.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_like(
  $sql$ insert into public.com_carteira_membros (carteira_id, user_id)
        values ((select id from carteiras where nome = 'VIP'), (select rep_mg from u)) $sql$,
  '%duplicate key%',
  'a mesma pessoa não pode estar em duas carteiras — rep_mg já está em MG'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 13/14 (lacuna 2 do plano) — quem só tem o módulo Diretoria (sem o
-- Comercial) agora VÊ dado de verdade em com_conciliacao e com_
-- metas_x_realizado, porque as duas passaram a `security definer` com porta
-- explícita (has_comercial_access OR has_diretoria_access).
--
-- Mutação (rodada e confirmada): voltar as duas funções para `security
-- invoker` faz as duas asserções acusarem — `diretor_puro` deixa de
-- enxergar `com_vendas_itens` (a policy exige `has_comercial_access`, que
-- ele não tem) e `venda_liquida`/`realizado` viram 0 em vez dos valores da
-- fixture. Funções restauradas à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('diretor-puro@com-l6d.test');

select is(
  (select venda_liquida from public.com_conciliacao(2025, 'MF', null)),
  3500.00,
  'diretor sem módulo Comercial vê a venda líquida real em com_conciliacao (security definer + porta explícita)'
);
select is(
  (select realizado from public.com_metas_x_realizado(2025) where competencia = '2025-04-01' and carteira_nome = 'VIP'),
  1000.00,
  'diretor sem módulo Comercial vê o realizado real de uma carteira em com_metas_x_realizado'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 15/16 — a asserção mais importante das duas funções: `security definer`
-- desliga a RLS, então o isolamento entre empresas TEM que estar escrito à
-- mão em cada leitura de `com_vendas_itens`. `outro_owner` é de outra
-- empresa, sem nenhuma venda própria — se a porta explícita tivesse aberto
-- o isolamento junto, ele veria os números da fixture do tenant principal.
--
-- Mutação (rodada e confirmada): tirar `i.tenant_id = get_user_tenant_id()`
-- de dentro de `realizado_por_carteira` (com_metas_x_realizado) e do `where`
-- de com_conciliacao faz as duas asserções acusarem — outro_owner passa a
-- ver os R$ 3.500 do tenant principal, vazamento de dado entre empresas.
-- Funções restauradas à definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-l6d.test');

select is(
  (select venda_liquida from public.com_conciliacao(2025, 'MF', null)),
  0::numeric,
  'outro tenant não vê a venda líquida do tenant principal em com_conciliacao — isolamento sobrevive à security definer'
);
select is(
  (select sum(realizado) from public.com_metas_x_realizado(2025) where competencia = '2025-04-01'),
  0::numeric,
  'outro tenant não vê o realizado do tenant principal em com_metas_x_realizado — isolamento sobrevive à security definer'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 17/18 — quem não tem nenhum dos dois acessos (nem Comercial, nem
-- Diretoria) leva exceção, não uma lista vazia sem explicação. `rep_vip` só
-- é membro de uma carteira; nunca recebeu módulo nem cargo de gestão.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('rep-vip@com-l6d.test');

select throws_like(
  $sql$ select * from public.com_conciliacao(2025, 'MF', null) $sql$,
  '%Sem acesso ao Comercial nem à Diretoria%',
  'quem não tem Comercial nem Diretoria leva exceção em com_conciliacao, não lista vazia'
);
select throws_like(
  $sql$ select * from public.com_metas_x_realizado(2025) $sql$,
  '%Sem acesso ao Comercial nem à Diretoria%',
  'quem não tem Comercial nem Diretoria leva exceção em com_metas_x_realizado, não lista vazia'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 19 (lacuna 4 do plano, escrita para nunca mais ser reintroduzida) —
-- `carteira_id is null` em com_metas é a meta TOTAL da empresa; em
-- com_metas_x_realizado, é o balde "Sem carteira" (cliente sem atribuição).
-- São grandezas opostas. A meta_total de 2025-08 (bloco 7, R$ 700.000,00)
-- NUNCA pode aparecer como meta da linha "Sem carteira" em agosto.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select meta from public.com_metas_x_realizado(2025) where competencia = '2025-08-01' and carteira_nome = 'Sem carteira'),
  null::numeric,
  'a meta TOTAL da empresa não vaza para a linha "Sem carteira" — os dois nulos têm sentidos opostos'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 20/21 (achado 1 do relatório anterior, corrigido na migration
-- 20261017030000) — o mesmo defeito da lacuna 2, num terceiro lugar: o
-- diretor puro já lia com_metas_x_realizado/com_conciliacao, mas
-- com_carteiras/com_carteira_membros só conheciam has_comercial_access no
-- SELECT, e a grade de Metas ficava com linhas sem nome.
--
-- Mutação (rodada e confirmada, uma por vez): voltar com_carteiras_select
-- e com_carteira_membros_select para só `has_comercial_access` (sem o OR de
-- has_diretoria_access) faz cada asserção acusar — `have: 0 want: 4` na
-- primeira, `have: 0 want: 2` na segunda. Policies restauradas à definição
-- da migration antes de seguir, entre uma mutação e outra.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('diretor-puro@com-l6d.test');

select is(
  (select count(*)::int from public.com_carteiras where tenant_id = (select tenant from f)),
  4,
  'diretor sem módulo Comercial enxerga as quatro carteiras do tenant (com_carteiras_select com has_diretoria_access)'
);
select is(
  (select count(*)::int from public.com_carteira_membros where tenant_id = (select tenant from f)),
  2,
  'diretor sem módulo Comercial enxerga os membros das carteiras (com_carteira_membros_select com has_diretoria_access)'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 22/23 — a asserção que importa: abrir a porta da Diretoria não pode abrir
-- o isolamento entre empresas junto. `outro_owner` continua sem enxergar
-- nada do tenant principal nas duas tabelas.
--
-- Mutação (rodada e confirmada, uma por vez): tirar `tenant_id =
-- get_user_tenant_id()` do `using` de com_carteiras_select faz a primeira
-- asserção acusar — outro_owner passa a ver as 4 carteiras do tenant
-- principal (`have: 4 want: 0`). O mesmo em com_carteira_membros_select faz
-- a SEGUNDA acusar — vê os 2 membros (`have: 2 want: 0`). Policies
-- restauradas à definição da migration antes de seguir, entre uma mutação
-- e outra.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-l6d.test');

select is(
  (select count(*)::int from public.com_carteiras where tenant_id = (select tenant from f)),
  0,
  'outro tenant não enxerga as carteiras do tenant principal, mesmo com a porta da Diretoria aberta'
);
select is(
  (select count(*)::int from public.com_carteira_membros where tenant_id = (select tenant from f)),
  0,
  'outro tenant não enxerga os membros do tenant principal, mesmo com a porta da Diretoria aberta'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 24 (achado 2 do relatório anterior, corrigido na migration
-- 20261017030000) — `com_pessoas_do_comercial` devolve a lista completa
-- (owner, sem_permissao e com_permissao — os três com módulo Comercial ou
-- cargo de admin/owner no tenant f; diretor_puro, rep_vip e rep_mg ficam de
-- fora) mesmo para quem não é admin, porque a função lê `user_module_
-- access` como security definer, e não pela RLS que só deixa admin/owner
-- verem a linha de outra pessoa.
--
-- Mutação (rodada e confirmada): apertar a porta para só `is_admin_or_
-- higher` (tirando o `or tem_permissao(...,'carteiras','gerir')`) faz esta
-- asserção acusar — `com_permissao` (que não é admin) passa a levar
-- exceção em vez da lista. Porta restaurada à definição da migration antes
-- de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('com-permissao@com-l6d.test');

select is(
  (select count(*)::int from public.com_pessoas_do_comercial()),
  3,
  'gestor com carteiras.gerir (sem ser admin) recebe a lista completa de quem tem o módulo Comercial, mais owner/admin'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 25 — a mesma asserção que importa, agora em com_pessoas_do_comercial: a
-- porta explícita não pode ter aberto o isolamento entre empresas junto.
--
-- Mutação (rodada e confirmada — comentário corrigido pela correção da
-- auditoria, item 4: o relato anterior estava errado): tirar SÓ o
-- `tenant_id = get_user_tenant_id()` de dentro da CTE `elegiveis` (o lado
-- de `user_module_access`) NÃO faz esta asserção acusar — `have: 0 want:
-- 0`, porque o `join public.profiles pr on ... and pr.tenant_id =
-- get_user_tenant_id()` do SELECT final ainda filtra por tenant e barra o
-- vazamento por essa via. A asserção não é decorativa: tirar TODOS os
-- filtros de tenant da função (as duas metades de `elegiveis` e o join
-- final com `profiles`) faz o owner do tenant principal aparecer na lista
-- de `outro_owner` — `have: 1 want: 0`. Função restaurada à definição da
-- migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-l6d.test');

select is(
  (select count(*)::int from public.com_pessoas_do_comercial() where user_id = (select owner from u)),
  0,
  'outro tenant não vê o owner do tenant principal em com_pessoas_do_comercial — isolamento sobrevive à security definer'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 26 — quem não tem admin/owner, carteiras.gerir nem Diretoria leva
-- exceção, não uma lista vazia sem explicação. `rep_vip` só é membro de
-- uma carteira; nunca recebeu módulo nem cargo de gestão.
--
-- Mutação (rodada e confirmada): trocar a porta por `if false then` (nunca
-- bloqueia) faz esta asserção acusar — rep_vip passa a receber uma lista
-- (vazia, mas SEM exceção) em vez de levar a exceção esperada
-- (`throws_like` reporta "not ok"). Porta restaurada à definição da
-- migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('rep-vip@com-l6d.test');

select throws_like(
  $sql$ select * from public.com_pessoas_do_comercial() $sql$,
  '%Sem acesso para ver as pessoas do Comercial%',
  'quem não tem admin, carteiras.gerir nem Diretoria leva exceção em com_pessoas_do_comercial'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-l6d.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 27 (item 6 da correção da auditoria) — `updated_at` de com_metas anda
-- quando a meta é editada. `now()` é constante dentro da transação (regra 9
-- do pgTAP): comparar dois carimbos tirados na MESMA transação nunca mostra
-- diferença por si só. Por isso o carimbo nasce EXPLÍCITO no passado
-- (2020-01-01, nunca pelo default) e a prova é que o UPDATE o tira de lá —
-- não que ele "avançou".
--
-- Mutação (rodada e confirmada): tirar o trigger `handle_com_metas_
-- updated_at` faz a PRIMEIRA asserção acusar — o carimbo continua em
-- 2020-01-01 depois do UPDATE. Trigger restaurado à definição da migration
-- antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table meta_carimbo on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira_id, valor, created_at, updated_at)
  values (2025, 12, null, 10000, '2020-01-01'::timestamptz, '2020-01-01'::timestamptz)
  returning id
) select id from ins;
grant select on meta_carimbo to authenticated;

update public.com_metas set valor = 20000 where id = (select id from meta_carimbo);

select isnt(
  (select updated_at from public.com_metas where id = (select id from meta_carimbo)),
  '2020-01-01'::timestamptz,
  'editar a meta atualiza updated_at — handle_com_metas_updated_at dispara no UPDATE'
);
select is(
  (select created_at from public.com_metas where id = (select id from meta_carimbo)),
  '2020-01-01'::timestamptz,
  'o trigger só toca updated_at — created_at fica como foi gravado'
);

select * from finish();
rollback;
