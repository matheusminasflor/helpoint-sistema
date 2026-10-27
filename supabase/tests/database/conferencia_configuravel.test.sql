-- CONFERÊNCIA DE EQUIPAMENTOS CONFIGURÁVEL (migration 20270129130000; dono, 2026-10-21: o #175 saiu no nome do
-- primeiro dono, sem tela para mudar).
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-conf-config', 'ConfConfig', false) as a;
create temporary table u on commit drop as
select tests.create_user('dono@confcfg.test', (select a from f)) as dono,
       tests.create_user('ti@confcfg.test',   (select a from f)) as ti,
       tests.create_user('ze@confcfg.test',   (select a from f)) as ze;
select tests.grant_role((select dono from u), 'owner');
insert into public.assets (tenant_id, name, asset_tag, category, status, assigned_to)
select a, 'Notebook', 'NB-9', 'hardware', 'in_use', (select ze from u) from f;
grant select on f, u to authenticated;

-- ═══ 1. Quem não edita os cadastros da TI não configura ═══
select tests.authenticate_as('ze@confcfg.test');
select throws_ok($$ insert into public.ti_conferencia_config (tenant_id, ativo) values ((select a from f), false) $$,
  '42501', null, 'sem a caixinha dos cadastros da TI nao configura a conferencia');
select tests.clear_authentication();

-- ═══ 1b. Quem tem "Inventário e cadastros" (config_cadastros) na matriz configura (20270129150000: o banco
-- perguntava por uma seção que não existe e só o administrador passava) ═══
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'Cadastros', '{"config_cadastros": {"view": true, "edit": true}}'::jsonb from f;
select tests.grant_module((select ti from u), (select a from f), 'ti');
select tests.grant_profile((select ti from u), (select a from f), 'ti', 'Cadastros');
select tests.authenticate_as('ti@confcfg.test');
select ok(public.pode_configurar_conferencia(), 'quem tem a caixinha dos cadastros da TI configura a conferencia');
select tests.clear_authentication();

-- O dia que a rotina enxerga como "hoje" (20270212020000): o 1º e o 15 do mês corrente.
create or replace function pg_temp.dia(n int) returns date language sql as
  $$ select (date_trunc('month', now() at time zone 'America/Sao_Paulo') + make_interval(days => n - 1))::date $$;
create or replace function pg_temp.conferencias() returns int language sql as
  $$ select count(*)::int from public.ti_checagens where tenant_id = (select a from f) and tipo = 'conferencia' $$;

-- ═══ 2. Desligada: a rotina não abre ═══
insert into public.ti_conferencia_config (tenant_id, ativo, dia_do_mes) select a, false, 1 from f;
select public.ti_abrir_conferencia_do_mes(pg_temp.dia(1));
select is(pg_temp.conferencias(), 0, 'desligada, a conferencia do mes nao abre');

-- ═══ 3. Ligada para o dia 1: no dia 15 NÃO abre (dono, 2026-10-27: abria em qualquer dia depois do escolhido) ═══
update public.ti_conferencia_config set ativo = true, solicitante_id = (select ti from u) where tenant_id = (select a from f);
select public.ti_abrir_conferencia_do_mes(pg_temp.dia(15));
select is(pg_temp.conferencias(), 0, 'configurada para o dia 1, no dia 15 a conferencia nao abre');

-- ═══ 4-5. No dia 1 abre, no nome do solicitante escolhido, não no do dono ═══
select public.ti_abrir_conferencia_do_mes(pg_temp.dia(1));
select is(pg_temp.conferencias(), 1, 'no dia escolhido, abre uma conferencia no mes');
select is((select t.requester_id from public.tickets t join public.ti_checagens k on k.ticket_id = t.id
            where k.tenant_id = (select a from f)), (select ti from u),
  'o chamado sai no nome do solicitante configurado');

-- ═══ 6. Apagado o chamado, no dia seguinte ela não volta (era o #223: apagada na sexta, reaberta na terça) ═══
delete from public.tickets where id = (select ticket_id from public.ti_checagens where tenant_id = (select a from f));
select public.ti_abrir_conferencia_do_mes(pg_temp.dia(2));
select is(pg_temp.conferencias(), 0, 'apagada, a conferencia do mes nao volta no dia seguinte');

select * from finish();
rollback;
