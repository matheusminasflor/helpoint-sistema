-- "Este uuid é admin?" era pergunta que qualquer um fazia sobre qualquer um
--
-- Leva B, resto (2026-09-26). Decisão do dono: **fechar entre empresas**.
--
-- ══ O QUE ESTAVA ABERTO, MEDIDO ANTES DE MEXER ══════════════════════════════
--
-- `is_admin`, `has_role`, `get_user_role`, `tem_permissao` e companhia recebem um
-- uuid e respondem sobre ele. Provado no banco com dois tenants e um `member`:
--
--   is_admin(chefe da MINHA empresa)          true
--   is_admin(chefe de OUTRA empresa)          true   ← o vazamento
--   has_role(chefe de outra, 'owner')         true
--   get_user_role(chefe de outra)             'owner'
--   profiles de outra empresa que ele vê      0      ← e é o que o limita
--
-- Duas medições mudaram o tamanho do problema em relação ao que o registro dizia:
--
-- 1. **Dentro da empresa não é vazamento.** O mesmo `member` lê `user_roles` da
--    própria empresa direto da tabela — o cargo do chefe está lá. A função não
--    conta nada que a tabela já não conte, e o dono confirmou em 2026-09-26 que
--    é assim que ele quer (quem pede aprovação precisa saber a quem pedir). Uma
--    função mais fechada que a tabela seria teatro.
--
-- 2. **Não é "leva de arquitetura"**, como o plano temia. Contados os usos:
--    **344 dos 344** em policy chamam com `auth.uid()`. Ninguém neste sistema
--    pergunta sobre terceiro, exceto:
--      - sete edge functions que usam a **chave de serviço** e perguntam
--        `is_admin_or_higher(userId)` para decidir quem mexe em credencial
--        (ai-credentials, bling-oauth, facebook-leads-config, nfe-focus,
--        payment-credentials, shipping-label, whatsapp-credentials);
--      - oito funções `has_*_access` que repassam **o mesmo** `_user_id` para
--        `is_supervisor_or_higher`.
--    Então não é reescrever policy: é um guarda dentro da família.
--
-- ══ O GUARDA ════════════════════════════════════════════════════════════════
--
-- `pode_responder_sobre(uuid)` responde sim em quatro casos, nesta ordem de
-- raciocínio:
--
--   1. não há pedido HTTP nenhum (gatilho, cron, psql, migration) — é o banco
--      trabalhando, e não existe "quem perguntou";
--   2. a chave de serviço está no pedido — é o sistema, e são as sete edge
--      functions acima;
--   3. a pergunta é sobre quem pergunta — este é o caminho dos 344 usos;
--   4. a pergunta é sobre alguém da **mesma empresa** — pela medição 1.
--
-- Fora disso: **false**. Não erro: `false`. É de propósito — uma policy que
-- chama a função tem de continuar avaliando e devolvendo lista vazia, e não
-- explodir na cara de quem abriu a tela.
--
-- EFEITO COLATERAL QUE VALE DIZER: quem **não está logado** também passa a ouvir
-- `false`, porque não cai em nenhum dos quatro casos. A pergunta fecha para o
-- anônimo sem que eu precise tirar as funções do `anon` — que era o caminho
-- arriscado (sem `execute`, o pedido anônimo trocaria "lista vazia" por ERRO
-- 42501, e as quatro portas públicas de verdade precisariam ser percorridas uma
-- a uma). Nenhum grant muda aqui.
--
-- ══ POR QUE `create or replace`, E NADA DE `drop` ═══════════════════════════
--
-- Regra 14: `drop` + `create` reabriria a função para PUBLIC. Todos os 17 corpos
-- abaixo foram **copiados** de `pg_get_functiondef` no banco, não reescritos de
-- memória — foi reescrever de cabeça que reabriu 26 fechaduras no CI #111. A
-- única diferença em cada um é o guarda.
--
-- O helper é função NOVA, então ele SIM nasce aberto para PUBLIC e leva o
-- revoke. Ele não precisa ser executável por ninguém de fora: as 17 são
-- `security definer`, então a chamada de dentro vale pelo dono.

begin;

create or replace function public.pode_responder_sobre(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    -- 1. Sem pedido HTTP: gatilho, cron, psql. `nullif` porque a string vazia
    --    não é jsonb válido, e `or` no Postgres não garante avaliação curta —
    --    deixar `''::jsonb` no caminho derrubaria a função inteira.
    nullif(current_setting('request.jwt.claims', true), '') is null
    -- 2. A chave de serviço: o sistema.
    or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
    -- 3. Sobre quem pergunta.
    or _user_id = auth.uid()
    -- 4. Sobre alguém da mesma empresa — porque `user_roles` já é legível por
    --    quem é da empresa, e a função não pode ser mais fechada que a tabela.
    or exists (
         select 1
           from public.profiles eu
           join public.profiles alvo on alvo.tenant_id = eu.tenant_id
          where eu.id = auth.uid() and alvo.id = _user_id
       ),
    false
  );
$$;

