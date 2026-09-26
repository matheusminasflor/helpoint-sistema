-- O SAC É DO MÓDULO DELE (migration 20261106010000)
--
-- 2026-09-26, pedido do dono: "fecha o sac_tickets por módulo, igual chamado".
--
-- A leva dos chamados internos (`20261030010000`) fechou `tickets` e deixou o SAC
-- de fora, porque o pedido de então falava de chamado interno. Sete tabelas
-- ficaram abertas a qualquer pessoa do tenant — inclusive os COMENTÁRIOS, que é
-- onde a reclamação mora, e `sac_ticket_products`, cuja policy era só
-- `tenant_id` (um `viewer` inseria e apagava).
--
-- AS DUAS METADES, e a segunda é a que teria pegado o erro do CI #111:
--
--   FECHOU     quem tem outro módulo (Marketing) não vê chamado, comentário,
--              anexo, produto nem laudo;
--   NÃO QUEBROU a Qualidade vê, o diretor vê, e **quem atende vê mesmo sem ter
--              o módulo** — é o caso que uma régua só por concessão perderia, e
--              perder quem atende o chamado é pior que o buraco.
--
-- E a terceira: **o Comercial continua sabendo que existe reclamação**. A ficha do
-- cliente (leva G) mostrava isso lendo `sac_tickets` direto, o que este
-- fechamento quebraria. `com_sacs_do_cliente` devolve só o resumo — e a asserção
-- prova as duas coisas ao mesmo tempo: o vendedor NÃO lê a tabela e LÊ o resumo.
begin;
\ir _helpers.psql

select plan(12);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-sac-mod', 'SAC do modulo', false) as a,
       tests.create_tenant('pgtap-sac-out', 'Outra empresa', false) as b;

create temporary table u on commit drop as
select tests.create_user('marketing@sacmod.test', (select a from f)) as mkt,
       tests.create_user('qualidade@sacmod.test', (select a from f)) as qual,
       tests.create_user('atende@sacmod.test',    (select a from f)) as atende,
       tests.create_user('diretor@sacmod.test',   (select a from f)) as diretor,
       tests.create_user('vendedor@sacmod.test',  (select a from f)) as vendedor,
       tests.create_user('deoutra@sacout.test',   (select b from f)) as de_outra;
-- Todos `member`: ninguém leva cargo de gestor, senão `is_supervisor_or_higher`
-- abriria o SAC por trás e o teste mediria outra coisa.
select tests.grant_role((select mkt from u), 'member');
select tests.grant_role((select qual from u), 'member');
select tests.grant_role((select atende from u), 'member');
select tests.grant_role((select diretor from u), 'member');
select tests.grant_role((select vendedor from u), 'member');
select tests.grant_role((select de_outra from u), 'member');
select tests.grant_module((select mkt from u),      (select a from f), 'marketing');
select tests.grant_module((select qual from u),     (select a from f), 'qualidade');
select tests.grant_module((select diretor from u),  (select a from f), 'diretoria');
select tests.grant_module((select vendedor from u), (select a from f), 'comercial');
-- Quem atende NÃO recebe módulo nenhum, de propósito: é o caso que prova que a
-- régua não é só a concessão.
grant select on f, u to authenticated;

create temporary table ch on commit drop as
with ins as (
  insert into public.sac_tickets
    (tenant_id, customer_name, customer_email, customer_document, subject, description, status, assigned_to)
  select a, 'Consumidor X', 'x@consumidor.test', '08319138000160',
         'Produto veio vazando', 'Chegou aberto', 'open', (select atende from u)
  from f returning id
) select id from ins;
grant select on ch to authenticated;

insert into public.sac_ticket_comments (tenant_id, ticket_id, author_id, author_type, content, is_internal)
select a, (select id from ch), (select atende from u), 'staff', 'Lote suspeito, conferir', true from f;
insert into public.sac_ticket_products (tenant_id, ticket_id, product_name, quantity)
select a, (select id from ch), 'Shampoo 1L', 2 from f;
-- `report_number` é obrigatório e não tem default: quem o preenche é a tela.
insert into public.sac_technical_reports (tenant_id, ticket_id, report_number, status)
select a, (select id from ch), 'LAUDO-1', 'draft' from f;

-- O cliente do Comercial com o MESMO documento — é o que liga a ficha ao SAC.
insert into public.com_clientes (tenant_id, codigo, razao_social, ativo, origem, documento)
select a, 'SACX', 'Cliente do SAC', true, 'cadastro', '08319138000160' from f;

-- ═══════════════════════════════════════════════════════════════════════════
-- FECHOU: quem é de outro módulo
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('marketing@sacmod.test');
select is((select count(*)::int from public.sac_tickets), 0,
  'quem tem o Marketing nao ve chamado de SAC — antes via todos, com nome e documento do consumidor');
select is((select count(*)::int from public.sac_ticket_comments), 0,
  'nem o comentario, que e onde a reclamacao mora');
select is((select count(*)::int from public.sac_ticket_products), 0,
  'nem o produto reclamado — a policy mais aberta das sete, que era so `tenant_id`');
select is((select count(*)::int from public.sac_technical_reports), 0,
  'nem o laudo tecnico');
-- Regra 12: INSERT barrado por WITH CHECK levanta 42501.
select throws_ok(
  format($$ insert into public.sac_ticket_products (tenant_id, ticket_id, product_name, quantity)
            select a, %L::uuid, 'Inventado', 1 from f $$, (select id from ch)),
  '42501', null,
  'e nao insere produto na reclamacao de ninguem — um `viewer` fazia isso'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO QUEBROU
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('qualidade@sacmod.test');
select is((select count(*)::int from public.sac_tickets), 1, 'a Qualidade ve o chamado');
select is((select count(*)::int from public.sac_ticket_comments), 1, 'e le o comentario');
select tests.clear_authentication();

select tests.authenticate_as('atende@sacmod.test');
select is((select count(*)::int from public.sac_tickets), 1,
  'QUEM ATENDE ve o chamado mesmo SEM ter o modulo — perder isto seria pior que o buraco');
select is((select count(*)::int from public.sac_ticket_comments), 1,
  'e comenta nele: o comentario e do chamado, nao do modulo');
select tests.clear_authentication();

select tests.authenticate_as('diretor@sacmod.test');
select is((select count(*)::int from public.sac_tickets), 1,
  'o diretor ve, pela regra que ele mesmo decidiu: le chamado de todos os setores');
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- O Comercial: não a tabela, e sim o resumo
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('vendedor@sacmod.test');
select is((select count(*)::int from public.sac_tickets), 0,
  'o vendedor NAO le a tabela do SAC');
select is(
  (select count(*)::int from public.com_sacs_do_cliente('08.319.138/0001-60')),
  1,
  'MAS ve o resumo na ficha do cliente — e casando o documento PONTUADO com o que o portal gravou em digitos'
);
select tests.clear_authentication();

select * from finish();
rollback;
