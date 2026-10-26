-- Rodada 2, R6a (migration 20270209010000): os dois relatórios novos, o prazo do SAC e "Meus treinamentos".
--
-- O que justifica a suíte: (1) os relatórios só abrem para quem tem os indicadores do setor (são `security definer` e
-- leem tabela de outro setor); (2) o SAC nasce com o MESMO prazo que um chamado da Qualidade teria (decisão do dono de
-- 2026-10-26) — antes nascia sem prazo; (3) "Meus treinamentos" devolve só as inscrições da própria pessoa, sem abrir
-- as tabelas do Educacional para ela.
begin;
\ir _helpers.psql

select plan(8);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-r6a', 'R6a', false) as a, (now() at time zone 'America/Sao_Paulo')::date as hoje;
create temporary table u on commit drop as
select tests.create_user('ana@r6a.test', (select a from f))    as ana,
       tests.create_user('chefe@r6a.test', (select a from f))  as chefe,
       tests.create_user('dono@r6a.test', (select a from f))   as dono,
       tests.create_user('beto@r6a.test', (select a from f))   as beto;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_profile((select chefe from u), (select a from f), 'comercial', 'Gestor');
select tests.grant_role((select dono from u), 'admin');
grant select on f, u to authenticated;

-- ── 1. Reembolsos e adiantamentos ──────────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('ana@r6a.test');
insert into public.solicitacoes (tipo, titulo, valor) values ('reembolso', 'Uber até o cliente', 48.5) returning id;
select tests.clear_authentication();

select tests.authenticate_as('dono@r6a.test');
select is((select string_agg(tipo || ':' || valor || ':' || etapa, ',') from public.rel_reembolsos_e_adiantamentos((select hoje from f), (select hoje from f))),
  'reembolso:48.5:pedido', 'o relatorio traz o reembolso do periodo, com o valor e a etapa');
select tests.clear_authentication();

select tests.authenticate_as('ana@r6a.test');
select throws_ok($$ select * from public.rel_reembolsos_e_adiantamentos(current_date, current_date) $$, '42501', null,
  'quem nao tem os indicadores do Financeiro nao abre o relatorio');
select tests.clear_authentication();

-- ── 2. Consumo do estoque ──────────────────────────────────────────────────────────────────────────────────────
create temporary table prod on commit drop as
with x as (insert into public.compras_produtos (tenant_id, name, suprimento, unidade)
           select a, 'Papel A4', true, 'resma' from f returning id) select id from x;
grant select on prod to authenticated;
insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, motivo)
select a, (select id from prod), 'entrada', 10, 'estoque inicial' from f;
insert into public.estoque_movimentos (tenant_id, produto_id, tipo, quantidade, retirado_por, motivo)
select a, (select id from prod), 'saida', x.q, (select beto from u), 'impressão' from f, (values (3), (2)) x(q);

select tests.authenticate_as('dono@r6a.test');
select is((select produto || ':' || quantidade || ':' || retiradas from public.rel_consumo_do_estoque((select hoje from f), (select hoje from f))),
  'Papel A4:5.00:2', 'o consumo soma so as saidas (a entrada nao e consumo), por produto e por quem retirou');
select tests.clear_authentication();

select tests.authenticate_as('ana@r6a.test');
select throws_ok($$ select * from public.rel_consumo_do_estoque(current_date, current_date) $$, '42501', null,
  'quem nao ve o estoque nem os indicadores de Compras nao abre o consumo');
select tests.clear_authentication();

-- ── 3. O prazo do SAC ──────────────────────────────────────────────────────────────────────────────────────────
insert into public.sla_policies (tenant_id, module, name, priority, first_response_time, resolution_time)
select a, 'qualidade', 'Qualidade média', 'medium', 60, 480 from f;
create temporary table sac on commit drop as select gen_random_uuid() as id, now() as em;
insert into public.sac_tickets (id, tenant_id, customer_email, customer_name, description, created_at)
select sac.id, a, 'cliente@r6a.test', 'Cliente', 'Produto veio com defeito', sac.em from sac, f;
select isnt((select sla_due_at from public.sac_tickets where id = (select id from sac)), null, 'o SAC nasce com prazo');
select is((select sla_due_at from public.sac_tickets where id = (select id from sac)),
  public.prazo_padrao_do_chamado((select a from f), 'qualidade', 'medium', (select em from sac), null, null),
  'e o prazo e o mesmo que um chamado da Qualidade teria');

-- ── 4. Meus treinamentos ───────────────────────────────────────────────────────────────────────────────────────
create temporary table tr on commit drop as
with t as (insert into public.trainings (tenant_id, title, audience, hours) select a, 'Coloração', 'ambos', 4 from f returning id),
     s as (insert into public.training_sessions (tenant_id, training_id, starts_at, modality, location)
           select a, (select id from t), now() + interval '7 days', 'presencial', 'Sala 2' from f returning id)
select (select id from s) as sessao;
insert into public.training_enrollments (tenant_id, session_id, profile_id)
select a, (select sessao from tr), x.p from f, (select ana as p from u union all select beto from u) x;

select tests.authenticate_as('ana@r6a.test');
select is((select count(*)::int from public.meus_treinamentos()), 1, 'a pessoa ve so a propria inscricao');
select is((select treinamento || ':' || situacao from public.meus_treinamentos()), 'Coloração:inscrito', 'com o treinamento e a situacao');
select tests.clear_authentication();

select * from finish();
rollback;
