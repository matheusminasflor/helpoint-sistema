-- Leva L0 (Fase 3): o enum de notificação tem todos os tipos que o código
-- usa, e a resposta de cliente no SAC avisa o staff pelo sino.
--
-- Antes da migration 20260908010000: `check-alerts` inseria três tipos que
-- não existiam (o INSERT falhava em silêncio), e resposta de cliente não
-- gerava aviso nenhum para o staff.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(7);

-- ───────────────────────────────────────────────────────────────────────────
-- O enum cobre tudo que o código escreve
-- ───────────────────────────────────────────────────────────────────────────
select ok(
  (select array_agg(e.enumlabel::text order by e.enumsortorder)
     from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'notification_type')
  @> array['reminder','deadline_expired','ticket_created','request_decided','purchase_decided','sac_customer_reply'],
  'notification_type tem os seis tipos que faltavam'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: uma empresa, um cliente, um atendente de Qualidade, um chamado
-- de SAC atribuído ao atendente.
-- ───────────────────────────────────────────────────────────────────────────
create temporary table f on commit drop as
select tests.create_tenant('pgtap-sac-notif', 'SAC notif') as tenant;

create temporary table u on commit drop as
select tests.create_customer('cliente@pgtap.test',   (select tenant from f)) as cliente,
       tests.create_user('atendente@pgtap.test',     (select tenant from f)) as atendente,
       tests.create_user('outro@pgtap.test',         (select tenant from f)) as outro;

select tests.grant_module((select atendente from u), (select tenant from f), 'qualidade');

-- O id nasce antes do INSERT: `create table as` não aceita INSERT ... RETURNING
-- dentro do select.
create temporary table s on commit drop as
select gen_random_uuid() as sac_id;

insert into public.sac_tickets (id, tenant_id, customer_user_id, customer_email, customer_name, description, assigned_to)
select sac_id, tenant, cliente, 'cliente@pgtap.test', 'Cliente pgTAP', 'Produto veio com defeito', atendente from s, f, u;

-- ───────────────────────────────────────────────────────────────────────────
-- Cliente responde → o atendente é avisado, e só ele
-- ───────────────────────────────────────────────────────────────────────────
insert into public.sac_ticket_comments (tenant_id, ticket_id, author_id, author_type, author_name, content)
select tenant, sac_id, cliente, 'customer', 'Cliente pgTAP', 'Ainda nao resolveu' from f, s, u;

select is(
  (select count(*)::int from public.notifications
    where type = 'sac_customer_reply' and reference_id = (select sac_id from s)),
  1,
  'resposta de cliente gera exatamente um aviso'
);

-- A corrente inteira: o comentário do cliente dispara `sac_auto_status_on_reply`,
-- que muda o status do chamado. A tranca do cliente (migration 020300) barrava
-- esse UPDATE por dentro — desde 06/09 toda resposta de cliente falhava. A
-- migration 20260908010100 deixa trigger aninhado passar; isto prova.
select is(
  (select status from public.sac_tickets where id = (select sac_id from s)),
  'in_analysis',
  'a resposta do cliente move o chamado para em analise (a tranca deixa o trigger passar)'
);

select is(
  (select user_id from public.notifications
    where type = 'sac_customer_reply' and reference_id = (select sac_id from s)),
  (select atendente from u),
  'e o aviso vai para o responsavel do chamado'
);

select is(
  (select reference_type from public.notifications
    where type = 'sac_customer_reply' and reference_id = (select sac_id from s)),
  'sac_ticket',
  'com reference_type sac_ticket, que o sino roteia para /qualidade/sacs/:id'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Resposta do staff e comentário interno NÃO geram aviso ao staff
-- ───────────────────────────────────────────────────────────────────────────
insert into public.sac_ticket_comments (tenant_id, ticket_id, author_id, author_type, author_name, content)
select tenant, sac_id, atendente, 'staff', 'Atendente', 'Vamos verificar' from f, s, u;

insert into public.sac_ticket_comments (tenant_id, ticket_id, author_id, author_type, author_name, content, is_internal)
select tenant, sac_id, cliente, 'customer', 'Cliente pgTAP', 'nota interna estranha', true from f, s, u;

select is(
  (select count(*)::int from public.notifications
    where type = 'sac_customer_reply' and reference_id = (select sac_id from s)),
  1,
  'resposta do staff e comentario interno nao geram aviso'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Sem responsável, vai para quem tem o módulo Qualidade
-- ───────────────────────────────────────────────────────────────────────────
-- Tirar o responsável é ação de staff: a tranca do cliente barra qualquer
-- UPDATE direto de quem não tem profile no tenant — inclusive o runner do
-- teste, cujo auth.uid() é nulo. Então o atendente faz.
select tests.authenticate_as('atendente@pgtap.test');
update public.sac_tickets set assigned_to = null where id = (select sac_id from s);
select tests.clear_authentication();

insert into public.sac_ticket_comments (tenant_id, ticket_id, author_id, author_type, author_name, content)
select tenant, sac_id, cliente, 'customer', 'Cliente pgTAP', 'Alguem me responde?' from f, s, u;

-- Dentro de uma transação `now()` é constante, então "o aviso mais recente"
-- não se separa por created_at. Conta-se: são dois avisos ao todo (um por
-- resposta), e o único destinatário em ambos é quem tem o módulo.
select is(
  (select array_agg(distinct user_id) from public.notifications
    where type = 'sac_customer_reply' and reference_id = (select sac_id from s)),
  (select array[atendente] from u),
  'sem responsavel, avisa quem tem o modulo Qualidade — e nao o usuario sem modulo'
);

select * from finish();
rollback;
