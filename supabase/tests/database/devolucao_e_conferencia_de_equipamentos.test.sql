-- DEMISSÃO, DEVOLUÇÃO E CONFERÊNCIA DE EQUIPAMENTOS (migration 20270129100000; dono, 2026-10-20).
-- rh abre o desligamento; sai = quem está saindo (com notebook e mouse); tec = Inventário da TI; dono = owner.
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-devolucao', 'Devolucao', false) as a;
create temporary table u on commit drop as
select tests.create_user('rh@devol.test',   (select a from f)) as rh,
       tests.create_user('sai@devol.test',  (select a from f)) as sai,
       tests.create_user('tec@devol.test',  (select a from f)) as tec,
       tests.create_user('dono@devol.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
insert into public.access_profiles (tenant_id, department, name, permissions)
select a, 'ti', 'Inventario', '{"inventory": {"view": true, "create": true, "edit": true, "conferir": true}}'::jsonb from f;
select tests.grant_module((select tec from u), (select a from f), 'ti');
select tests.grant_profile((select tec from u), (select a from f), 'ti', 'Inventario');

create temporary table ativo on commit drop as
with x as (
  insert into public.assets (tenant_id, name, asset_tag, category, status, assigned_to)
  select a, n, t, 'hardware', 'in_use', (select sai from u) from f, (values ('Notebook', 'NB-1'), ('Mouse', 'MS-1')) v(n, t)
  returning id, name
) select * from x;
grant select on f, u, ativo to authenticated;

-- ═══ 1. Desligamento sem dizer quem sai é recusado ═══
select throws_ok($$
  insert into public.tickets (tenant_id, module, title, description, subcategory, requester_id, created_by)
  values ((select a from f), 'rh', 'Desligamento', 'x', 'Desligamento', (select rh from u), (select rh from u)) $$,
  '23514', null, 'desligamento sem o colaborador que sai e recusado');

-- ═══ 2-5. Com quem sai: a TI recebe o chamado, no nome de quem sai, com os equipamentos dele ═══
insert into public.tickets (tenant_id, module, title, description, subcategory, requester_id, created_by, colaborador_id)
values ((select a from f), 'rh', 'Desligamento', 'x', 'Desligamento', (select rh from u), (select rh from u), (select sai from u));

create temporary table ch on commit drop as
select t.id as ticket, c.id as checagem from public.tickets t join public.ti_checagens c on c.ticket_id = t.id
 where t.tenant_id = (select a from f) and t.module = 'tickets';
grant select on ch to authenticated;

select is((select count(*)::int from ch), 1, 'o desligamento abre um chamado da TI com a devolucao');
select is((select colaborador_id from public.tickets where id = (select ticket from ch)), (select sai from u),
  'o chamado da TI e de quem sai (antes era de quem abriu no RH)');
select is((select requester_id from public.tickets where id = (select ticket from ch)), (select rh from u),
  'quem pediu continua sendo o RH');
select is((select count(*)::int from public.ti_checagem_itens where checagem_id = (select checagem from ch)), 2,
  'a lista traz cada equipamento no nome de quem sai');

-- ═══ 6. Não resolve com item sem marca ═══
select throws_ok($$update public.tickets set status = 'resolved' where id = (select ticket from ch)$$,
  '23514', null, 'nao resolve com equipamento sem marcar');

select tests.authenticate_as('tec@devol.test');
-- ═══ 7. "Não devolvido" sem motivo é recusado ═══
select throws_ok($$select public.ti_marcar_item(
  (select i.id from public.ti_checagem_itens i join ativo on ativo.id = i.asset_id where ativo.name = 'Mouse'), 'nao_devolvido', null)$$,
  '23514', null, 'nao devolvido sem motivo e recusado');
-- ═══ 8. Termo antes de marcar tudo é recusado ═══
select throws_ok($$select public.ti_anexar_termo_de_devolucao((select checagem from ch),
  (select a from f)::text || '/devolucoes/x/termo.pdf')$$,
  '23514', null, 'anexar o termo antes de marcar tudo e recusado');
select public.ti_marcar_item(
  (select i.id from public.ti_checagem_itens i join ativo on ativo.id = i.asset_id where ativo.name = 'Notebook'), 'ok');
select public.ti_marcar_item(
  (select i.id from public.ti_checagem_itens i join ativo on ativo.id = i.asset_id where ativo.name = 'Mouse'),
  'nao_devolvido', 'Levou para casa e deixou um mouse pessoal no lugar');
select tests.clear_authentication();

-- ═══ 9-11. O efeito no Inventário e o aviso ═══
select is((select status::text || '|' || coalesce(assigned_to::text, '-') from public.assets
            where id = (select id from ativo where name = 'Notebook')), 'in_stock|-', 'devolvido ok volta ao estoque');
select is((select assigned_to from public.assets where id = (select id from ativo where name = 'Mouse')), (select sai from u),
  'nao devolvido continua no nome de quem saiu');
select ok(exists (select 1 from public.notifications
                   where user_id = (select dono from u) and type = 'equipamento_pendente'
                     and reference_id = (select ticket from ch)),
  'o nao devolvido avisa a diretoria (e o RH e o gestor), levando ao chamado');

-- ═══ 12. Tudo marcado, mas sem o termo assinado: ainda não resolve ═══
select throws_ok($$update public.tickets set status = 'resolved' where id = (select ticket from ch)$$,
  '23514', null, 'sem o termo de devolucao assinado nao resolve');

-- ═══ 13. Com o termo, resolve ═══
select tests.authenticate_as('tec@devol.test');
select public.ti_anexar_termo_de_devolucao((select checagem from ch), (select a from f)::text || '/devolucoes/x/termo.pdf');
select tests.clear_authentication();
select lives_ok($$update public.tickets set status = 'resolved' where id = (select ticket from ch)$$,
  'com tudo marcado e o termo anexado, resolve');

-- ═══ 14. O histórico guarda quem teve o notebook ═══
select is((select count(*)::int from public.asset_historico
            where asset_id = (select id from ativo where name = 'Notebook') and pessoa_id = (select sai from u) and ate is not null),
  1, 'o historico guarda que quem saiu teve o notebook, ate a devolucao');

-- ═══ 15-16. A conferência do mês: uma só, com o que está com alguém ═══
-- No dia 1 (o padrão sem configuração): a rotina abre só no dia escolhido (20270212020000).
select public.ti_abrir_conferencia_do_mes(date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
select public.ti_abrir_conferencia_do_mes(date_trunc('month', now() at time zone 'America/Sao_Paulo')::date);
select is((select count(*)::int from public.ti_checagens where tenant_id = (select a from f) and tipo = 'conferencia'), 1,
  'a conferencia do mes nasce uma vez so');
select is((select count(*)::int from public.ti_checagem_itens i join public.ti_checagens c on c.id = i.checagem_id
            where c.tenant_id = (select a from f) and c.tipo = 'conferencia'), 1,
  'e lista o que esta no nome de alguem (o mouse)');

-- ═══ 17. anon fora (lição 14) ═══
select ok(not has_function_privilege('anon', 'public.ti_marcar_item(uuid, text, text)', 'execute')
      and not has_function_privilege('anon', 'public.ti_anexar_termo_de_devolucao(uuid, text)', 'execute')
      and not has_function_privilege('authenticated', 'public.ti_abrir_conferencia_do_mes()', 'execute'),
  'anon nao chama as funcoes; a conferencia so o relogio abre');

select * from finish();
rollback;
