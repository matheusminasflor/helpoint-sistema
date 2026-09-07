-- Leva L0, segunda passada (2026-09-08): o chamado avisa os DOIS lados.
--
-- Antes da migration 20260908020000, só o técnico que respondia avisava o
-- solicitante (insert no front). Solicitante que respondia não avisava
-- ninguém; chamado novo não avisava a equipe; SAC aberto e avaliado não
-- chegavam à Qualidade; pedido de compra não chegava a quem aprova; holerite
-- e documento no cofre não chegavam ao colaborador. Agora tudo isso é trigger.
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(12);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures: empresa, solicitante (sem módulo), técnico de TI, dono, e um
-- usuário sem nada — que NUNCA deve ser avisado.
-- ───────────────────────────────────────────────────────────────────────────
create temporary table f on commit drop as
select tests.create_tenant('pgtap-dois-lados', 'Dois lados') as tenant;

create temporary table u on commit drop as
select tests.create_user('solicitante@pgtap.test', (select tenant from f)) as solicitante,
       tests.create_user('tecnico@pgtap.test',     (select tenant from f)) as tecnico,
       tests.create_user('dono@pgtap.test',        (select tenant from f)) as dono,
       tests.create_user('ninguem@pgtap.test',     (select tenant from f)) as ninguem,
       tests.create_customer('cliente@pgtap.test', (select tenant from f)) as cliente;

select tests.grant_module((select tecnico from u), (select tenant from f), 'ti');
select tests.grant_role((select dono from u), 'owner');

create temporary table s on commit drop as
select gen_random_uuid() as ticket_id, gen_random_uuid() as sac_id;

grant select on f, u, s to authenticated;

-- quem recebeu aviso de um dado tipo sobre uma referência
create or replace function tests.avisados(p_ref uuid, p_type public.notification_type, p_like text default '%')
returns text language sql as $$
  select coalesce(string_agg(distinct au.email, ',' order by au.email), 'ninguem')
    from public.notifications n
    join auth.users au on au.id = n.user_id
   where n.reference_id = p_ref and n.type = p_type and n.message like p_like;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Chamado novo sem responsável → equipe do módulo, e só ela
-- ───────────────────────────────────────────────────────────────────────────
insert into public.tickets (id, tenant_id, module, title, description, priority, status, created_by, requester_id)
select ticket_id, tenant, 'tickets', 'Impressora parou', 'nao imprime', 'medium', 'open', solicitante, solicitante from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_created'),
  'tecnico@pgtap.test',
  'chamado novo avisa quem tem o modulo TI — nem o solicitante, nem quem nao tem modulo'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Solicitante responde sem responsável → equipe do módulo
-- ───────────────────────────────────────────────────────────────────────────
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
select tenant, ticket_id, solicitante, 'alguem me ajuda' from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_reply', '%alguem me ajuda%'),
  'tecnico@pgtap.test',
  'solicitante respondeu sem responsavel → equipe do modulo'
);

-- pgTAP: LIKE é `alike`, não `like` (o CI pegou: "function like(text, unknown, unknown) does not exist").
select alike(
  (select title from public.notifications where reference_id = (select ticket_id from s) and message like '%alguem me ajuda%' limit 1),
  'Solicitante respondeu%',
  'o titulo diz que foi o solicitante'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Técnico assume e responde em público → solicitante
-- ───────────────────────────────────────────────────────────────────────────
update public.tickets set assigned_to = (select tecnico from u) where id = (select ticket_id from s);

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
select tenant, ticket_id, tecnico, 'ja estou vendo' from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_reply', '%ja estou vendo%'),
  'solicitante@pgtap.test',
  'tecnico respondeu → solicitante'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Solicitante responde com responsável → só o responsável
-- ───────────────────────────────────────────────────────────────────────────
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
select tenant, ticket_id, solicitante, 'obrigado continua' from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_reply', '%obrigado continua%'),
  'tecnico@pgtap.test',
  'solicitante respondeu com responsavel → so o responsavel'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Comentário interno → ninguém; terceiro em público → solicitante e responsável
-- ───────────────────────────────────────────────────────────────────────────
insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
select tenant, ticket_id, tecnico, 'nota interna', true from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_reply', '%nota interna%'),
  'ninguem',
  'comentario interno nao avisa ninguem'
);

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content)
select tenant, ticket_id, dono, 'passando por aqui' from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'ticket_reply', '%passando por aqui%'),
  'solicitante@pgtap.test,tecnico@pgtap.test',
  'terceiro em publico → solicitante e responsavel'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Módulo sem equipe → owner/admin/manager, nunca o solicitante
-- ───────────────────────────────────────────────────────────────────────────
insert into public.tickets (tenant_id, module, title, description, priority, status, created_by, requester_id)
select tenant, 'rh', 'Ferias', 'x', 'medium', 'open', solicitante, solicitante from f, u;

select is(
  tests.avisados((select id from public.tickets where title = 'Ferias' and tenant_id = (select tenant from f)), 'ticket_created'),
  'dono@pgtap.test',
  'chamado de RH sem ninguem com o modulo → cai no dono'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Pedido de compra → equipe do Financeiro (sem equipe: dono)
-- ───────────────────────────────────────────────────────────────────────────
insert into public.fin_purchase_requests (tenant_id, ticket_id, product_name, estimated_amount, created_by)
select tenant, ticket_id, 'Monitor', 899.9, solicitante from s, f, u;

select is(
  tests.avisados((select ticket_id from s), 'purchase_requested'),
  'dono@pgtap.test',
  'pedido de compra avisa quem aprova, nao quem pediu'
);

-- ───────────────────────────────────────────────────────────────────────────
-- SAC: cliente abre → responsável (ou Qualidade); cliente avalia → responsável
-- ───────────────────────────────────────────────────────────────────────────
insert into public.sac_tickets (id, tenant_id, customer_user_id, customer_email, customer_name, subject, description, assigned_to)
select sac_id, tenant, cliente, 'cliente@pgtap.test', 'Cliente pgTAP', 'Produto errado', 'veio outro', tecnico from s, f, u;

select is(
  tests.avisados((select sac_id from s), 'ticket_created'),
  'tecnico@pgtap.test',
  'SAC aberto avisa o responsavel'
);

-- Avaliar é ação do cliente; a tranca (migration 020300/020400) deixa passar.
select tests.authenticate_as('cliente@pgtap.test');
update public.sac_tickets set satisfaction_rating = 4, satisfaction_comment = 'resolveu' where id = (select sac_id from s);
select tests.clear_authentication();

select is(
  tests.avisados((select sac_id from s), 'sac_customer_rated', '%resolveu%'),
  'tecnico@pgtap.test',
  'cliente avaliou → responsavel, com a nota e o comentario'
);

-- ───────────────────────────────────────────────────────────────────────────
-- RH: holerite e documento no cofre → o colaborador
-- ───────────────────────────────────────────────────────────────────────────
insert into public.rh_payslips (tenant_id, user_id, reference_month, type, file_path)
select tenant, solicitante, '2026-08-01', 'mensal', 'x/holerite.pdf' from f, u;

insert into public.rh_documents (tenant_id, user_id, document_type, title, file_path, uploaded_by)
select tenant, solicitante, 'contrato', 'Contrato 2026', 'x/contrato.pdf', dono from f, u;

select is(
  (select array_agg(n.title order by n.title) from public.notifications n
    where n.type = 'document_available' and n.user_id = (select solicitante from u)),
  array['Documento no cofre — Contrato 2026', 'Holerite disponível — 08/2026'],
  'holerite e documento no cofre chegam ao colaborador'
);

select * from finish();
rollback;
