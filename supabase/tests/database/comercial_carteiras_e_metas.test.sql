-- Carteiras e metas do Comercial. Nasceu na L6d (cálculo por soma de venda);
-- a Frente 2 (docs/metas-e-carteiras-fonte-da-verdade.md,
-- .scratch/plano-frente2-metas-e-carteiras.md) desfez esse cálculo e trocou
-- `com_carteiras`/`carteira_id` (uuid) por carteira em TEXTO livre. O que
-- media venda por carteira (`com_metas_x_realizado(_ano)`, `com_carteiras`,
-- `com_atribuir_carteira`, `com_clientes.carteira_id`) saiu deste arquivo —
-- tem suíte própria em metas_do_diretor.test.sql. O que fica é o que nunca
-- dependeu de somar venda: o aviso pelo sino (com_metas + com_carteira_
-- membros), a RLS de com_metas, com_conciliacao e com_pessoas_do_comercial.
--
-- `com_conciliacao` MUDOU na Frente 5b (2026-09-23): perdeu `p_filial` e
-- `p_apresentacao`, passou a ler `metas_ano.total_realizado` e a comparar
-- só os meses informados. As chamadas daqui acompanharam a assinatura
-- nova; a regra nova tem suíte própria em
-- comercial_conciliacao_sem_apresentacao.test.sql.
begin;
\ir _helpers.psql

select plan(21);

-- ═══════════════════════════════════════════════════════════════════════════
-- Fixtures — dois tenants (isolamento), um owner em cada, mais dois membros
-- comerciais sem permissão granular nenhuma (`sem_permissao`) e com
-- `metas.definir` (`com_permissao`) — regra 12 do pgTAP: RLS de escrita não
-- se prova só com owner. `rep_vip`/`rep_mg` são pessoas do comercial, cada
-- uma numa carteira, para o teste do sino. `diretor_puro` só tem o módulo
-- Diretoria — nem módulo Comercial, nem cargo owner/admin/manager.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table f on commit drop as
select tests.create_tenant('com-carteiras', 'Comercial Carteiras', false) as tenant,
       tests.create_tenant('com-carteiras-outro', 'Comercial Carteiras Outro Tenant', false) as outro_tenant;

create temporary table u on commit drop as
select tests.create_user('owner@com-carteiras.test',        (select tenant from f)) as owner,
       tests.create_user('sem-permissao@com-carteiras.test', (select tenant from f)) as sem_permissao,
       tests.create_user('com-permissao@com-carteiras.test', (select tenant from f)) as com_permissao,
       tests.create_user('rep-vip@com-carteiras.test',       (select tenant from f)) as rep_vip,
       tests.create_user('rep-mg@com-carteiras.test',        (select tenant from f)) as rep_mg,
       tests.create_user('diretor-puro@com-carteiras.test',  (select tenant from f)) as diretor_puro,
       tests.create_user('outro-owner@com-carteiras.test',   (select outro_tenant from f)) as outro_owner;

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

-- Perfil que concede metas.definir e carteiras.gerir — só para
-- `com_permissao`. carteiras.gerir continua existindo como chave técnica
-- (item 4 do plano: só o rótulo muda) — é ela que abre com_pessoas_do_
-- comercial e a seção "Quem responde por cada carteira".
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  values ((select tenant from f), 'comercial', 'Metas Teste',
          '{"metas": {"definir": true}, "carteiras": {"gerir": true}}'::jsonb)
  returning id
)
select id as perfil from ins;

insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select (select tenant from f), (select com_permissao from u), 'comercial', (select perfil from perfil);

grant select on f, u, perfil to authenticated;

select tests.authenticate_as('owner@com-carteiras.test');

-- Fixture de venda para com_conciliacao. A assinatura mudou na Frente 5b
-- (.scratch/plano-frente5-ficha-e-conciliacao.md, seção 5b): o valor
-- informado deixou de ser digitado (`p_apresentacao`) e passou a vir de
-- `metas_ano.total_realizado` — por isso a fixture ganha uma meta_ano de
-- abril/2025, o mesmo mês da venda. C1/C2/C3 não têm mais carteira (a
-- coluna saiu): a fixture só precisa gerar venda líquida + bonificação
-- num mês conhecido.
insert into public.com_clientes (codigo, razao_social, tabela_preco, ativo) values
  ('C1', 'Cliente Um', 'ATACADISTA', true),
  ('C2', 'Cliente Dois', 'ATACADISTA', true),
  ('C3', 'Cliente Três', 'ATACADISTA', true);

