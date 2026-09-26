-- `anon` só nas portas públicas — a guarda do revoke
-- (migration 20261028010000_anon_sai_das_rpcs.sql)
--
-- Leva B, primeiro item. A chave `anon` vai no bundle do navegador de todo
-- visitante: tudo o que `anon` executa, qualquer pessoa na internet executa.
-- Antes da migration eram **185 funções**; agora são 21 não-gatilho, cada uma
-- com um motivo escrito na migration.
--
-- POR QUE ESTA SUÍTE EXISTE, e é a parte que dura: em Postgres, função nasce com
-- `execute` para **PUBLIC**, e `anon` é público. Nenhuma migration precisa errar
-- para a porta reabrir — basta a próxima função nascer. Um revoke sem guarda é
-- uma limpeza com prazo de validade.
--
-- O bloco 1 é o catraca: ele compara a lista REAL com a lista escrita aqui. Quem
-- criar função nova tem duas saídas, e as duas são decisão consciente —
-- acrescentar o `revoke` na migration dela, ou acrescentar o nome a esta lista
-- com o motivo. O que não existe mais é a terceira saída, a de não perceber.
--
-- ESTA SUÍTE NÃO PRECISA DE FIXTURE, e é de propósito: ela não pergunta o que a
-- função devolve, pergunta QUEM pode chamá-la. Sem empresa, sem usuário, sem
-- `_helpers.psql` — só o catálogo e os dois papéis. Um teste de permissão que
-- depende de dado semeado falha por motivo errado no dia em que a semente mudar.
begin;

