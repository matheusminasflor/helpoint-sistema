-- Aviso só dos meus setores e aviso de prazo (migration 20261208010000; dono, 2026-10-06).
--
-- Ser dono dá ACESSO a tudo, mas a fila e o prazo de um setor só avisam quem é do setor (campo
-- Setor, concessão ou perfil de acesso) ou o marcou em "Acompanhar também". Prazo:
--   com atendente, em risco → só o atendente; vencido → atendente + quem gere a fila
--   (Transferir no perfil); sem atendente → o setor; solicitante e colegas nunca.
--
--   dono  owner, Setor = TI, sem concessão nem perfil (o caso medido na produção)
--   tec   TI, Operador
--   ate   Marketing, Operador — o atendente
--   ger   Marketing, Gestor — gere a fila
--   col   Marketing, Somente leitura — colega que vê a fila e não a gere
--   sol   quem abre, sem setor
begin;
\ir _helpers.psql

select plan(21);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-avisos-setores', 'Avisos por setor') as tenant;
create temporary table u on commit drop as
select tests.create_user('dono@setores.test', (select tenant from f)) as dono,
       tests.create_user('tec@setores.test',  (select tenant from f)) as tec,
       tests.create_user('ate@setores.test',  (select tenant from f)) as ate,
       tests.create_user('ger@setores.test',  (select tenant from f)) as ger,
       tests.create_user('col@setores.test',  (select tenant from f)) as col,
       tests.create_user('sol@setores.test',  (select tenant from f)) as sol;
select tests.grant_role((select dono from u), 'owner');
update public.profiles set department = 'ti' where id = (select dono from u);
select tests.grant_module((select tec from u), (select tenant from f), 'ti');
select tests.grant_profile((select tec from u), (select tenant from f), 'ti', 'Operador');
select tests.grant_module(x, (select tenant from f), 'marketing') from (select ate x from u union all select ger from u union all select col from u) s;
select tests.grant_profile((select ate from u), (select tenant from f), 'marketing', 'Operador');
select tests.grant_profile((select ger from u), (select tenant from f), 'marketing', 'Gestor');
select tests.grant_profile((select col from u), (select tenant from f), 'marketing', 'Somente leitura');
-- O teste depende de o colega NÃO ter "Transferir": se a semente mudar, o teste avisa aqui.
select is(public.tem_permissao((select col from u), 'marketing', 'tickets', 'transfer'), false,
  'premissa: Somente leitura nao tem "Transferir" (nao gere a fila)');
grant select on f, u to authenticated;

create function tests.chamado(p_titulo text) returns uuid language sql as $$
  select id from public.tickets where title = p_titulo and tenant_id = (select tenant from f);
$$;
create function tests.avisados(p_titulo text, p_type public.notification_type) returns text language sql as $$
  select coalesce(string_agg(distinct au.email, ',' order by au.email), 'ninguem')
    from public.notifications n join auth.users au on au.id = n.user_id
   where n.reference_id = tests.chamado(p_titulo) and n.type = p_type;
$$;
create function tests.prazo(p_titulo text, p_vencido boolean) returns text language sql as $$
  select coalesce(string_agg(au.email, ',' order by au.email), 'ninguem')
    from unnest(public.avisados_do_prazo(tests.chamado(p_titulo), p_vencido)) as x(id)
    join auth.users au on au.id = x.id;
$$;
grant execute on function tests.chamado(text) to authenticated;

insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
select tenant, m, titulo, 'x', 'medium', 'open', sol, sol
  from f, u, (values ('marketing', 'arte do evento'), ('marketing', 'banner'), ('tickets', 'impressora'), ('rh', 'ferias')) v(m, titulo);

-- ═══ 2-4. Criado sem atendente: só quem é do setor. ═══
select is(tests.avisados('arte do evento', 'ticket_created'), 'ate@setores.test,col@setores.test,ger@setores.test',
  'chamado do Marketing avisa o Marketing — o dono, que e da TI, nao');
select is(tests.avisados('impressora', 'ticket_created'), 'dono@setores.test,tec@setores.test',
  'chamado da TI avisa a TI — o dono entra pelo campo Setor, o tecnico pela concessao');
select is(tests.avisados('ferias', 'ticket_created'), 'ninguem',
  'setor sem ninguem (RH) nao cai mais no dono');

