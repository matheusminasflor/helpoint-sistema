-- Chamado é do módulo dele — e a prova é a CORRENTE, não a linha
-- (migration 20261030010000_chamados_por_modulo_no_banco.sql)
--
-- Decisão D12 do plano da Fase 3, confirmada pelo dono em 2026-09-26 diante do
-- fato medido: qualquer funcionário cadastrado lia TODOS os chamados da empresa
-- pelo endereço direto — RH (salário, atestado), Financeiro (dinheiro),
-- Qualidade, SAC. A policy de `tickets` tinha `has_role(auth.uid(), 'member')`,
-- que não fala de módulo nenhum.
--
-- POR QUE ESTA SUÍTE TEM MAIS ASSERÇÃO DE COMENTÁRIO QUE DE CHAMADO. Porque
-- trocar só a policy de `tickets` seria teatro: `has_role(…, 'member')` aparecia
-- em DEZ policies de CINCO tabelas, e `ticket_comments` é onde o assunto do
-- chamado realmente mora. Com só a primeira trocada, a pessoa não leria a LINHA
-- do chamado de RH e leria a CONVERSA dele. É a regra 8 do pgTAP no CLAUDE.md
-- aplicada à correção, não só ao teste: exercite o caminho que o usuário
-- percorre.
--
-- O ELENCO, e cada um existe para separar uma coisa:
--
--   chefe     owner              — vê tudo, e é o que não pode quebrar;
--   rh        member + módulo rh — vê RH, não vê TI;
--   ti        member + módulo ti — vê TI (module = 'tickets'!), não vê RH;
--   solto     member, sem módulo — vê só o que abriu ou atende. É ele que prova
--                                  que o papel `member` deixou de ser passe livre;
--   diretor   member + diretoria — vê TODOS os módulos. É a regressão que eu quase
--                                  introduzi: sem ele no mapa, o painel "chamados
--                                  por setor" mostraria só o que o diretor abriu e
--                                  chamaria de "a empresa".
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('chamado-modulo', 'Chamado por Modulo', false) as tenant;

create temporary table u on commit drop as
select tests.create_user('chefe@chamado-modulo.test',  (select tenant from f)) as chefe,
       tests.create_user('rh@chamado-modulo.test',     (select tenant from f)) as rh,
       tests.create_user('ti@chamado-modulo.test',     (select tenant from f)) as ti,
       tests.create_user('solto@chamado-modulo.test',  (select tenant from f)) as solto,
       tests.create_user('diretor@chamado-modulo.test',(select tenant from f)) as diretor;

select tests.grant_role((select chefe from u),   'owner');
select tests.grant_role((select rh from u),      'member');
select tests.grant_role((select ti from u),      'member');
select tests.grant_role((select solto from u),   'member');
-- `member`, NÃO `manager`: se ele fosse gestor passaria por
-- `is_supervisor_or_higher` e o teste provaria outra coisa. O diretor puro é
-- justamente quem tem a Diretoria sem ter cargo de gestão.
select tests.grant_role((select diretor from u), 'member');

select tests.grant_module((select rh from u),      (select tenant from f), 'rh');
select tests.grant_module((select ti from u),      (select tenant from f), 'ti');
select tests.grant_module((select diretor from u), (select tenant from f), 'diretoria');

grant select on f, u to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- A fixture: dois chamados, um de cada módulo, abertos pelo CHEFE — assim
-- nenhum dos três `member` é requerente nem responsável, e a única coisa que
-- pode deixá-los ver é o módulo. Com o chamado aberto pela própria pessoa, toda
-- asserção passaria pelo motivo errado.
--
-- Cada chamado leva um comentário INTERNO e um público, porque é a distinção
-- que a policy de comentário faz e a antiga não fazia direito.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('chefe@chamado-modulo.test');