select public.com_importar_vendas('MF', 'fixture-carteiras.xlsx', 4, '{}'::jsonb,
  $items$[
    {"emissao":"2025-04-10","documento":"9301","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCART","produto_nome":"Produto Carteiras","quantidade":1,"valor_nota":1000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9302","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C2","cliente_nome":"Cliente Dois","produto_codigo":"PCART","produto_nome":"Produto Carteiras","quantidade":1,"valor_nota":2000,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-10","documento":"9303","serie":"1","tipo_documento":"NFe","cfop":"5101","classe":"venda","cliente_codigo":"C3","cliente_nome":"Cliente Três","produto_codigo":"PCART","produto_nome":"Produto Carteiras","quantidade":1,"valor_nota":500,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"},
    {"emissao":"2025-04-15","documento":"9304","serie":"1","tipo_documento":"NFe","cfop":"5910","classe":"bonificacao","cliente_codigo":"C1","cliente_nome":"Cliente Um","produto_codigo":"PCART","produto_nome":"Produto Carteiras","quantidade":1,"valor_nota":123.45,"desconto":0,"vendedor_codigo":"V1","vendedor_nome":"Vend Um"}
  ]$items$::jsonb, false);

insert into public.metas_ano (ano, mes, total_realizado) values (2025, 4, 4000.00);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Duas metas TOTAIS (carteira nula) no mesmo mês são recusadas — o
-- índice único com `coalesce` que resolve NULL não ser igual a NULL. Migrou
-- de uuid para texto na Frente 2; o índice tem que continuar pegando.
--
-- Mutação (rodada e confirmada): `drop index com_metas_unica;` faz a
-- segunda meta TOTAL do mesmo mês ser aceita em vez de recusada —
-- `throws_like` reporta "not ok". Índice recriado com a definição exata da
-- migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_metas (ano, mes, carteira, valor) values (2025, 6, null, 500000);
select throws_like(
  $sql$ insert into public.com_metas (ano, mes, carteira, valor) values (2025, 6, null, 600000) $sql$,
  '%duplicate key%',
  'uma segunda meta TOTAL no mesmo ano/mês é recusada pelo índice único (agora sobre carteira em texto)'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Definir meta de uma carteira avisa as pessoas dela, e só elas — pelo
-- caminho do usuário (regra 8 do pgTAP). rep_vip está em VIP; rep_mg está
-- em MG. Migrou de `com_carteira_membros.carteira_id` (uuid) para
-- `.carteira` (texto) — mesma corrente, mesmo trigger.
--
-- Mutação (rodada e confirmada, uma por vez): (a) trocar o `where carteira
-- = new.carteira` de `notify_on_meta_definida` por `where carteira is null`
-- faz a primeira asserção acusar — `have: 0 want: 1` (rep_vip deixa de ser
-- avisado). (b) trocar o mesmo `where` por `where true` (avisar todo
-- mundo) faz a SEGUNDA acusar — `have: 1 want: 0` (rep_mg passa a ser
-- avisado da meta de VIP). Função restaurada à definição da migration antes
-- de seguir, entre uma mutação e outra.
-- ═══════════════════════════════════════════════════════════════════════════
insert into public.com_carteira_membros (carteira, user_id) values
  ('VIP', (select rep_vip from u)),
  ('MG', (select rep_mg from u));

create temporary table meta_vip on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira, valor)
  values (2025, 7, 'VIP', 50000)
  returning id
)
select id from ins;
grant select on meta_vip to authenticated;

-- A policy de SELECT de `notifications` é "cada um vê só a sua" —
-- `clear_authentication` volta ao papel do runner, o único jeito de
-- conferir a caixa de rep_vip/rep_mg de fora delas mesmas.
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
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 2b — editar uma meta que JÁ EXISTE também avisa: o trigger cobre `update
-- of valor`, não só `insert`.
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
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Meta TOTAL (carteira nula) não avisa ninguém — é da empresa, não de
-- uma pessoa.
--
-- Mutação (rodada e confirmada): remover o `if new.carteira is null then
-- return new; end if;` de `notify_on_meta_definida` faz esta asserção
-- acusar — a meta TOTAL passa a tentar avisar (a busca por `carteira =
-- null` não bate ninguém de propósito, mas o efeito observável certo é
-- "não dispara nem tenta"; a mutação testada foi trocar a busca de membros
-- por `where true`, que faz TODO MUNDO ser avisado da meta total —
-- `have: >0 want: 0`). Função restaurada à definição da migration antes de
-- seguir.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table meta_total on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira, valor)
  values (2025, 8, null, 700000)
  returning id
)
select id from ins;
grant select on meta_total to authenticated;