select plan(7);

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. A CATRACA. A lista de funções não-gatilho que `anon` alcança tem de ser
-- exatamente esta.
--
-- Funções de GATILHO ficam fora da conta: o PostgREST não expõe função que
-- devolve `trigger`, e chamá-la direto dá erro — elas continuam com o `execute`
-- de PUBLIC e isso não é porta. Somá-las aqui daria uma lista de 99 nomes que
-- ninguém conferiria, e uma lista que ninguém confere não é guarda.
--
-- CINCO são portas públicas de verdade (rota sem login, ou edge function que
-- chama com a chave anon); DEZESSEIS são chamadas de dentro das policies de RLS
-- e, sem elas, `anon` tomaria "permission denied for function" ao ler qualquer
-- tabela cuja policy as usa — não "nenhuma linha". Ver o cabeçalho da migration
-- para o motivo de cada uma.
-- ═══════════════════════════════════════════════════════════════════════════
select is(
  (select array_agg(distinct p.proname order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and pg_get_function_result(p.oid) <> 'trigger'
      and has_function_privilege('anon', p.oid, 'execute')),
  -- A lista esperada é escrita AGRUPADA POR MOTIVO, porque é assim que ela se
  -- confere na revisão — e ordenada aqui na comparação, para a ordem do catálogo
  -- não virar falha. Escrever em ordem alfabética tornaria a lista alfabética e
  -- ilegível: "por que esta está aqui?" é a única pergunta que importa.
  (select array_agg(nome order by nome) from unnest(array[
    -- as cinco portas públicas
    'crm_form_publico', 'crm_public_proposal', 'get_invite_public',
    'get_sac_tenant_branding', 'get_tenant_by_hostname',
    -- as dezesseis que a RLS chama de dentro das policies
    'get_customer_tenant_id', 'get_user_tenant_id',
    'has_comercial_access', 'has_diretoria_access', 'has_educacional_access',
    'has_fin_access', 'has_rh_access', 'has_role',
    'is_admin_or_higher', 'is_allowed_upload_ext', 'is_diretor',
    'is_manager_or_higher', 'is_member_or_higher_role', 'is_qualidade_tech',
    'is_supervisor_or_higher', 'tem_permissao'
  ]::name[]) as nome),
  'anon alcança exatamente 21 funções do schema public — função nova nasce aberta por PUBLIC e reprova aqui'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. AS CINCO PORTAS ABREM DE VERDADE. Privilégio no catálogo é uma coisa;
-- executar é outra. Aqui a chamada acontece com o papel `anon`, como o navegador
-- de um visitante faz.
--
-- Os argumentos são propositalmente inexistentes ("nao-existe"): a pergunta é se
-- a função EXECUTA, não o que ela devolve. Com argumento real, esta asserção
-- passaria a depender de semente e falharia por motivo errado.
--
-- Mutação: tirar `get_tenant_by_hostname` da lista de exceções da migration faz
-- esta acusar — e é a que eu quase perdi, porque só a edge function
-- `tenant-resolve-host` a chama, com a chave anon, e pelo nome ela parecia
-- interna.
-- ═══════════════════════════════════════════════════════════════════════════
select lives_ok(
  $sql$do $i$
  begin
    set local role anon;
    perform public.crm_form_publico('nao-existe', 'nao-existe');
    perform public.crm_public_proposal('token-inexistente');
    perform public.get_invite_public('00000000-0000-0000-0000-000000000000');
    perform public.get_sac_tenant_branding('nao-existe');
    perform public.get_tenant_by_hostname('nao-existe.com');
    reset role;
  end $i$ $sql$,
  'as cinco portas públicas executam como anon — rota sem login e edge function com a chave anon continuam de pé'
);
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. UMA RPC DE EQUIPE RECUSA `anon`. `com_painel_totais` é a que o painel do
-- Comercial usa; antes da migration, qualquer pessoa na internet a chamava.
--
-- Ela não devolvia dado de ninguém (filtra por `get_user_tenant_id()`, que é
-- nulo sem identidade), e é por isso que o problema passou quatro meses sem
-- incomodar. Mas "não devolve nada hoje" não é o mesmo que "está trancada": a
-- próxima função que alguém escrever sem lembrar do filtro nasce exposta.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $sql$do $i$ begin set local role anon; perform public.com_painel_totais(2026); end $i$ $sql$,
  '42501',
  null,
  'anon não executa com_painel_totais — as RPCs da equipe saíram da porta da rua'
);
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. E CONTINUA ABRINDO PARA QUEM ESTÁ LOGADO. A asserção que impede o revoke
-- de ir longe demais.
--
-- Não é paranoia: o acesso do `anon` vinha de PUBLIC, e `authenticated` também
-- dependia de PUBLIC em 28 funções. Revogar PUBLIC sem devolver explicitamente a
-- `authenticated` derrubaria o sistema todo para todo mundo — a migration faz o
-- `grant` antes do `revoke` exatamente por isso, e é esta asserção que prova que
-- fez.
-- ═══════════════════════════════════════════════════════════════════════════
select lives_ok(
  $sql$do $i$
  begin
    set local role authenticated;
    perform public.com_painel_totais(2026);
    perform public.crm_modelo_bloqueado_ate('00000000-0000-0000-0000-000000000000');
    reset role;
  end $i$ $sql$,
  'quem está logado continua executando as RPCs da equipe — inclusive as 28 que só alcançavam por PUBLIC'
);
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 e 6. AS TRÊS QUE ESCREVEM SEM PERGUNTAR QUEM CHAMA. `security definer`
-- (ignoram a RLS), gravam, e recebem só um id:
--
--   • `seed_default_access_profiles(tenant, departamento)` — grava perfil de
--     acesso em QUALQUER empresa;
--   • `create_ticket_checklists_for_ticket(chamado)` — cria checklist em
--     qualquer chamado;
--   • `sync_ticket_checklist_status(checklist)` — marca checklist como
--     concluído. O pior das três, porque é silencioso: existe
--     `enforce_ticket_checklist_before_closing` impedindo fechar chamado com
--     checklist pendente, e marcar por fora derruba a trava sem rastro.
--
-- Saem de `anon` E de `authenticated`: um usuário logado de OUTRA empresa faz o
-- mesmo estrago, porque nenhuma delas olha o tenant de quem chama. O caminho
-- interno segue funcionando — as três só são chamadas de dentro de gatilhos
-- `security definer`, e ali a chamada roda com os poderes do dono da função.
-- O bloco 4 acima é o que prova que o resto de `authenticated` não foi junto.
-- ═══════════════════════════════════════════════════════════════════════════
select throws_ok(
  $sql$do $i$ begin set local role anon;
    perform public.seed_default_access_profiles('00000000-0000-0000-0000-000000000000', 'ti');
  end $i$ $sql$,
  '42501',
  null,
  'anon não semeia perfil de acesso em empresa nenhuma'
);
reset role;

select throws_ok(
  $sql$do $i$ begin set local role authenticated;
    perform public.seed_default_access_profiles('00000000-0000-0000-0000-000000000000', 'ti');
  end $i$ $sql$,
  '42501',
  null,
  'nem quem está logado — a função não olha o tenant de quem chama, então ninguém a chama de fora'
);
reset role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. A RLS DE `anon` CONTINUA AVALIÁVEL. O degrau que eu quase derrubei.
--
-- Numa policy, a expressão é avaliada com o papel de quem consulta — então o
-- papel precisa de `execute` nas funções que a policy chama. Sem as dezesseis,
-- `anon` lendo `sac_categories` tomaria "permission denied for function
-- get_user_tenant_id", em vez de simplesmente não achar linha.
--
-- ZERO LINHAS É O CERTO AQUI, e a asserção é `lives_ok`, não contagem: `anon`
-- não tem identidade, então a policy não casa com nada. O que se prova é que ele
-- chega até a policy — a diferença entre "não vejo nada" e "estourou".
--
-- `is_allowed_upload_ext` é a que quase escapou da lista: ela é usada numa
-- policy do schema **storage**, não do `public`. Uma varredura de `pg_policies`
-- filtrada por `schemaname = 'public'` a deixava de fora, e revogá-la quebraria
-- o anexo do cliente no SAC.
-- ═══════════════════════════════════════════════════════════════════════════
select lives_ok(
  $sql$do $i$
  declare v int;
  begin
    set local role anon;
    select count(*) into v from public.sac_categories;
    select count(*) into v from public.pops;
    reset role;
  end $i$ $sql$,
  'anon ainda avalia as policies de RLS — ler tabela sem identidade dá zero linha, nunca erro de permissão'
);
reset role;

select * from finish();
rollback;
