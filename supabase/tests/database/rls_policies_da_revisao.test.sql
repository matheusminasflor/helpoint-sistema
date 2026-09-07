-- Prova das quatro migrations da revisão de sistema de 2026-09-04.
--
-- ┌─ HISTÓRICO: ESTE ARQUIVO NASCEU VERMELHO, DE PROPÓSITO ────────────────┐
-- │ Foi escrito ANTES das migrations serem aplicadas, e cada asserção       │
-- │ descrevia um buraco que existia no banco naquele momento:               │
-- │                                                                         │
-- │   · o colaborador aprovava as próprias férias;                          │
-- │   · o colaborador trocava o arquivo do próprio holerite;                │
-- │   · qualquer usuário do tenant lia o razão do Financeiro;               │
-- │   · o cliente do SAC não conseguia gravar a avaliação.                  │
-- │                                                                         │
-- │ Contra o schema de então, 6 das 10 falhavam. As migrations              │
-- │ 20260905020000..0300 subiram no test-helpoint em 2026-09-06 e as 10     │
-- │ ficaram verdes. Um teste que já nasce verde não prova nada — só         │
-- │ descreve o que já acontecia. Este provou.                               │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Rode com:  npx supabase test db --linked   (precisa do Docker Desktop de pé)

begin;
\ir _helpers.psql

select plan(10);

-- ───────────────────────────────────────────────────────────────────────────
-- Fixtures, criadas com o papel do runner, antes de qualquer autenticação
-- ───────────────────────────────────────────────────────────────────────────
create temporary table f on commit drop as
select tests.create_tenant('pgtap-revisao', 'Revisao pgTAP') as tenant;

create temporary table u on commit drop as
select tests.create_user('colaborador@pgtap.test', (select tenant from f))  as colaborador,
       tests.create_customer('cliente@pgtap.test',  (select tenant from f)) as cliente;

-- Fixtures são do runner; depois de `authenticate_as` o teste é `authenticated`
-- e precisa de permissão para lê-las.
grant select on f, u to authenticated;

-- Uma solicitação de férias pendente, do colaborador.
insert into public.rh_vacation_requests (tenant_id, user_id, start_date, end_date, days_requested, status)
select tenant, colaborador, current_date + 30, current_date + 39, 10, 'pendente' from f, u;

-- Um holerite do colaborador.
insert into public.rh_payslips (tenant_id, user_id, reference_month, file_path)
select tenant, colaborador, date_trunc('month', current_date)::date, 'holerites/original.pdf' from f, u;

-- Um lançamento no razão.
insert into public.fin_entries (tenant_id, kind, description, due_date, competence)
select tenant, 'payable', 'Aluguel', current_date + 10, date_trunc('month', current_date)::date from f;

-- Um chamado de SAC do cliente, JÁ RESOLVIDO. O estado importa: a asserção
-- final tenta reabri-lo, e um UPDATE que grava o mesmo valor que já estava lá
-- não é alteração nenhuma — o trigger não veria diferença e deixaria passar,
-- dando um verde falso. O chamado precisa estar num estado diferente daquele
-- que o teste tenta impor.
insert into public.sac_tickets (tenant_id, customer_user_id, customer_email, customer_name, description, status)
select tenant, cliente, 'cliente@pgtap.test', 'Cliente pgTAP', 'Produto veio com defeito', 'resolved' from f, u;

-- ───────────────────────────────────────────────────────────────────────────
-- Férias: o colaborador cancela, e só isso
-- ───────────────────────────────────────────────────────────────────────────
select tests.authenticate_as('colaborador@pgtap.test');

select throws_ok(
  $q$update public.rh_vacation_requests set status = 'aprovada'$q$,
  '42501',
  null,
  'colaborador NAO aprova as proprias ferias'
);

select lives_ok(
  $q$update public.rh_vacation_requests set status = 'cancelada'$q$,
  'colaborador cancela a propria solicitacao'
);

select is(
  (select status from public.rh_vacation_requests),
  'cancelada',
  'e o cancelamento realmente gravou'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Holerite: marcar como visto sim, trocar o arquivo não
-- ───────────────────────────────────────────────────────────────────────────
select lives_ok(
  $q$update public.rh_payslips set viewed_at = now()$q$,
  'colaborador marca o proprio holerite como visto'
);

select throws_ok(
  $q$update public.rh_payslips set file_path = 'holerites/adulterado.pdf'$q$,
  '42501',
  null,
  'colaborador NAO troca o arquivo do proprio holerite'
);

-- ───────────────────────────────────────────────────────────────────────────
-- Financeiro: sem o módulo concedido, o razão não existe para o usuário
--
-- O colaborador não tem linha em `user_roles`, então também não passa pelo
-- fallback `is_supervisor_or_higher`. É o caso do usuário comum.
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select count(*) from public.fin_entries)::int,
  0,
  'usuario sem o modulo financeiro nao le o razao'
);

select tests.clear_authentication();
select tests.grant_module((select colaborador from u), (select tenant from f), 'financeiro');
select tests.authenticate_as('colaborador@pgtap.test');

select is(
  (select count(*) from public.fin_entries)::int,
  1,
  'com o modulo concedido, le'
);

-- ───────────────────────────────────────────────────────────────────────────
-- SAC: o cliente avalia o próprio chamado, e não mexe em mais nada
-- ───────────────────────────────────────────────────────────────────────────
select tests.clear_authentication();
select tests.authenticate_as('cliente@pgtap.test');

select lives_ok(
  $q$update public.sac_tickets set satisfaction_rating = 5, satisfaction_rated_at = now()$q$,
  'a avaliacao do cliente nao levanta erro'
);

-- E a asserção que importa. Sem policy de UPDATE para o cliente, o comando
-- acima volta 200 com ZERO linhas afetadas — sem erro nenhum. Foi assim que o
-- defeito viveu escondido: o front mostrava "Obrigado pela sua avaliação" e o
-- banco não tinha gravado nada. `lives_ok` sozinho passaria verde hoje.
select is(
  (select satisfaction_rating from public.sac_tickets),
  5,
  'e a nota realmente gravou'
);

select throws_ok(
  $q$update public.sac_tickets set status = 'open'$q$,
  '42501',
  null,
  'cliente NAO reabre o proprio chamado'
);

select * from finish();
rollback;