select tests.clear_authentication();
select is(
  (select count(*)::int from public.notifications where type = 'meta_definida' and reference_id = (select id from meta_total)),
  0,
  'meta TOTAL da empresa não gera nenhum aviso'
);
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Quem não tem `metas.definir` (e não é admin) não escreve em `com_metas`
-- (42501, via RLS); quem tem, escreve — com RETURNING (regra 11 do pgTAP).
-- Policy intocada por esta leva (não referenciava carteira_id).
--
-- Mutação (rodada e confirmada, uma por vez): (a) tirar a checagem de
-- permissão do `with check` de `com_metas_insert` faz a primeira asserção
-- acusar — `sem_permissao` passa a escrever sem exceção nenhuma. (b) trocar
-- a ação exigida por uma que `com_permissao` não tem faz a SEGUNDA acusar —
-- o INSERT passa a ser bloqueado com 42501. Policy restaurada à definição
-- da migration antes de seguir, entre uma mutação e outra.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('sem-permissao@com-carteiras.test');
select throws_like(
  $sql$ insert into public.com_metas (ano, mes, carteira, valor) values (2025, 9, null, 1000) $sql$,
  '%row-level security%',
  'quem não tem metas.definir (e não é admin) não escreve em com_metas'
);
select tests.clear_authentication();

select tests.authenticate_as('com-permissao@com-carteiras.test');
create temporary table ins_meta on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira, valor)
  values (2025, 9, 'MG', 30000)
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
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Isolamento entre empresas em com_metas — sem depender mais de
-- com_carteiras (que saiu). `outro_owner` grava uma meta com carteira
-- 'VIP' também — o MESMO literal de texto do tenant principal — e ainda
-- assim o tenant principal não a enxerga: prova de que `tenant_id` na
-- policy é quem isola, não a antiga unicidade do uuid.
--
-- Mutação (rodada e confirmada): tirar o `tenant_id = get_user_tenant_id()`
-- de `com_metas_select` faz esta asserção acusar — o tenant principal
-- passa a ver a meta de valor 999999 da outra empresa. Policy restaurada à
-- definição da migration antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-carteiras.test');
insert into public.com_metas (ano, mes, carteira, valor) values (2025, 10, 'VIP', 999999);
select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

