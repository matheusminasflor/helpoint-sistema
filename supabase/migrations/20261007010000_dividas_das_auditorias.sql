-- As dívidas que as auditorias deixaram apontadas. 2026-09-17.
--
-- Nada aqui é funcionalidade nova: é a lista de "aberto" do `nao-funciona.md`,
-- fechada de uma vez.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O fluxo podia escrever gente de outra empresa
-- ───────────────────────────────────────────────────────────────────────────
-- Achado do auditor em 2026-09-10, aberto desde então. O motor de fluxos guarda
-- uuids na configuração do passo — "avisar esta pessoa", "atribuir a esta
-- pessoa", "o dono do negócio é esta pessoa" —, e ninguém conferia se aquela
-- pessoa é da mesma empresa. Só gerente edita fluxo, então o alcance é gerente
-- de uma empresa mirando id de outra: dado cruzado, não vazamento de leitura.
--
-- A resposta não é remendar a função de 16 KB que executa os passos — foi
-- tentar isso que quebrou o CI #54. É a mesma da casa desde o CRM: **chave
-- estrangeira composta**. `(pessoa, tenant_id)` apontando para
-- `profiles (id, tenant_id)` faz o banco recusar, venha a escrita de onde vier
-- — do fluxo, da tela, de um script ou de uma leva futura que ninguém lembrou
-- de conferir.
--
-- `tasks.user_id` já tinha a sua (OKR-2); estas dez são as que faltavam nos
-- destinos que o motor alcança. Conferido antes de aplicar: zero linhas
-- cruzadas hoje, nas dez.
--
-- `on delete` de cada uma é o que já era — o comportamento não muda, só a
-- exigência. `set null (coluna)` nomeia a coluna de propósito: sem isso o
-- Postgres zeraria o `tenant_id` junto, e a linha viraria órfã de empresa.
alter table public.notifications
  drop constraint if exists notifications_user_id_fkey,
  add  constraint notifications_user_id_fkey foreign key (user_id, tenant_id)
       references public.profiles (id, tenant_id) on delete cascade;

alter table public.tickets
  drop constraint if exists tickets_assigned_to_fkey,
  add  constraint tickets_assigned_to_fkey foreign key (assigned_to, tenant_id)
       references public.profiles (id, tenant_id),
  drop constraint if exists tickets_requester_id_fkey,
  add  constraint tickets_requester_id_fkey foreign key (requester_id, tenant_id)
       references public.profiles (id, tenant_id),
  drop constraint if exists tickets_created_by_fkey,
  add  constraint tickets_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id);

alter table public.crm_deals
  drop constraint if exists crm_deals_owner_id_fkey,
  add  constraint crm_deals_owner_id_fkey foreign key (owner_id, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (owner_id),
  drop constraint if exists crm_deals_created_by_fkey,
  add  constraint crm_deals_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id);

alter table public.crm_contacts
  drop constraint if exists crm_contacts_owner_id_fkey,
  add  constraint crm_contacts_owner_id_fkey foreign key (owner_id, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (owner_id),
  drop constraint if exists crm_contacts_created_by_fkey,
  add  constraint crm_contacts_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id);

alter table public.crm_deal_activities
  drop constraint if exists crm_deal_activities_author_id_fkey,
  add  constraint crm_deal_activities_author_id_fkey foreign key (author_id, tenant_id)
       references public.profiles (id, tenant_id);

alter table public.crm_orders
  drop constraint if exists crm_orders_created_by_fkey,
  add  constraint crm_orders_created_by_fkey foreign key (created_by, tenant_id)
       references public.profiles (id, tenant_id) on delete set null (created_by);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O Marketing não conseguia criar fornecedor nem item de inventário
-- ───────────────────────────────────────────────────────────────────────────
-- Registrado desde 2026-09-04 e nunca fechado: seis tabelas do Marketing têm
-- `tenant_id NOT NULL` sem default e sem trigger de injeção, e nenhum hook
-- manda a coluna. `mkt_social_accounts` foi fechada na CRM-4c, quando o Lead
-- Ads tropeçou nela. Estas quatro têm tela viva e falham no INSERT do mesmo
-- jeito — *criar fornecedor* e *criar item de inventário do Marketing* nunca
-- funcionaram.
create trigger inject_tenant_id_mkt_suppliers before insert on public.mkt_suppliers
  for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_mkt_quotations before insert on public.mkt_quotations
  for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_mkt_ai_generations before insert on public.mkt_ai_generations
  for each row execute function public.inject_tenant_id();
create trigger inject_tenant_id_mkt_assets before insert on public.mkt_assets
  for each row execute function public.inject_tenant_id();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A comparação do segredo do webhook
-- ───────────────────────────────────────────────────────────────────────────
-- O auditor apontou que ela não é de tempo constante. Vale registrar o tamanho
-- real: o que se compara são **hashes**, não segredos — descobrir que os três
-- primeiros caracteres de um SHA-256 batem não aproxima ninguém do segredo que
-- o gerou, porque para explorar isso seria preciso escolher a entrada que
-- produz um hash com prefixo dado, que é um ataque de pré-imagem.
--
-- Fecho assim mesmo, porque custa uma função de quatro linhas e tira o assunto
-- da lista para sempre. `bool_and` sobre a string inteira não sai cedo.
create or replace function public.hash_igual(a text, b text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(length(a), -1) = coalesce(length(b), -2)
     and coalesce(bool_and(substr(a, i, 1) = substr(b, i, 1)), true)
    from generate_series(1, coalesce(length(a), 0)) as i;
$$;

create or replace function public.automation_webhook_fire(p_workflow uuid, p_secret text, p_body jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w     public.automation_workflows;
  v_run uuid;
begin
  select * into w from public.automation_workflows where id = p_workflow;
  if w.id is null or w.trigger->>'kind' <> 'webhook' or w.status <> 'active' then
    raise exception 'fluxo não encontrado' using errcode = 'P0002';
  end if;
  if coalesce(w.trigger->>'secret_hash', '') = '' or p_secret is null
     or not public.hash_igual(
          encode(extensions.digest(p_secret, 'sha256'), 'hex'),
          w.trigger->>'secret_hash') then
    raise exception 'segredo inválido' using errcode = 'P0003';
  end if;
  if (select count(*) from public.automation_runs where workflow_id = w.id and trigger_kind = 'webhook' and created_at > now() - interval '1 minute') >= 60 then
    raise exception 'limite de 60 disparos por minuto' using errcode = 'P0004';
  end if;
  v_run := public.automation_start_run(w, 'webhook', null, null,
             jsonb_build_object('trigger', jsonb_build_object('kind', 'webhook', 'body', coalesce(p_body, '{}'::jsonb), 'at', now())));
  perform public.automation_advance(v_run);
  return v_run;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. TRUNCATE passa por cima de RLS
-- ───────────────────────────────────────────────────────────────────────────
-- Achado na auditoria da CRM-4c e fechado só nas duas tabelas daquela leva. O
-- privilégio vem do padrão da Supabase e está em **toda** tabela do schema:
-- `anon` e `authenticated` podem esvaziar qualquer uma, e TRUNCATE não passa
-- por policy nenhuma. Hoje não há caminho (o PostgREST não o expõe), e é por
-- isso que ninguém tropeçou — mas privilégio que não se usa não tem por que
-- existir, e o dia em que o PostgREST mudar não é o dia de descobrir.
revoke truncate on all tables in schema public from anon, authenticated;
-- E as tabelas que ainda vão nascer.
alter default privileges in schema public revoke truncate on tables from anon, authenticated;
