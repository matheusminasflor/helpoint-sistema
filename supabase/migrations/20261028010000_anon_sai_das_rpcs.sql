-- `anon` sai das RPCs — a porta que estava destrancada
--
-- Leva B do docs/plano-geral.md, primeiro item. A chave `anon` NÃO é segredo:
-- ela vai no bundle do navegador de todo visitante. Tudo o que `anon` pode
-- executar, qualquer pessoa na internet pode executar.
--
-- MEDIDO ANTES DE MEXER (test-helpoint, 2026-09-25): de 246 funções do schema
-- `public`, **185 eram executáveis por `anon`**. Quebrando por natureza:
--
--   78  funções de GATILHO (retornam `trigger`). O PostgREST não as expõe e
--       chamá-las direto dá erro — barulho no catálogo, não porta;
--   16  funções que a própria RLS chama de dentro das policies;
--   91  funções chamáveis de verdade pela API, das quais só CINCO precisam.
--
-- ══ O ACESSO VEM DE DUAS ORIGENS, E EU SÓ CONHECIA UMA ══════════════════════
--
-- Na leva A2 eu concluí que o `execute` do `anon` era um grant DIRETO, posto
-- pelo `alter default privileges` do Supabase, e escrevi isso no commit. Estava
-- certo para a função que eu tinha acabado de criar — e **errado como regra
-- geral**. Aplicar `revoke ... from anon` nas 91 não mudou nada: continuavam
-- 185. O `proacl` explica:
--
--   com_painel_totais  {=X/postgres, postgres=X/postgres, authenticated=X/…, service_role=X/…}
--                       ↑
--                       grantee VAZIO = PUBLIC
--
-- Em Postgres, função nasce com `execute` para **PUBLIC** — e `anon` é público.
-- As 167 funções não-gatilho deste schema têm essa entrada. Ou seja, havia DOIS
-- caminhos: o `=X` de PUBLIC (o padrão do Postgres, em todas) e, nas mais novas,
-- também um `anon=X` direto (o `alter default privileges` do Supabase). Fechar
-- um sem o outro não fecha nada. Esta migration fecha os dois, e é por isso que
-- ela revoga de `public` **e** de `anon`.
--
-- ══ AS TRÊS QUE ERAM BURACO DE VERDADE ══════════════════════════════════════
--
-- A maioria das 91 é inofensiva na prática: elas filtram por
-- `get_user_tenant_id()`, que lê `auth.uid()`, que é nulo para `anon` — sem
-- identidade, nenhuma linha casa. Mas TRÊS são `security definer` (ignoram a
-- RLS), ESCREVEM, e **nunca perguntam quem está chamando**. Recebem só um id:
--
--   • `seed_default_access_profiles(p_tenant_id, p_department)` — grava perfis
--     de acesso em QUALQUER empresa. A pior das três: quem passar o `tenant_id`
--     de outra empresa injeta perfil de acesso lá dentro;
--   • `create_ticket_checklists_for_ticket(_ticket_id)` — cria checklist em
--     qualquer chamado de qualquer empresa;
--   • `sync_ticket_checklist_status(_ticket_checklist_id)` — vira o status de um
--     checklist para `completed`. Silencioso e pior do que parece: existe
--     `enforce_ticket_checklist_before_closing`, que impede fechar chamado com
--     checklist pendente. Marcar o checklist como concluído por fora derruba
--     essa trava sem deixar rastro.
--
-- As três saem de `anon` **e de `authenticated`**, porque um usuário logado de
-- outra empresa faz o mesmo estrago: nenhuma delas olha o tenant de quem chama.
-- Conferido antes: as três só são chamadas de dentro de funções de gatilho
-- `security definer` (`handle_new_ticket_checklists`,
-- `after_ticket_checklist_item_change`, `seed_default_categories_novos_modulos`,
-- e uma pela outra), e ali a chamada roda com os poderes do dono da função —
-- revogar do papel do usuário não corta o caminho interno. Nenhuma tela as
-- chama: varri `src/` inteiro, elas só aparecem no `types.ts` gerado.
--
-- `seed_default_access_profiles` tinha até um `grant execute ... to
-- authenticated` ESCRITO à mão, na migration 20260626210224. Era grant órfão:
-- nada no front nunca a chamou.
--
-- ══ AS VINTE E UMA QUE FICAM ABERTAS PARA `anon`, E POR QUÊ ═════════════════
--
-- CINCO são portas públicas de verdade — rota aberta sem login, ou edge function
-- que chama com a chave anon. Conferi uma por uma no código, não pelo nome:
--
--   • `crm_form_publico`        → rota `/f/:slug/:form` (formulário do site);
--   • `crm_public_proposal`     → rota `/proposta/:token`;
--   • `get_invite_public`       → rota `/convite/:id` (aceitar convite);
--   • `get_sac_tenant_branding` → portal do SAC, antes de qualquer login;
--   • `get_tenant_by_hostname`  → a edge function `tenant-resolve-host` a chama
--     com `SUPABASE_ANON_KEY` (linha 23 dela). Esta eu só descobri lendo a
--     função: pelo nome, parecia interna.
--
-- DEZESSEIS são chamadas de DENTRO das policies de RLS, e é por isso que ficam.
-- Numa policy, a expressão é avaliada com o papel de quem faz a consulta — então
-- se `anon` perde o `execute` de `get_user_tenant_id`, toda leitura de `anon`
-- numa tabela cuja policy a chama passa a dar "permission denied for function",
-- em vez de simplesmente não achar linha. As páginas públicas do SAC leem tabela
-- direto (`sac_categories`, `sac_products`, `pops`, `customer_profiles`…), então
-- isso quebraria o portal do cliente na hora.
--
-- `is_allowed_upload_ext` está entre elas e quase escapou: ela é usada numa
-- policy do schema **storage**, não do `public`. Filtrar `pg_policies` por
-- `schemaname = 'public'` a deixava de fora da lista de protegidas — e revogá-la
-- quebraria o anexo do cliente no SAC. Por isso a conferência varre as policies
-- de TODOS os schemas.
--
-- O QUE CONTINUA ABERTO, e é decisão consciente: as dezesseis respondem coisas
-- como `is_admin_or_higher(<uuid>)` para quem tiver um uuid em mãos. É vazamento
-- de sim/não sobre um id que a pessoa já precisa conhecer, e é o preço de a RLS
-- deste sistema ser escrita em função. Não dá para fechar sem reescrever as
-- policies; fica anotado em docs/nao-funciona.md.
--
-- ══ O QUE ESTA MIGRATION NÃO MUDA, DE PROPÓSITO ═════════════════════════════
--
-- `authenticated` continua com exatamente o que tinha, tirando as três de cima.
-- Como o acesso vinha de PUBLIC, revogar PUBLIC tiraria de `authenticated`
-- também — 28 funções dependiam só disso. Então cada função não-gatilho ganha
-- `grant execute to authenticated` explícito antes do revoke: **ninguém ganha
-- acesso novo**, só se escreve o que já valia. Das 28, só `crm_modelo_bloqueado_ate`
-- é chamada pelo front (`useWhatsApp.ts:166`); as outras 27 são maquinário
-- interno, chamado por edge function com `service_role` ou de dentro de gatilho.
--
-- **Fica em aberto, e é pergunta para o dono:** `authenticated` alcança esse
-- maquinário interno — `tenant_set_config`, `notify_users`, `automation_enqueue`,
-- `automation_start_run`, `crm_whatsapp_receber`, `exp_pick_lot`. Um usuário
-- logado comum consegue chamá-las. Fechar isso é outra leva, com outra medição,
-- porque preciso confirmar que o worker de automação não roda com JWT de usuário
-- em nenhum caminho. Está registrado em docs/nao-funciona.md e no plano.
--
-- ══ A GUARDA ════════════════════════════════════════════════════════════════
--
-- Este revoke não se sustenta sozinho: função nova nasce com `execute` para
-- PUBLIC outra vez, pelo padrão do Postgres. Quem segura é
-- `supabase/tests/database/anon_so_nas_portas_publicas.test.sql`, que compara a
-- lista de funções abertas para `anon` com a lista de exceções escrita AQUI. Sem
-- essa guarda, esta migration seria uma limpeza que dura até a próxima leva.

