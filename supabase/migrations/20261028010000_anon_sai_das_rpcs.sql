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
-- também — 28 funções dependiam só disso. Então cada função não-gatilho **que
-- `authenticated` JÁ ALCANÇAVA** ganha `grant execute` explícito antes do
-- revoke: ninguém ganha acesso novo, só se escreve o que já valia.
--
-- ══ O ERRO QUE EU COMETI AQUI, E QUE O CI #111 PEGOU ════════════════════════
--
-- A primeira versão deste laço concedia a `authenticated` **sem testar se ela já
-- podia**. "Preservar" virou "conceder", e com isso eu REABRI 26 funções que
-- migrations anteriores tinham fechado a dedo, cada uma por causa de uma
-- auditoria: o motor de automação inteiro, `notify_users`, `crm_whatsapp_receber`,
-- `exp_pick_lot`, `tenant_set_config`, as sementes.
--
-- O CI pegou DUAS, porque só duas tinham asserção de pgTAP:
--
--   automacoes_modelos.test.sql            → `automation_subject_row`
--     "a leitura de registro do motor nao se chama por RPC (auditoria: definer
--      aberta lia contato de outra empresa)"
--   crm_segmentos_tabelas_portoes.test.sql → `crm_gate_label`
--     "o rotulo do portao nao se le por chamada direta (so o trigger)"
--
-- As outras 24 teriam passado em silêncio. E pior: eu **medi o banco depois de
-- aplicar a versão errada** e escrevi a medição como se fosse um achado — a
-- primeira redação da issue 05 listava 22 funções "abertas para quem está
-- logado" que na verdade eu mesmo tinha acabado de abrir. Medir depois de mexer
-- não é medir; é olhar no espelho.
--
-- Daí as duas coisas que esta migration passou a fazer:
--
-- 1. **reafirma as 26 fechaduras** antes de qualquer outra coisa (bloco 1).
--    Num banco do zero é no-op — elas já estão fechadas quando esta migration
--    roda. Num banco onde a versão errada passou, é o reparo. A lista está aqui
--    porque estava espalhada por quinze migrations, e lista espalhada é lista que
--    a próxima varredura não encontra;
-- 2. **só concede a `authenticated` o que `authenticated` já alcançava**
--    (`if has_function_privilege(...)`), avaliado antes do revoke de PUBLIC
--    daquela mesma função.
--
-- `scripts/funcoes-so-por-dentro.mjs` extrai a lista do bloco 1 das migrations,
-- para ela ser LIDA do repositório em vez de lembrada. E a asserção 8 da suíte
-- prende as 26: a próxima vez que alguém as reabrir, o pgTAP acusa antes do CI.
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
  -- AS 26 FECHADURAS DELIBERADAS, reunidas de quinze migrations anteriores
  -- (`scripts/funcoes-so-por-dentro.mjs` as extrai do repositório). Cada uma
  -- nasceu de uma auditoria: são funções `security definer` que só devem ser
  -- chamadas de DENTRO de outra função, de gatilho, ou pelo `service_role`.
  -- Aqui por ASSINATURA, não por nome: `crm_modelo_bloqueado_ate` tem duas
  -- sobrecargas e só a de dois argumentos é fechada — a de um argumento é a que
  -- `useWhatsApp.ts:166` chama.
  v_fechaduras text[] := array[
    'public.automation_advance(uuid)',
    'public.automation_claim_external(integer)',
    'public.automation_complete_external(uuid, text, jsonb, text)',
    'public.automation_enqueue(uuid, text, text, text, jsonb, uuid)',
    'public.automation_enrich_payload(text, jsonb)',
    'public.automation_mark_skipped(jsonb, jsonb, jsonb, jsonb)',
    'public.automation_render_config(jsonb, jsonb)',
    'public.automation_run_step(public.automation_runs, jsonb)',
    'public.automation_start_run(public.automation_workflows, text, text, uuid, jsonb)',
    'public.automation_subject_row(text, uuid)',
    'public.automation_tick()',
    'public.automation_ticket_do_passo(public.automation_runs, public.automation_workflows, jsonb, text, text, text, public.ticket_priority, uuid, uuid, uuid, date)',
    'public.automation_webhook_fire(uuid, text, jsonb)',
    'public.com_semear_faixas_cashback(uuid)',
    'public.crm_gate_label(text, uuid)',
    'public.crm_modelo_bloqueado_ate(uuid, uuid)',
    'public.crm_seed_pipeline_stages(uuid, uuid)',
    'public.crm_whatsapp_receber(text, text, text, text, text, text, text)',
    'public.exp_pick_lot(uuid, uuid, numeric)',
    'public.get_auth_user_status(text)',
    'public.notification_team(uuid, text)',
    'public.notify_users(uuid, uuid[], public.notification_type, text, uuid, text, text, uuid)',
    'public.seed_categorias_comercial_educacional(uuid)',
    'public.seed_crm_stages(uuid)',
    'public.seed_default_financeiro_categories()',
    'public.tenant_set_config(text, text, jsonb)',
    -- ── As TRÊS que a lista original esqueceu ──────────────────────────────
    -- Achadas ao remedir depois do reparo, e cada uma é irmã de outra que já
    -- estava fechada. Nenhuma tem chamador no `src/` (só no `types.ts` gerado):
    --
    -- `automation_tick_deal_idle()` varre `automation_workflows` de TODAS as
    -- empresas, sem filtro de tenant, e dispara execução de fluxo. A irmã dela,
    -- `automation_tick()`, foi fechada na 20260912010000; esta ficou de fora. Só
    -- o cron `deal-idle-hourly` a chama, e o cron roda como `postgres`;
    'public.automation_tick_deal_idle()',
    -- `rh_calc_inss`/`rh_calc_irpf` recebem `_tenant` e `_company` e leem a
    -- tabela de imposto daquela empresa. Quem as usa é `rh_generate_payroll`,
    -- que é `security definer` e confere identidade — então o caminho de dentro
    -- não depende deste grant.
    'public.rh_calc_inss(numeric, uuid, uuid)',
    'public.rh_calc_irpf(numeric, uuid, uuid)'
  ];
  r record;
  a text;
  v_fechadas int := 0;
  v_faltando text;
begin
  -- ── Bloco 1: reafirma as fechaduras deliberadas ──────────────────────────
  -- Vem ANTES do laço de propósito: com elas fechadas, o
  -- `has_function_privilege` do laço responde `false` e o grant não acontece.
  -- `to_regprocedure` devolve nulo em vez de estourar quando a assinatura não
  -- existe — oito das listas antigas foram apagadas por `drop function` em
  -- migrations posteriores (o motor de automação de setembro), e citar uma
  -- função morta não pode derrubar a migration.
  foreach a in array v_fechaduras loop
    if to_regprocedure(a) is not null then
      execute format('revoke all on function %s from public, anon, authenticated', a);
    end if;
  end loop;

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
    --
    -- O `has_function_privilege` NÃO é enfeite: sem ele, "preservar" vira
    -- "conceder" e as 26 fechaduras do bloco 1 se abrem de novo. Foi o erro que
    -- o CI #111 pegou. E ele é avaliado ANTES do revoke de PUBLIC desta mesma
    -- função, logo abaixo — então o que ele lê é o estado de antes.
    if r.proname = any (v_so_por_dentro) then
      execute format('revoke execute on function %s from authenticated', r.assinatura);
    elsif has_function_privilege('authenticated', r.assinatura::regprocedure, 'execute') then
      execute format('grant execute on function %s to authenticated', r.assinatura);
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