-- ═══ 5-6. Prazo SEM atendente → todo o setor (decisão do dono), nunca o dono de fora. ═══
select is(tests.prazo('arte do evento', false), 'ate@setores.test,col@setores.test,ger@setores.test',
  'em risco, sem atendente: todos do setor');
select is(tests.prazo('arte do evento', true), 'ate@setores.test,col@setores.test,ger@setores.test',
  'vencido, sem atendente: todos do setor');

-- ═══ 7-8. Prazo COM atendente. ═══
update public.tickets set assigned_to = (select ate from u), status = 'in_progress'
 where id = tests.chamado('arte do evento');
select is(tests.prazo('arte do evento', false), 'ate@setores.test',
  'em risco, com atendente: so o atendente — nem o gestor, nem o colega, nem quem abriu');
select is(tests.prazo('arte do evento', true), 'ate@setores.test,ger@setores.test',
  'vencido, com atendente: o atendente e quem gere a fila — o colega e quem abriu nao');

-- ═══ 9-10. Vencido sai UMA vez: rodar de novo (o cron do dia seguinte) não duplica. ═══
select is(public.avisar_prazo_vencido(tests.chamado('arte do evento')), 2, 'vencido: avisa atendente e gestor');
select is(public.avisar_prazo_vencido(tests.chamado('arte do evento')), 0,
  'vencido de novo: ninguem e avisado duas vezes do mesmo chamado');

-- ═══ 11. "Acompanhar também" o Marketing → passa a receber a fila de lá. ═══
update public.profiles set acompanha_setores = array['marketing'] where id = (select dono from u);
insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
select tenant, 'marketing', 'rotulo novo', 'x', 'medium', 'open', sol, sol from f, u;
select is(tests.avisados('rotulo novo', 'ticket_created'),
  'ate@setores.test,col@setores.test,dono@setores.test,ger@setores.test',
  'quem marca "acompanhar tambem" o Marketing recebe a fila de la');

-- ═══ 12-14. O resumo da Lyra: o que atendo, o sem atendente do setor; o gestor, o setor inteiro. ═══
select tests.authenticate_as('col@setores.test');
select is((select string_agg(title, ',' order by title) from public.chamados_do_meu_resumo()), 'banner,rotulo novo',
  'colega: os sem atendente do setor — nao o atraso de outra pessoa');
select tests.clear_authentication();
select tests.authenticate_as('ger@setores.test');
select is((select string_agg(title, ',' order by title) from public.chamados_do_meu_resumo()), 'arte do evento,banner,rotulo novo',
  'gestor: o setor inteiro');
select tests.clear_authentication();
select tests.authenticate_as('sol@setores.test');
select is((select count(*)::int from public.chamados_do_meu_resumo()), 0,
  'quem so abriu os chamados nao ve o prazo deles no resumo');

-- ═══ 15-17. A pessoa edita o próprio "acompanhar"; não o de outra. Setor inválido é recusado. ═══
select is((with x as (update public.profiles set acompanha_setores = array['rh']
                       where id = (select sol from u) returning id) select count(*)::int from x),
  1, 'a pessoa marca o proprio "acompanhar tambem"');
select is((with x as (update public.profiles set acompanha_setores = array['rh']
                       where id = (select col from u) returning id) select count(*)::int from x),
  0, 'e nao muda o de outra pessoa (o UPDATE nao acha a linha)');
select throws_ok(
  $$update public.profiles set acompanha_setores = array['inventado'] where id = (select sol from u)$$,
  '23514', null, 'setor que nao existe e recusado');
select tests.clear_authentication();

-- ═══ 18-21. As portas. ═══
select ok(not has_function_privilege('anon', 'public.setores_de_aviso(uuid)', 'execute'), 'anon nao chama setores_de_aviso');
select ok(not has_function_privilege('anon', 'public.chamados_do_meu_resumo()', 'execute'), 'anon nao chama o resumo');
select ok(not has_function_privilege('authenticated', 'public.avisar_prazo_vencido(uuid)', 'execute'),
  'quem esta logado nao dispara aviso de vencido');
select ok(has_function_privilege('service_role', 'public.avisar_prazo_vencido(uuid)', 'execute'),
  'o check-alerts (service_role) dispara');

select * from finish();
rollback;