do $$
declare
  -- As cinco portas públicas. Mexer aqui é decisão, não manutenção: cada nome
  -- desta lista é uma função que qualquer pessoa na internet pode executar.
  v_publicas text[] := array[
    'crm_form_publico',
    'crm_public_proposal',
    'get_invite_public',
    'get_sac_tenant_branding',
    'get_tenant_by_hostname'
  ];
  -- As dezesseis que a RLS chama de dentro das policies. Não é escolha de
  -- segurança: é requisito de funcionamento (ver o cabeçalho).
  v_da_rls text[] := array[
    'get_customer_tenant_id', 'get_user_tenant_id',
    'has_comercial_access', 'has_diretoria_access', 'has_educacional_access',
    'has_fin_access', 'has_rh_access', 'has_role',
    'is_admin_or_higher', 'is_allowed_upload_ext', 'is_diretor',
    'is_manager_or_higher', 'is_member_or_higher_role', 'is_qualidade_tech',
    'is_supervisor_or_higher', 'tem_permissao'
  ];
  v_abertas_para_anon text[] := v_publicas || v_da_rls;
  -- As três que escrevem sem perguntar quem chama: fora de `anon` e de
  -- `authenticated`. Só o caminho de dentro (gatilho `security definer`) segue.
  v_so_por_dentro text[] := array[
    'seed_default_access_profiles',
    'create_ticket_checklists_for_ticket',
    'sync_ticket_checklist_status'
  ];
  r record;
  v_fechadas int := 0;
  v_faltando text;
