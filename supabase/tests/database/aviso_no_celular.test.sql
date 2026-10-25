-- AVISO NO CELULAR (migration 20270201030000).
begin;
\ir _helpers.psql

select plan(5);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-push', 'Push', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@push.test', (select a from f)) as ana,
       tests.create_user('bia@push.test', (select a from f)) as bia;
grant select on f, u to authenticated;

select tests.authenticate_as('ana@push.test');
insert into public.push_inscricoes (endpoint, p256dh, auth) values ('https://push.example/ana', 'p', 'a') returning id;
select tests.clear_authentication();
select tests.authenticate_as('bia@push.test');
select is((select count(*)::int from public.push_inscricoes), 0, 'cada um vê só os próprios aparelhos');
select throws_ok($$ insert into public.push_inscricoes (endpoint, p256dh, auth, user_id) select 'https://push.example/x', 'p', 'a', ana from u $$,
  '42501', null, 'ninguém inscreve o aparelho no nome de outra pessoa');
select tests.clear_authentication();

-- Um aviso novo da Ana (com aparelho) e um da Bia (sem): só o da Ana vai para o celular.
insert into public.notifications (tenant_id, user_id, type, reference_type, title, message)
select a, (select ana from u), 'solicitacao', 'solicitacao', 'Pedido de arte novo', 'Banner' from f
union all
select a, (select bia from u), 'solicitacao', 'solicitacao', 'Outro', 'x' from f;
select is((select count(*)::int from public.avisos_push_pendentes()), 1, 'só sai o aviso de quem tem aparelho inscrito');
select public.avisos_push_enviados(array(select aviso_id from public.avisos_push_pendentes()), '{}');
select is((select count(*)::int from public.avisos_push_pendentes()), 0, 'o enviado não sai de novo');
select is(has_function_privilege('authenticated', 'public.avisos_push_pendentes()', 'execute'), false,
  'só o robô lê a fila de avisos (tem os endereços dos aparelhos)');

select * from finish();
rollback;