create temporary table c on commit drop as
with rh_ticket as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  values ((select tenant from f), 'rh', 'Atestado de setembro', 'assunto de RH',
          (select chefe from u), (select chefe from u), 'medium', 'open')
  returning id
), ti_ticket as (
  insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
  values ((select tenant from f), 'tickets', 'Notebook nao liga', 'assunto de TI',
          (select chefe from u), (select chefe from u), 'medium', 'open')
  returning id
)
select (select id from rh_ticket) as chamado_rh, (select id from ti_ticket) as chamado_ti;

grant select on c to authenticated;

insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal) values
  ((select tenant from f), (select chamado_rh from c), (select chefe from u), 'nota interna do RH', true),
  ((select tenant from f), (select chamado_rh from c), (select chefe from u), 'resposta publica do RH', false),
  ((select tenant from f), (select chamado_ti from c), (select chefe from u), 'nota interna da TI', true),
  ((select tenant from f), (select chamado_ti from c), (select chefe from u), 'resposta publica da TI', false);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 e 2. O QUE A LEVA EXISTE PARA CONSERTAR. Quem tem RH vê o chamado de RH e
-- **não vê** o de TI. Antes, as duas contagens eram 1 — o `has_role(member)`
-- abria os dois.
--
-- Mutação (é a policy anterior): trocar a linha do módulo por
-- `has_role(auth.uid(), 'member')` faz a asserção 2 virar 1 e acusar.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('rh@chamado-modulo.test');

select is(
  (select count(*)::int from public.tickets where id = (select chamado_rh from c)),
  1,
  'quem tem o módulo RH vê o chamado de RH'
);

select is(
  (select count(*)::int from public.tickets where id = (select chamado_ti from c)),
  0,
  'e NÃO vê o chamado da TI — era isto que o papel member abria para todo mundo'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 e 4. A CORRENTE. O comentário é onde o assunto mora: "o atestado da semana
-- passada", "o valor do acordo". Sem esta asserção, trocar só a policy de
-- `tickets` passaria verde e a conversa seguiria aberta.
--
-- Quem tem o módulo lê TUDO do chamado dele, inclusive nota interna — é para
-- isso que a nota interna existe, para a equipe do módulo.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from public.ticket_comments where ticket_id = (select chamado_rh from c)),
  2,
  'quem tem o módulo RH lê os dois comentários do chamado de RH, inclusive a nota interna'
);