comment on function public.pode_responder_sobre(uuid) is
  'Guarda da família is_admin/has_role/tem_permissao: a pergunta só é respondida '
  'sobre quem pergunta, sobre alguém da mesma empresa, ou quando quem chama é o '
  'sistema (chave de serviço, gatilho, cron). Leva B, 2026-09-26.';

revoke all on function public.pode_responder_sobre(uuid) from public, anon, authenticated;

-- ── Os cargos ───────────────────────────────────────────────────────────────

create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$function$;

create or replace function public.is_admin_or_higher(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$function$;

create or replace function public.is_diretor(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin')
  )
$function$;

create or replace function public.is_manager_or_higher(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin', 'manager')
  )
$function$;

create or replace function public.is_supervisor_or_higher(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('owner', 'admin', 'manager')
  )
$function$;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$function$;

-- Devolve NULO quando a pergunta não é para responder, porque o retorno é o
-- cargo e não um sim/não. Nulo se comporta como "não sei" em toda policy que a
-- usa, que é a resposta honesta.
create or replace function public.get_user_role(_user_id uuid)
returns app_role language sql stable security definer set search_path to 'public'
as $function$
  SELECT CASE WHEN public.pode_responder_sobre(_user_id) THEN (
    SELECT role FROM public.user_roles
    WHERE user_id = _user_id
    ORDER BY CASE role
      WHEN 'owner' THEN 1
      WHEN 'admin' THEN 2
      WHEN 'manager' THEN 3
      WHEN 'member' THEN 4
      WHEN 'viewer' THEN 5
    END
    LIMIT 1
  ) END
$function$;

-- ── Os módulos ──────────────────────────────────────────────────────────────
-- O guarda vai no `or` inteiro, e não só no `exists`: sem isso
-- `is_supervisor_or_higher` (já guardado) devolveria false e o `exists` nu
-- continuaria respondendo sobre gente de fora.

create or replace function public.has_fin_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND (
    EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = _user_id AND module = 'financeiro'
    ) OR public.is_supervisor_or_higher(_user_id)
  )
$function$;

create or replace function public.has_rh_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND (
    EXISTS (
      SELECT 1 FROM public.user_module_access
      WHERE user_id = _user_id AND module = 'rh'
    ) OR public.is_supervisor_or_higher(_user_id)
  )
$function$;

create or replace function public.has_comercial_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and (
    exists (
      select 1 from public.user_module_access
      where user_id = _user_id and module = 'comercial'
    ) or public.is_supervisor_or_higher(_user_id)
  )
$function$;

create or replace function public.has_diretoria_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and (
    exists (
      select 1 from public.user_module_access
      where user_id = _user_id and module = 'diretoria'
    ) or public.is_supervisor_or_higher(_user_id)
  )
$function$;

create or replace function public.has_crm_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and (
    exists (
      select 1 from public.user_module_access
      where user_id = _user_id and module = 'crm'
    ) or public.is_supervisor_or_higher(_user_id)
  );
$function$;

create or replace function public.has_educacional_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and (
    exists (
      select 1 from public.user_module_access
      where user_id = _user_id and module = 'educacional'
    ) or public.is_supervisor_or_higher(_user_id)
  );
$function$;

create or replace function public.has_expedicao_access(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and (
    exists (select 1 from public.user_module_access where user_id = _user_id and module = 'expedicao')
    or public.is_supervisor_or_higher(_user_id)
  );
$function$;

create or replace function public.is_qualidade_tech(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND (
    EXISTS (
      SELECT 1 FROM public.qualidade_user_profiles WHERE user_id = _user_id
    ) OR public.is_supervisor_or_higher(_user_id)
  )
$function$;

-- ── A permissão granular ────────────────────────────────────────────────────

create or replace function public.tem_permissao(_user_id uuid, _departamento text, _modulo text, _acao text)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.pode_responder_sobre(_user_id) and coalesce(
    (
      select (uap.overrides -> _modulo -> _acao)::boolean
      from public.user_access_profiles uap
      where uap.user_id = _user_id and uap.department = _departamento
        and jsonb_typeof(uap.overrides -> _modulo -> _acao) = 'boolean'
    ),
    (
      select (ap.permissions -> _modulo -> _acao)::boolean
      from public.user_access_profiles uap
      join public.access_profiles ap on ap.id = uap.profile_id
      where uap.user_id = _user_id and uap.department = _departamento
        and jsonb_typeof(ap.permissions -> _modulo -> _acao) = 'boolean'
    ),
    false
  );
$function$;

-- `is_customer` NÃO leva o guarda do mesmo jeito: cliente do SAC não tem linha
-- em `profiles` (tem em `customer_profiles`), então o caso 4 nunca valeria para
-- ele e o caso 3 — sobre si mesmo — é o único que a tela usa. Fica com o guarda
-- também, porque o caso 3 basta e fechar é de graça.
create or replace function public.is_customer(_user_id uuid)
returns boolean language sql stable security definer set search_path to 'public'
as $function$
  SELECT public.pode_responder_sobre(_user_id) AND EXISTS (
    SELECT 1 FROM public.customer_profiles
    WHERE user_id = _user_id AND is_blocked = false
  )
$function$;

commit;
