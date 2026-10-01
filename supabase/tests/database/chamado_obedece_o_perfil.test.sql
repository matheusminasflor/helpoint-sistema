-- O chamado obedece o perfil de acesso (migration 20261119010000_chamado_obedece_o_perfil.sql)
--
-- Achado do dono em 2026-10-01: a Gislene (Operador do Marketing, atribuída ao chamado) não mudava
-- o status, e as caixinhas de chamado do perfil não mudavam nada em setor nenhum. Agora cada ação
-- pergunta ao perfil do setor do chamado — e "estar atribuído" deixou de ser passe livre.
--
-- O ELENCO (todos `member`; o cargo não pode ser o motivo de nada passar):
--   chefe   owner                        — pode tudo, e é o que não pode quebrar;
--   op      Marketing + perfil Operador  — assume, muda status, fecha; NÃO transfere, NÃO exclui;
--   leitor  Marketing + Somente leitura  — vê a fila, não mexe;
--   sem     Marketing, sem perfil        — tem o módulo, não tem "ver": só o que abre ou atende;
--   req     sem módulo                   — abriu o chamado; avalia o que lhe entregaram.
-- Toda escrita vai com RETURNING (lição 11) e todo bloqueio é conferido pelo erro 42501 — a guarda
-- é trigger, então ela levanta erro em vez de filtrar zero linhas (lição 12).
begin;
\ir _helpers.psql

select plan(16);

create temporary table f on commit drop as
select tests.create_tenant('chamado-perfil', 'Chamado pelo Perfil', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('chefe@chamado-perfil.test',  (select tenant from f)) as chefe,
       tests.create_user('op@chamado-perfil.test',     (select tenant from f)) as op,
       tests.create_user('leitor@chamado-perfil.test', (select tenant from f)) as leitor,
       tests.create_user('sem@chamado-perfil.test',    (select tenant from f)) as sem,
       tests.create_user('req@chamado-perfil.test',    (select tenant from f)) as req;

select tests.grant_role((select chefe from u), 'owner');
select tests.grant_role((select op from u), 'member');
select tests.grant_role((select leitor from u), 'member');
select tests.grant_role((select sem from u), 'member');
select tests.grant_role((select req from u), 'member');
select tests.grant_module((select op from u), (select tenant from f), 'marketing');
select tests.grant_module((select leitor from u), (select tenant from f), 'marketing');
select tests.grant_module((select sem from u), (select tenant from f), 'marketing');
select tests.grant_profile((select op from u), (select tenant from f), 'marketing', 'Operador');
select tests.grant_profile((select leitor from u), (select tenant from f), 'marketing', 'Somente leitura');

grant select on f, u to authenticated;

-- ═══ 1 e 2. A semente da empresa nova escreve o formato antigo; o trigger traduz pelo nome. ═══
select is(
  (select permissions -> 'tickets' from public.access_profiles
    where tenant_id = (select tenant from f) and department = 'marketing' and name = 'Operador'),
  public.chamados_do_perfil_padrao('Operador'),
  'o Operador nasce com o padrão novo: assume, muda status, fecha, reabre, nota interna — sem transferir nem excluir'
);

select is(
  (select permissions -> 'profiles' ->> 'edit' from public.access_profiles
    where tenant_id = (select tenant from f) and department = 'marketing' and name = 'Gestor'),
  'false',
  'o Gestor tem tudo do chamado, menos configurar perfis de acesso'
);

-- O chamado: aberto por quem não é da equipe, para nenhum membro ser o requerente.
select tests.authenticate_as('req@chamado-perfil.test');
create temporary table c on commit drop as
with novo as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  values ((select tenant from f), 'marketing', 'Arte do catálogo', 'preciso da arte',
          (select req from u), (select req from u), 'medium', 'open')
  returning id
)
select id from novo;
select tests.clear_authentication();
grant select on c to authenticated;

-- ═══ 3 e 4. "Ver os chamados do setor" é a caixinha, não o módulo. ═══
select tests.authenticate_as('leitor@chamado-perfil.test');
select is((select count(*)::int from public.tickets where id = (select id from c)), 1,
  'Somente leitura vê a fila do setor');

-- 5. e não mexe: mudar status levanta 42501.
select throws_ok(
  $$update public.tickets set status = 'waiting_user' where id = (select id from c) returning id$$,
  '42501', null,
  'Somente leitura não muda o status — antes nenhuma caixinha era lida'
);
select tests.clear_authentication();

select tests.authenticate_as('sem@chamado-perfil.test');
select is((select count(*)::int from public.tickets where id = (select id from c)), 0,
  'com o módulo e sem perfil (sem "ver"), a fila do setor não aparece');
select tests.clear_authentication();

-- ═══ 6 a 11. O Operador, caixinha por caixinha. ═══
select tests.authenticate_as('op@chamado-perfil.test');

select lives_ok(
  $$update public.tickets set assigned_to = auth.uid(), status = 'in_progress'
     where id = (select id from c) returning id$$,
  'Operador assume — e o "em andamento" que vem junto não pede "mudar status" à parte'
);

select throws_ok(
  $$update public.tickets set priority = 'high' where id = (select id from c) returning id$$,
  '42501', null,
  'Operador não muda prioridade — mesmo atribuído a ele (decisão 4: atribuído não é passe livre)'
);

select throws_ok(
  $$update public.tickets set assigned_to = (select chefe from u) where id = (select id from c) returning id$$,
  '42501', null,
  'Operador não transfere'
);

select lives_ok(
  $$insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values ((select tenant from f), (select id from c), auth.uid(), 'nota da equipe', true) returning id$$,
  'Operador escreve nota interna'
);

select lives_ok(
  $$update public.tickets set status = 'resolved', resolved_at = now() where id = (select id from c) returning id$$,
  'Operador resolve'
);

select throws_ok(
  $$delete from public.tickets where id = (select id from c) returning id$$,
  '42501', null,
  'Operador não exclui'
);
select tests.clear_authentication();

-- ═══ 12. Quem abriu avalia o que lhe entregaram — não é ação de equipe. ═══
select tests.authenticate_as('req@chamado-perfil.test');
select lives_ok(
  $$update public.tickets set status = 'closed', closed_at = now(), satisfaction_rating = 5
     where id = (select id from c) returning id$$,
  'quem abriu fecha avaliando, sem perfil nenhum'
);
select tests.clear_authentication();

-- ═══ 13. Nota interna de quem não age no setor. ═══
select tests.authenticate_as('leitor@chamado-perfil.test');
select throws_ok(
  $$insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
    values ((select tenant from f), (select id from c), auth.uid(), 'nota do leitor', true) returning id$$,
  '42501', null,
  'Somente leitura não escreve nota interna'
);
select tests.clear_authentication();

-- ═══ 14 e 15. O dono pode tudo. ═══
select tests.authenticate_as('chefe@chamado-perfil.test');
select lives_ok(
  $$update public.tickets set status = 'in_progress', priority = 'high', assigned_to = (select op from u)
     where id = (select id from c) returning id$$,
  'o dono reabre, muda prioridade e transfere de uma vez'
);
select lives_ok(
  $$delete from public.tickets where id = (select id from c) returning id$$,
  'e exclui'
);
select tests.clear_authentication();

-- ═══ 16. A conta não abre para quem não está logado (lição 14). ═══
select is(
  has_function_privilege('anon', 'public.pode_no_chamado(text, text)', 'execute'),
  false,
  'anon não chama pode_no_chamado'
);

select * from finish();
rollback;