begin
  -- Um nome errado numa das listas acima passaria em silêncio e fecharia uma
  -- função que devia ficar aberta — a quebra apareceria semanas depois, na tela
  -- de alguém. Então confere primeiro: toda exceção tem de existir no banco.
  select string_agg(nome, ', ') into v_faltando
  from unnest(v_abertas_para_anon || v_so_por_dentro) as nome
  where not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = nome
  );
  if v_faltando is not null then
    raise exception 'Funções citadas na lista de exceções que não existem: %', v_faltando;
  end if;

  for r in
    select p.oid::regprocedure as assinatura, p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      -- Gatilho não é porta: o PostgREST não expõe função que devolve `trigger`,
      -- e chamá-la direto dá erro. Ficam de fora para o revoke dizer o que
      -- importa — e para o teste-guarda poder contar uma lista pequena.
      and pg_get_function_result(p.oid) <> 'trigger'
  loop
    -- Primeiro preserva `authenticated`: hoje 28 funções só o alcançam por
    -- PUBLIC, e o revoke abaixo tiraria delas junto. Explicitar antes é o que
    -- garante que esta migration NÃO mexe em quem já podia.
    if not (r.proname = any (v_so_por_dentro)) then
      execute format('grant execute on function %s to authenticated', r.assinatura);
    else
      execute format('revoke execute on function %s from authenticated', r.assinatura);
    end if;

    -- Os dois caminhos do `anon`, nesta ordem: o `=X` de PUBLIC (padrão do
    -- Postgres) e o `anon=X` direto (alter default privileges do Supabase).
    execute format('revoke execute on function %s from public', r.assinatura);
    execute format('revoke execute on function %s from anon', r.assinatura);

    if r.proname = any (v_abertas_para_anon) then
      -- Devolve para `anon` só as vinte e uma, e agora de forma EXPLÍCITA:
      -- depois desta migration, `anon` executar algo do schema `public` é sempre
      -- um grant escrito, nunca herança de PUBLIC.
      execute format('grant execute on function %s to anon', r.assinatura);
    else
      v_fechadas := v_fechadas + 1;
    end if;
  end loop;

  raise notice 'anon fechado em % função(ões); % seguem abertas por decisão.',
    v_fechadas, cardinality(v_abertas_para_anon);
end;
$$;