select is(
  (select count(*)::int from public.com_metas where valor = 999999),
  0,
  'o tenant principal não enxerga a meta gravada pela outra empresa, mesmo com a mesma carteira "VIP" em texto'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. `com_conciliacao` devolve a diferença como ela é — nunca arredonda,
-- nunca esconde, nunca some. Assinatura mudou na Frente 5b: leia
-- `total_realizado` de `metas_ano` (fixture acima), sem filial nem valor
-- digitado.
--
-- Mutação (rodada e confirmada, uma por vez): (a) arredondar a soma das
-- vendas com `round(..., -2)` faz a PRIMEIRA asserção acusar. (b) trocar a
-- diferença por `round(...)` ou por "esconder diferença pequena" faz a
-- SEGUNDA acusar. Função restaurada à definição da migration antes de
-- seguir, entre uma mutação e outra.
--
-- ATUALIZADO EM 2026-09-25 (migration 20261026020000): a função passou a
-- separar as quatro caixas, e A BONIFICAÇÃO SAIU DA CONTA. A fixture acima é
-- toda série 1, então os R$ 123,45 de bonificação são PUBLICIDADE — e
-- publicidade não é faturamento. A soma que a primeira asserção conferia
-- (venda + bonificação) não existe mais; o que se confere agora é que
-- `venda_total` é exatamente a venda, sem a publicidade grudada nela.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select row(venda_total, publicidade, bonificacao) from public.com_conciliacao(2025)),
  row(3500.00::numeric, 123.45::numeric, 0::numeric),
  'com_conciliacao separa a venda da publicidade (bonif. série 1), exatamente — sem arredondar nem somar as duas'
);
select is(
  (select diferenca_total from public.com_conciliacao(2025)),
  4000.00 - 3500.00,
  'a diferença aparece exata (informado − venda), nunca ajustada para fechar bonito'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Uma pessoa só pode estar em UMA carteira. `rep_mg` já está em MG desde
-- o bloco 2; pôr a mesma pessoa em VIP também é recusado pelo índice único
-- (tenant_id, user_id) — inalterado pela conversão para texto.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_like(
  $sql$ insert into public.com_carteira_membros (carteira, user_id)
        values ('VIP', (select rep_mg from u)) $sql$,
  '%duplicate key%',
  'a mesma pessoa não pode estar em duas carteiras — rep_mg já está em MG'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. Diretor sem módulo Comercial vê com_conciliacao de verdade (security
-- definer + porta explícita) — assinatura nova (Frente 5b), teste intocado.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('diretor-puro@com-carteiras.test');

select is(
  (select venda_total from public.com_conciliacao(2025)),
  3500.00,
  'diretor sem módulo Comercial vê a venda real em com_conciliacao (security definer + porta explícita)'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. A porta explícita de com_conciliacao não abre o isolamento entre
-- empresas junto.
--
-- A auditoria de 2026-09-23 mostrou que esta asserção tinha virado
-- DECORATIVA depois da Frente 5b: a função passou a só somar os meses que
-- o tenant tem informados em `metas_ano`, e o outro tenant não tinha
-- nenhum — o zero vinha da ausência de meta, não do filtro de empresa.
-- Apagar `i.tenant_id = get_user_tenant_id()` da função deixava a suíte
-- inteira verde. Por isso o outro tenant agora informa 2025/04, o MESMO
-- mês em que o principal tem R$ 3.500,00 de venda: sem o filtro, o zero
-- abaixo vira 3500,00.
--
-- Mutação (rodada e confirmada em 2026-09-23, contra o test-helpoint):
-- sem o filtro de tenant em `com_vendas_itens`, a venda medida de
-- fora foi de 0 para 1.000,00 na fixture equivalente da suíte
-- comercial_conciliacao_sem_apresentacao — mesma causa, mesmo efeito aqui.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-carteiras.test');

insert into public.metas_ano (ano, mes, total_realizado) values (2025, 4, 55.00);

select is(
  (select venda_total from public.com_conciliacao(2025)),
  0::numeric,
  'outro tenant não vê a venda do tenant principal em com_conciliacao — isolamento sobrevive à security definer'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. Quem não tem nenhum dos dois acessos (nem Comercial, nem Diretoria)
-- leva exceção em com_conciliacao, não uma lista vazia sem explicação.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('rep-vip@com-carteiras.test');

select throws_like(
  $sql$ select * from public.com_conciliacao(2025) $sql$,
  '%Sem acesso ao Comercial nem à Diretoria%',
  'quem não tem Comercial nem Diretoria leva exceção em com_conciliacao, não lista vazia'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 11/12 — `com_carteira_membros` também enxerga pela porta da Diretoria
-- (RLS intocada por esta leva) e o isolamento entre empresas sobrevive.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('diretor-puro@com-carteiras.test');

select is(
  (select count(*)::int from public.com_carteira_membros where tenant_id = (select tenant from f)),
  2,
  'diretor sem módulo Comercial enxerga os membros das carteiras (com_carteira_membros_select com has_diretoria_access)'
);

select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-carteiras.test');

select is(
  (select count(*)::int from public.com_carteira_membros where tenant_id = (select tenant from f)),
  0,
  'outro tenant não enxerga os membros do tenant principal, mesmo com a porta da Diretoria aberta'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 13. `com_pessoas_do_comercial` — intocada por esta leva; devolve a lista
-- completa (owner, sem_permissao e com_permissao) mesmo para quem não é
-- admin.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('com-permissao@com-carteiras.test');

select is(
  (select count(*)::int from public.com_pessoas_do_comercial()),
  3,
  'gestor com carteiras.gerir (sem ser admin) recebe a lista completa de quem tem o módulo Comercial, mais owner/admin'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. A mesma asserção que importa em com_pessoas_do_comercial: a porta
-- explícita não abre o isolamento entre empresas junto.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('outro-owner@com-carteiras.test');

select is(
  (select count(*)::int from public.com_pessoas_do_comercial() where user_id = (select owner from u)),
  0,
  'outro tenant não vê o owner do tenant principal em com_pessoas_do_comercial — isolamento sobrevive à security definer'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 15. Quem não tem admin/owner, metas.definir nem Diretoria leva exceção em
-- com_pessoas_do_comercial, não uma lista vazia sem explicação.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.clear_authentication();
select tests.authenticate_as('rep-vip@com-carteiras.test');

select throws_like(
  $sql$ select * from public.com_pessoas_do_comercial() $sql$,
  '%Sem acesso para ver as pessoas do Comercial%',
  'quem não tem admin, carteiras.gerir nem Diretoria leva exceção em com_pessoas_do_comercial'
);

select tests.clear_authentication();
select tests.authenticate_as('owner@com-carteiras.test');

-- ═══════════════════════════════════════════════════════════════════════════
-- 16/17 — `updated_at` de com_metas anda quando a meta é editada. `now()` é
-- constante dentro da transação (regra 9 do pgTAP): o carimbo nasce
-- EXPLÍCITO no passado (2020-01-01), e a prova é que o UPDATE o tira de lá.
--
-- Mutação (rodada e confirmada): tirar o trigger `handle_com_metas_
-- updated_at` faz a PRIMEIRA asserção acusar — o carimbo continua em
-- 2020-01-01 depois do UPDATE. Trigger restaurado à definição da migration
-- antes de seguir.
-- ═══════════════════════════════════════════════════════════════════════════
create temporary table meta_carimbo on commit drop as
with ins as (
  insert into public.com_metas (ano, mes, carteira, valor, created_at, updated_at)
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
