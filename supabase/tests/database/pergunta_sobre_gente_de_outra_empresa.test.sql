-- "ESTE UUID É ADMIN?" — a pergunta que qualquer um fazia sobre qualquer um
-- (migration 20261104010000)
--
-- Leva B, resto (2026-09-26). Decisão do dono: fechar **entre empresas**.
--
-- O QUE ESTA SUÍTE PRENDE, e as duas metades importam igual:
--
-- 1. **FECHOU.** `is_admin`, `has_role`, `get_user_role`, `has_*_access` e
--    `tem_permissao` param de responder sobre gente de outra empresa.
--
-- 2. **NÃO QUEBROU.** Esta é a metade que ninguém escreve, e é a que teria
--    pegado o erro do CI #111: a família é chamada por 344 policies, então um
--    guarda errado não "vaza menos" — derruba o sistema para todo mundo. As
--    asserções 6 a 13 são sobre a pessoa certa continuar entrando, incluindo a
--    CORRENTE inteira (regra 8): ler a tabela, e não só chamar a função.
--
-- 3. **O sistema continua podendo perguntar.** Sete edge functions
--    (ai-credentials, bling-oauth, facebook-leads-config, nfe-focus,
--    payment-credentials, shipping-label, whatsapp-credentials) perguntam
--    `is_admin_or_higher(userId)` com a **chave de serviço** para decidir quem
--    mexe em credencial. Se o guarda as cegasse, ninguém mais configuraria
--    integração nenhuma — e o sintoma seria "não sou admin", não um erro.
--
-- 4. **O guarda não é chamável de fora** (regra 14): ele é função nova, nasceria
--    aberta para PUBLIC, e não precisa de ninguém — as 17 funções são
--    `security definer`, então a chamada de dentro vale pelo dono.
--
-- DENTRO DA EMPRESA CONTINUA ABERTO, e é decisão do dono (2026-09-26): o cargo
-- do colega já é legível em `user_roles` por quem é da empresa. Função mais
-- fechada que a tabela seria teatro. A asserção 6 prende essa escolha, para que
-- mudá-la seja uma decisão e não um acidente.
begin;
\ir _helpers.psql

select plan(14);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-guarda-a', 'Guarda A', false) as a,
       tests.create_tenant('pgtap-guarda-b', 'Guarda B', false) as b;

create temporary table u on commit drop as
select tests.create_user('chefe@guarda-a.test', (select a from f)) as chefe_a,
       tests.create_user('ze@guarda-a.test',    (select a from f)) as ze_a,
       tests.create_user('chefe@guarda-b.test', (select b from f)) as chefe_b;
select tests.grant_role((select chefe_a from u), 'owner');
select tests.grant_role((select chefe_b from u), 'owner');
select tests.grant_role((select ze_a from u), 'member');
-- O Zé é gente comum com o módulo Financeiro concedido: é o caso que prova que
-- conceder módulo continua valendo depois do guarda.
select tests.grant_module((select ze_a from u), (select a from f), 'financeiro');
grant select on f, u to authenticated, anon;

-- Uma conta a pagar em cada empresa, para a corrente ter o que mostrar.
-- `competence` é obrigatória e é o primeiro dia do mês DO BRASIL, não do
-- servidor: o CI roda em UTC e depois das 21h os dois são meses diferentes no
-- dia 1º (regra 10 do pgTAP).
insert into public.fin_entries (tenant_id, kind, description, amount, due_date, status, source, competence)
select a, 'payable', 'Conta da A', 100.00,
       (now() at time zone 'America/Sao_Paulo')::date, 'pending', 'manual',
       date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date from f;
insert into public.fin_entries (tenant_id, kind, description, amount, due_date, status, source, competence)
select b, 'payable', 'Conta da B', 200.00,
       (now() at time zone 'America/Sao_Paulo')::date, 'pending', 'manual',
       date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date from f;

