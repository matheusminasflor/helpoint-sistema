-- PROJETO AVISA POR E-MAIL (migration 20261218010000; dono, 2026-10-08).
-- Pelo caminho da tela (insert com RETURNING, papel authenticated — lições 8 e 11):
--   1-2  a pessoa escolhida no setor recebe aviso COM e-mail; o gestor do setor, aviso sem e-mail;
--   3    escolher a si mesmo como referência não avisa ninguém;
--   4    a referência gravada depois (projeto criado de um modelo) recebe e-mail;
--   5    quem recebe atividade recebe e-mail;
--   6-7  a fila agrupa por pessoa + projeto; quem desligou o e-mail no perfil sai da fila;
--   8-9  a fila e o aviso com e-mail não são chamáveis por quem está logado.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-projmail', 'ProjMail') as a;
create temporary table u on commit drop as
select tests.create_user('dono@projmail.test', (select a from f)) as dono,
       tests.create_user('gis@projmail.test',  (select a from f)) as gis,
       tests.create_user('ger@projmail.test',  (select a from f)) as ger,
       tests.create_user('vini@projmail.test', (select a from f)) as vini,
       tests.create_user('meri@projmail.test', (select a from f)) as meri;
-- Cada um do setor em que é escolhido (desde 20261220010000 a pessoa do setor é sempre do setor).
update public.profiles set department = 'marketing' where id in ((select gis from u), (select meri from u));
update public.profiles set department = 'qualidade' where id = (select vini from u);
update public.profiles set department = 'compras' where id = (select dono from u);
select tests.grant_profile((select ger from u), (select a from f), 'marketing', 'Gestor');
grant select on f, u to authenticated;
create temporary table s on commit drop as select gen_random_uuid() as projeto;
grant select on s to authenticated;

select tests.authenticate_as('dono@projmail.test');
insert into public.projects (id, tenant_id, name, owner_id, created_by)
select projeto, (select a from f), 'Nutribalance 1 Litro', auth.uid(), auth.uid() from s returning id;
insert into public.project_setores (tenant_id, project_id, setor, referencia_id)
select (select a from f), projeto, 'marketing', (select gis from u) from s returning id;
insert into public.project_setores (tenant_id, project_id, setor, referencia_id)
select (select a from f), projeto, 'compras', auth.uid() from s returning id;
-- Como na cópia do modelo: o setor nasce sem ninguém e a tela grava a pessoa logo depois.
insert into public.project_setores (tenant_id, project_id, setor)
select (select a from f), projeto, 'qualidade' from s returning id;
update public.project_setores set referencia_id = (select vini from u)
 where project_id = (select projeto from s) and setor = 'qualidade' returning id;
select tests.clear_authentication();
-- Quem planeja o Marketing é o Marketing (20261220010000): a Gislene dá a atividade à Merilyn.
select tests.authenticate_as('gis@projmail.test');
insert into public.tasks (tenant_id, project_id, setor, title, status, user_id)
select (select a from f), projeto, 'marketing', 'Criação da arte', 'pending', (select meri from u) from s returning id;
select tests.clear_authentication();

select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select gis from u) and type = 'projeto_setor_chamado'), 'false',
  'a pessoa escolhida no setor recebe o aviso com e-mail');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select ger from u) and type = 'projeto_setor_chamado'), 'true',
  'o gestor do setor recebe so o aviso na tela');
select is((select count(*)::int from public.notifications
            where user_id = (select dono from u) and reference_type = 'project'), 0,
  'escolher a si mesmo como referencia nao avisa ninguem');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select vini from u) and type = 'projeto_setor_chamado'), 'false',
  'a referencia gravada depois (projeto de modelo) recebe e-mail');
select is((select string_agg(email_sent::text, ',') from public.notifications
            where user_id = (select meri from u) and type = 'projeto_atividade'), 'false',
  'quem recebe atividade recebe e-mail');

-- A Merilyn desliga o e-mail no perfil: sai da fila (e o aviso continua na tela).
update public.profiles set receber_email_chamados = false where id = (select meri from u);
create temporary table fila on commit drop as
select * from public.projeto_emails_pendentes(50, interval '0 seconds') where project_id = (select projeto from s);

select is((select array_agg(email order by email) from fila),
  array['gis@projmail.test', 'vini@projmail.test'],
  'a fila tem um e-mail por pessoa e projeto, so para quem pediu');
select is((select count(*)::int from public.notifications
            where user_id = (select meri from u) and email_sent = false), 0,
  'quem desligou o e-mail no perfil sai da fila');

select ok(not has_function_privilege('authenticated', 'public.projeto_emails_pendentes(int, interval)', 'execute'),
  'quem esta logado nao le a fila de e-mail');
select ok(not has_function_privilege('authenticated',
  'public.avisar_projeto_com_email(uuid, uuid, public.notification_type, uuid, text, text)', 'execute'),
  'quem esta logado nao manda aviso com e-mail por conta propria');

select * from finish();
rollback;
