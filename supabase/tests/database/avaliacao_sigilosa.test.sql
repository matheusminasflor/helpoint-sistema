-- A AVALIAÇÃO DO ATENDIMENTO É SIGILOSA (migration 20261223010000; dono, 2026-10-09).
--   pede  abriu o chamado e avalia
--   ate   atendente do Marketing (não vê a nota de jeito nenhum)
--   ges   gestor do Marketing (vê as do setor)
--   dir   Diretoria (vê)
--   out   gestor de outro setor (não vê)
begin;
\ir _helpers.psql

select plan(11);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-aval', 'Aval', false) as a;
create temporary table u on commit drop as
select tests.create_user('pede@aval.test', (select a from f)) as pede,
       tests.create_user('ate@aval.test',  (select a from f)) as ate,
       tests.create_user('ges@aval.test',  (select a from f)) as ges,
       tests.create_user('dir@aval.test',  (select a from f)) as dir,
       tests.create_user('out@aval.test',  (select a from f)) as fora;
select tests.grant_module((select ate from u), (select a from f), 'marketing');
select tests.grant_profile((select ate from u), (select a from f), 'marketing', 'Operador');
select tests.grant_module((select ges from u), (select a from f), 'marketing');
select tests.grant_profile((select ges from u), (select a from f), 'marketing', 'Gestor');
select tests.grant_module((select dir from u), (select a from f), 'diretoria');
select tests.grant_profile((select fora from u), (select a from f), 'qualidade', 'Gestor');
grant select on f, u to authenticated;

create temporary table ch on commit drop as select gen_random_uuid() as resolvido, gen_random_uuid() as aberto;
grant select on ch to authenticated;
insert into public.tickets (id, tenant_id, module, title, description, priority, status, requester_id, created_by, assigned_to, resolved_at)
select resolvido, a, 'marketing', 'Arte', 'x', 'medium', 'resolved', pede, pede, ate, now() from ch, f, u
union all
select aberto, a, 'marketing', 'Banner', 'x', 'medium', 'in_progress', pede, pede, ate, null from ch, f, u;

-- ═══ 1-3. Só quem abriu, só resolvido, e uma vez só. ═══
select tests.authenticate_as('ate@aval.test');
select throws_ok($$ select public.avaliar_atendimento((select resolvido from ch), 5, 'eu mesmo') $$,
  '42501', null, 'o atendente nao avalia o proprio atendimento');
select tests.authenticate_as('pede@aval.test');
select throws_ok($$ select public.avaliar_atendimento((select aberto from ch), 4, null) $$,
  '23514', null, 'chamado ainda aberto nao e avaliado');
select public.avaliar_atendimento((select resolvido from ch), 2, 'Demorou e a arte veio errada');
select throws_ok($$ select public.avaliar_atendimento((select resolvido from ch), 5, null) $$,
  '23514', null, 'nao avalia duas vezes');
-- 4. Quem pediu vê a própria avaliação.
select is((select nota from public.avaliacoes_do_atendimento where ticket_id = (select resolvido from ch)), 2,
  'quem avaliou ve a propria avaliacao');
select tests.clear_authentication();

-- ═══ 5-7. Nada vaza para o chamado. ═══
select is((select satisfaction_rating from public.tickets where id = (select resolvido from ch)), null,
  'a nota nao vai para o chamado');
select ok((select avaliado_em is not null from public.tickets where id = (select resolvido from ch)),
  'o chamado so guarda que foi avaliado');
select is((select count(*)::int from public.ticket_comments where ticket_id = (select resolvido from ch)), 0,
  'nenhum comentario com a nota no chamado');

-- ═══ 8-11. Quem lê o registro. ═══
select tests.authenticate_as('ate@aval.test');
select is((select count(*)::int from public.avaliacoes_do_atendimento), 0, 'o atendente nao ve a avaliacao');
select tests.authenticate_as('ges@aval.test');
select is((select comentario from public.avaliacoes_do_atendimento where ticket_id = (select resolvido from ch)),
  'Demorou e a arte veio errada', 'o gestor do setor ve a nota e o motivo');
select tests.authenticate_as('dir@aval.test');
select is((select count(*)::int from public.avaliacoes_do_atendimento), 1, 'a Diretoria ve');
select tests.authenticate_as('out@aval.test');
select is((select count(*)::int from public.avaliacoes_do_atendimento), 0, 'gestor de outro setor nao ve');
select tests.clear_authentication();

select * from finish();
rollback;
