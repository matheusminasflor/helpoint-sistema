-- RAIO-X DO CLIENTE (migration 20270212380000; dono, 2026-11-05). Ana é a vendedora que sai, Bia assume a carteira,
-- Caio é de outra carteira e Gil é o gestor.
--   1  o lançamento grava a dor e a proposta
--   2  repetir a gravação não duplica a dor
--   3  "não atendeu" conta como tentativa e não vira dor
--   4  Bia, da mesma carteira, vê os contatos da Ana pela função
--   5  ... mas a tabela de lançamentos continua só com os dela (indicadores intactos)
--   6  Bia vê a dor registrada pela Ana no Raio-X
--   7  Bia avança o status da dor
--   8  Bia não corrige o texto da dor
--   9  Gil corrige o texto da dor
--  10  Caio, de outra carteira, não vê a dor
--  11  ... não abre o Raio-X
--  12  ... e não registra dor no cliente
--  13  perfil novo não apaga a versão anterior
--  14  Caio não fica com o relatório da carteira alheia
--  15  dor com motivo Outros exige texto
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-raio-x', 'Raio X', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@raiox.test', (select a from f)) as ana,
       tests.create_user('bia@raiox.test', (select a from f)) as bia,
       tests.create_user('caio@raiox.test', (select a from f)) as caio,
       tests.create_user('gil@raiox.test', (select a from f)) as gil;
select tests.grant_module(x, (select a from f), 'comercial') from (select ana x from u union all select bia from u union all select caio from u union all select gil from u) q;
select tests.grant_profile(x, (select a from f), 'comercial', 'Operador') from (select ana x from u union all select bia from u union all select caio from u) q;
select tests.grant_profile((select gil from u), (select a from f), 'comercial', 'Gestor');
update public.access_profiles
   set permissions = (permissions - 'dashboard') || '{"lancamentos": {"view": true, "equipe": false},
     "carteiras": {"view": true, "equipe": false}, "reports": {"view": true, "view_team_metrics": false},
     "clientes": {"view": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Operador';
update public.access_profiles
   set permissions = permissions || '{"lancamentos": {"view": true, "corrigir": true}}'::jsonb
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem)
values ((select a from f), '100', 'CLIENTE A', 'MG', 'cadastro'), ((select a from f), '200', 'CLIENTE B', 'SP', 'cadastro');
insert into public.com_carteira_membros (tenant_id, user_id, carteira, responsavel)
values ((select a from f), (select ana from u), 'MG', true), ((select a from f), (select bia from u), 'MG', false),
       ((select a from f), (select caio from u), 'SP', true);
create temporary table l (id uuid, nome text) on commit drop;
grant select on f, u to authenticated;
grant select, insert on l to authenticated;

select tests.authenticate_as('ana@raiox.test');
with n as (insert into public.com_interacoes (cliente_codigo, data, status)
           values ('100', (now() at time zone 'America/Sao_Paulo')::date, 'em_andamento'),
                  ('100', (now() at time zone 'America/Sao_Paulo')::date, 'em_andamento') returning id)
insert into l select id, case when row_number() over () = 1 then 'falou' else 'mudo' end from n;

select public.com_registrar_contato_no_raio_x((select id from l where nome = 'falou'), 'falou', 'preco', null, 'Concorrente mais barato', 'campanha', 'Campanha do mês');
select is((select count(*)::int from public.com_cliente_propostas), 1, 'o lancamento grava a dor e a proposta');
select public.com_registrar_contato_no_raio_x((select id from l where nome = 'falou'), 'falou', 'preco', null, 'Concorrente mais barato', 'campanha', 'Campanha do mês');
select is((select count(*)::int from public.com_cliente_dores), 1, 'repetir a gravacao nao duplica');
select public.com_registrar_contato_no_raio_x((select id from l where nome = 'mudo'), 'nao_atendeu');
select is((select count(*)::int from public.com_cliente_dores), 1, 'nao atendeu nao vira dor');
select tests.clear_authentication();

select tests.authenticate_as('bia@raiox.test');
select is((select count(*)::int from public.com_contatos_do_cliente('100')), 2, 'Bia ve os contatos da Ana pela funcao');
select is((select count(*)::int from public.com_interacoes), 0, 'a tabela de lancamentos continua fechada');
select is(jsonb_array_length(public.com_raio_x_do_cliente('100') -> 'dores'), 1, 'Bia ve a dor da Ana');
update public.com_cliente_dores set status = 'em_tratamento';
select is((select status from public.com_cliente_dores), 'em_tratamento', 'Bia avanca o status');
select throws_ok($$update public.com_cliente_dores set descricao = 'outra coisa'$$, '42501', null, 'Bia nao corrige o texto');
select tests.clear_authentication();

select tests.authenticate_as('gil@raiox.test');
update public.com_cliente_dores set descricao = 'Corrigido';
select is((select descricao from public.com_cliente_dores), 'Corrigido', 'o gestor corrige');
select tests.clear_authentication();

select tests.authenticate_as('caio@raiox.test');
select is((select count(*)::int from public.com_cliente_dores), 0, 'outra carteira nao ve a dor');
select throws_ok($$select public.com_raio_x_do_cliente('100')$$, '42501', null, 'outra carteira nao abre o Raio-X');
select throws_ok($$insert into public.com_cliente_dores (cliente_codigo, motivo) values ('100', 'preco') returning id$$, '42501', null, 'outra carteira nao registra');
select tests.clear_authentication();

select tests.authenticate_as('bia@raiox.test');
insert into public.com_cliente_perfis (cliente_codigo, situacao) values ('100', 'crescendo') returning id;
insert into public.com_cliente_perfis (cliente_codigo, situacao) values ('100', 'em_dificuldade') returning id;
select is(jsonb_array_length(public.com_raio_x_do_cliente('100') -> 'perfis'), 2, 'o perfil anterior continua guardado');
select tests.clear_authentication();

select tests.authenticate_as('caio@raiox.test');
select is((select count(*)::int from public.com_raio_x_relatorio()), 0, 'o relatorio so traz o que a pessoa pode ver');
select tests.clear_authentication();

select tests.authenticate_as('bia@raiox.test');
select throws_ok($$insert into public.com_cliente_dores (cliente_codigo, motivo) values ('100', 'outros') returning id$$, '23514', null, 'Outros exige texto');

select * from finish();
rollback;
