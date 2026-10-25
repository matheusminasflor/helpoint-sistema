-- TROCA DE EQUIPAMENTO NUMA GRAVAÇÃO SÓ (migration 20270129170000; proposta "Helpoint no dia a dia", defeito 6).
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-troca', 'Troca', false) as a;
create temporary table u on commit drop as
select tests.create_user('tec@troca.test', (select a from f)) as tec,
       tests.create_user('ana@troca.test', (select a from f)) as ana,
       tests.create_user('zeca@troca.test', (select a from f)) as zeca;
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'Inventario', '{"inventory": {"view": true, "edit": true}}'::jsonb from f;
select tests.grant_module((select tec from u), (select a from f), 'ti');
select tests.grant_profile((select tec from u), (select a from f), 'ti', 'Inventario');

create temporary table eq on commit drop as
with antigo as (insert into public.assets (tenant_id, name, asset_tag, category, status, assigned_to)
                select a, 'Notebook velho', 'NB-1', 'hardware', 'in_use', (select ana from u) from f returning id),
     novo as (insert into public.assets (tenant_id, name, asset_tag, category, status)
              select a, 'Notebook novo', 'NB-2', 'hardware', 'in_stock' from f returning id),
     quebrado as (insert into public.assets (tenant_id, name, asset_tag, category, status)
                  select a, 'Notebook quebrado', 'NB-3', 'hardware', 'maintenance' from f returning id),
     ch as (insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
            select a, 'tickets', 'Notebook não liga', 'troca', (select ana from u), (select ana from u), 'medium', 'open' from f
            returning id)
select (select id from antigo) as antigo, (select id from novo) as novo, (select id from quebrado) as quebrado, (select id from ch) as chamado;
update public.tickets set asset_id = (select antigo from eq) where id = (select chamado from eq);
grant select on f, u, eq to authenticated;

-- ═══ Quem não edita o Inventário não troca ═══
select tests.authenticate_as('zeca@troca.test');
select throws_ok($$ select public.trocar_equipamento_do_chamado((select chamado from eq), (select antigo from eq), (select novo from eq), 'quebrou') $$,
  '42501', null, 'sem "Inventário · editar" não troca');
select tests.clear_authentication();

-- ═══ Equipamento em manutenção não entra: nada muda ═══
select tests.authenticate_as('tec@troca.test');
select throws_ok($$ select public.trocar_equipamento_do_chamado((select chamado from eq), (select antigo from eq), (select quebrado from eq), 'quebrou') $$,
  'P0002', null, 'equipamento em manutenção não serve de troca');
select tests.clear_authentication();
select is((select assigned_to from public.assets where id = (select antigo from eq)), (select ana from u),
  'a troca recusada não mexe no equipamento antigo (tudo ou nada)');

-- ═══ A troca ═══
select tests.authenticate_as('tec@troca.test');
select lives_ok($$ select public.trocar_equipamento_do_chamado((select chamado from eq), (select antigo from eq), (select novo from eq), 'tela quebrada') $$,
  'quem edita o Inventário troca');
select tests.clear_authentication();
select is((select status::text || '|' || coalesce(assigned_to::text, 'livre') from public.assets where id = (select antigo from eq)), 'maintenance|livre',
  'o antigo vai para manutenção, sem dono');
select is((select status::text from public.assets where id = (select novo from eq)), 'in_use', 'o novo fica em uso');
select is((select assigned_to from public.assets where id = (select novo from eq)), (select ana from u), 'o novo fica com quem abriu o chamado');
select is((select asset_id from public.tickets where id = (select chamado from eq)), (select novo from eq), 'o chamado aponta para o novo');
select is((select count(*)::int from public.ticket_comments where ticket_id = (select chamado from eq) and is_internal
            and content like 'Equipamento trocado: Notebook velho → Notebook novo.%'), 1, 'a nota interna registra a troca');

select * from finish();
rollback;