select is(
  (select count(*)::int from public.ticket_comments where ticket_id = (select chamado_ti from c)),
  0,
  'e não lê NENHUM comentário do chamado da TI — nem o público'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 e 6. O PAR QUE NÃO BATE PELO NOME, e é o do módulo com mais chamados.
-- `tickets.module` vale **'tickets'** para a TI; a concessão chama-se **'ti'**.
-- Escrever `uma.module = t.module` pareceria certo e esconderia a TI de quem tem
-- a TI — em silêncio, porque ninguém suspeita de um nome que parece igual.
--
-- Mutação: tirar o par ('ti','tickets') do mapa da função faz a 5 virar 0.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('ti@chamado-modulo.test');

select is(
  (select count(*)::int from public.tickets where id = (select chamado_ti from c)),
  1,
  'quem tem o módulo ti vê o chamado cujo module é "tickets" — o par que não bate pelo nome'
);

select is(
  (select count(*)::int from public.tickets where id = (select chamado_rh from c)),
  0,
  'e não vê o de RH: a separação vale nos dois sentidos'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 7, 8 e 9. O PAPEL `member` DEIXOU DE SER PASSE LIVRE. Esta pessoa tem papel
-- `member` e nenhum módulo concedido: antes, lia os dois chamados e os quatro
-- comentários da empresa.
--
-- E o que ela CONTINUA vendo: o chamado que ela mesma abre. Sem a asserção 9, a
-- correção poderia ter fechado demais — quem abre um chamado tem de acompanhar.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('solto@chamado-modulo.test');

select is(
  (select count(*)::int from public.tickets),
  0,
  'member sem módulo nenhum não vê chamado de ninguém'
);

select is(
  (select count(*)::int from public.ticket_comments),
  0,
  'nem um comentário — a corrente inteira fechou, não só a linha do chamado'
);

insert into public.tickets (tenant_id, module, title, description, requester_id, created_by, priority, status)
values ((select tenant from f), 'rh', 'Meu pedido', 'aberto por mim',
        (select solto from u), (select solto from u), 'low', 'open');

select is(
  (select count(*)::int from public.tickets where requester_id = (select solto from u)),
  1,
  'mas continua vendo o chamado que ELE abriu, em qualquer módulo — fechar isso seria fechar demais'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 10 e 11. O CHEFE NÃO PODE QUEBRAR. `is_supervisor_or_higher` (owner, admin,
-- manager) continua vendo tudo — é o que a gestão e a Diretoria precisam, e o que
-- o front já assume (`hasModuleAccess` devolve verdadeiro para owner/admin sem
-- olhar concessão). Uma correção de segurança que cega o dono do sistema volta
-- atrás no dia seguinte.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('chefe@chamado-modulo.test');

select is(
  (select count(*)::int from public.tickets where id in ((select chamado_rh from c), (select chamado_ti from c))),
  2,
  'owner continua vendo os chamados dos dois módulos'
);

select is(
  (select count(*)::int from public.ticket_comments),
  4,
  'e os quatro comentários, inclusive as notas internas'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 12 e 13. O DIRETOR PURO — a regressão que eu quase introduzi.
--
-- Ele é `member` + módulo `diretoria`, sem cargo de gestão: não passa por
-- `is_supervisor_or_higher`. Antes desta leva ele via tudo pelo
-- `has_role(member)`, por acidente. Se o mapa de módulos não tratasse
-- `diretoria`, ele passaria a ver só o que abriu — e o painel dele conta
-- "chamados por setor" da EMPRESA INTEIRA: somaria dois ou três e chamaria de a
-- empresa. Número errado, sem erro nenhum na tela, num painel chamado Diretoria.
--
-- O comentário de `RequireDiretoria` (setembro) já dizia, palavra por palavra,
-- que era isso que aconteceria no dia em que a RLS de `tickets` mudasse. Este
-- bloco é o que impede o aviso de virar profecia.
--
-- Mutação: tirar o ramo `when 'diretoria' = any (…)` da função faz a 12 virar 0.
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('diretor@chamado-modulo.test');

select is(
  (select count(*)::int from public.tickets where id in ((select chamado_rh from c), (select chamado_ti from c))),
  2,
  'o diretor puro vê os chamados de TODOS os módulos — o painel dele conta a empresa inteira'
);

select is(
  (select count(*)::int from public.ticket_comments),
  4,
  'e a conversa também: contar chamado sem poder abrir o chamado é meio caminho'
);

select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- 14. A GUARDA ESTRUTURAL — a razão de esta suíte continuar valendo depois.
--
-- A tabela tem um CHECK que limita `tickets.module` a sete valores. A função
-- `modulos_de_chamado_visiveis()` tem um par para cada um desses sete. As duas
-- listas têm de ser A MESMA.
--
-- Quem acrescentar um módulo ao CHECK (Compras, Expedição, o que vier) e não der
-- par a ele aqui reprova AGORA, com o nome do módulo novo na mensagem. Sem esta
-- asserção, os chamados do módulo novo ficariam invisíveis para todo mundo menos
-- quem os abriu — falha FECHADA, que é a direção segura, e por isso mesmo
-- silenciosa: ninguém reclama do que nunca viu.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select array_agg(x order by x) from (
     select unnest(regexp_matches(pg_get_constraintdef(oid), '''([a-z_]+)''::text', 'g')) as x
     from pg_constraint where conname = 'tickets_module_check'
   ) s),
  (select array_agg(x order by x) from (
     select unnest(regexp_matches(pg_get_functiondef(p.oid), '''([a-z_]+)''\s*\)', 'g')) as x
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'modulos_de_chamado_visiveis'
   ) s2),
  'os módulos que a tabela aceita são exatamente os que a função sabe mapear — módulo novo sem par reprova aqui'
);

select * from finish();
rollback;