-- Um perfil de acesso na empresa A, para `tem_permissao` ter o que responder.
create temporary table perfil on commit drop as
with ins as (
  insert into public.access_profiles (tenant_id, department, name, permissions)
  -- `budgets:manage` desde a leva N (2026-09-27): era `purchases:manage_budget`, e
  -- Compras saiu do Financeiro. Aqui a permissão é só um exemplo — o que este teste
  -- prova é o guarda de empresa em `tem_permissao` —, mas exemplo que nomeia
  -- permissão morta manda quem lê procurar uma coisa que não existe.
  -- `payables.view` desde 20261123030000: o Financeiro obedece ao perfil no banco, e a corrente
  -- abaixo (o Zé lendo a conta da empresa dele) precisa do "Ver" de Contas a Pagar.
  select a, 'financeiro', 'Cuida do teto', '{"budgets": {"manage": true}, "payables": {"view": true}}'::jsonb
  from f returning id
) select id from ins;
insert into public.user_access_profiles (tenant_id, user_id, department, profile_id)
select a, (select ze_a from u), 'financeiro', (select id from perfil) from f;
grant select on perfil to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- FECHOU: o Zé, da empresa A, perguntando sobre o chefe da empresa B
-- ═══════════════════════════════════════════════════════════════════════════
select tests.authenticate_as('ze@guarda-a.test');

select is(
  public.is_admin((select chefe_b from u)),
  false,
  'is_admin sobre gente de OUTRA empresa responde false'
);
select is(
  public.has_role((select chefe_b from u), 'owner'),
  false,
  'has_role sobre gente de outra empresa responde false'
);
select is(
  public.get_user_role((select chefe_b from u)),
  null,
  'get_user_role sobre gente de outra empresa responde NULO — o retorno e o cargo, nao um sim/nao'
);
select is(
  public.has_fin_access((select chefe_b from u)),
  false,
  'has_fin_access sobre gente de outra empresa responde false, apesar de ele ser owner la'
);
select is(
  public.tem_permissao((select chefe_b from u), 'financeiro', 'budgets', 'manage'),
  false,
  'tem_permissao sobre gente de outra empresa responde false'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO QUEBROU: e esta é a metade que derrubaria o sistema se estivesse errada
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  public.is_admin((select chefe_a from u)),
  true,
  'is_admin sobre o chefe da MINHA empresa continua respondendo — e e decisao do dono, nao descuido: `user_roles` ja mostra o cargo do colega'
);
select is(
  public.has_fin_access((select ze_a from u)),
  true,
  'quem recebeu o modulo Financeiro continua tendo o modulo Financeiro'
);
select is(
  public.get_user_role((select ze_a from u)),
  'member'::public.app_role,
  'e continua sabendo o proprio cargo'
);
select is(
  public.tem_permissao((select ze_a from u), 'financeiro', 'budgets', 'manage'),
  true,
  'e a permissao granular do proprio perfil continua valendo'
);

-- A CORRENTE (regra 8): a policy de `fin_entries` chama `has_fin_access(auth.uid())`.
-- Chamar a função e ler a tabela são coisas diferentes, e é a tabela que a
-- pessoa usa.
select is(
  (select count(*)::int from public.fin_entries),
  1,
  'e LENDO A TABELA ele ve a conta da empresa dele — a corrente inteira, nao so a funcao'
);
select is(
  (select count(*)::int from public.fin_entries where description = 'Conta da B'),
  0,
  'e nao ve a da outra empresa'
);
select tests.clear_authentication();

-- ═══════════════════════════════════════════════════════════════════════════
-- O SISTEMA continua podendo perguntar
-- ═══════════════════════════════════════════════════════════════════════════
-- `clear_authentication` deixa o papel do runner e o claim vazio: é o caso
-- "sem pedido HTTP" — gatilho, cron, migration. Se o guarda o barrasse, todo
-- trigger que pergunta cargo pararia de funcionar.
select is(
  public.is_admin((select chefe_b from u)),
  true,
  'sem pedido HTTP nenhum (gatilho, cron, psql) a pergunta e respondida: e o banco trabalhando'
);

-- E a chave de serviço, que é como as sete edge functions de credencial
-- perguntam. Simulado escrevendo o claim que o PostgREST escreve para ela.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select is(
  public.is_admin_or_higher((select chefe_b from u)),
  true,
  'com a chave de servico a pergunta e respondida sobre qualquer pessoa — sete edge functions dependem disso'
);
select set_config('request.jwt.claims', '', true);

-- ═══════════════════════════════════════════════════════════════════════════
-- O guarda não é chamável de fora (regra 14)
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select count(*)::int from (
    select 1 where has_function_privilege('anon', 'public.pode_responder_sobre(uuid)', 'execute')
    union all
    select 1 where has_function_privilege('authenticated', 'public.pode_responder_sobre(uuid)', 'execute')
  ) x),
  0,
  'nem anon nem quem esta logado executa o guarda: ele e chamado por dentro, pelo dono da funcao'
);

select * from finish();
rollback;
