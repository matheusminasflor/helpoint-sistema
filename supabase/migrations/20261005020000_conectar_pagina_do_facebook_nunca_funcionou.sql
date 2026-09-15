-- Conectar uma página do Facebook nunca funcionou. 2026-09-15.
--
-- Achado pela auditoria da CRM-4c, e é anterior a ela: o Lead Ads foi só o
-- primeiro a depender do Marketing e tropeçar. `mkt-meta-oauth` grava com a
-- credencial de quem está logado, e as duas escritas que ele faz são
-- impossíveis desse jeito:
--
--   1. `mkt_social_accounts.tenant_id` é NOT NULL, **sem default e sem trigger
--      de injeção**, e o INSERT nunca manda a coluna → 23502.
--   2. `mkt_social_account_secrets` tem RLS ligada e **nenhuma policy** → 42501.
--
-- Provado contra o banco de teste: as duas escritas levantam erro, e as duas
-- tabelas estão com zero linhas. Parte disto já estava registrado em
-- `docs/nao-funciona.md` (Marketing, `tenant_id` sem trigger em seis tabelas) —
-- o que faltava era a consequência: publicar, receber lead e tudo o mais que
-- depende de uma conta conectada nunca saiu do lugar.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 1. O `tenant_id` da conta, como no resto da casa
-- ───────────────────────────────────────────────────────────────────────────
-- O trigger preenche quando quem escreve está logado e **recusa** quando a
-- linha é de outra empresa. Com a chave de serviço (a edge function) o
-- `tenant_id` vem explícito e passa, que é o mesmo desenho de todas as outras.
drop trigger if exists inject_tenant_id_mkt_social_accounts on public.mkt_social_accounts;
create trigger inject_tenant_id_mkt_social_accounts
  before insert on public.mkt_social_accounts
  for each row execute function public.inject_tenant_id();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A página não se declara: ela se conecta
-- ───────────────────────────────────────────────────────────────────────────
-- As quatro policies de `mkt_social_accounts` só perguntam o tenant e o cargo.
-- `page_id` é texto livre, e o id de uma página é público — então um gestor de
-- qualquer empresa inseria uma linha reivindicando a página de outra. Como é o
-- `page_id` que diz de quem é um lead de anúncio (CRM-4c), quem chegasse
-- primeiro ficava com os leads da página alheia.
--
-- Quem tem o direito de dizer "esta página é desta empresa" é a Meta, pelo
-- OAuth — e quem fala com a Meta é a edge function, com a chave de serviço.
-- Então `page_id` deixa de ser escrevível por quem está logado. O resto da
-- linha (nome, ativo/inativo) continua sendo, que é o que as telas editam.
create or replace function public.mkt_pagina_so_pelo_oauth()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- `auth.uid()` nulo é a chave de serviço: a edge function, depois de a Meta
  -- ter confirmado que a pessoa administra a página.
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' and new.page_id is not null then
    raise exception 'a página se conecta pelo Facebook, não se cadastra à mão'
      using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.page_id is distinct from old.page_id then
    raise exception 'a página se conecta pelo Facebook, não se digita'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
-- `drop ... if exists` antes de cada `create trigger`, como nas 23 irmãs deste
-- diretório: a migration precisa poder rodar contra um banco que já a tem.
-- Escrita sem isso, ela passa no CI (que monta do zero) e reprova o `db push`
-- com `42710` — e o push aborta antes de tudo o que vem depois dela.
drop trigger if exists trg_mkt_pagina_so_pelo_oauth on public.mkt_social_accounts;
create trigger trg_mkt_pagina_so_pelo_oauth
  before insert or update of page_id on public.mkt_social_accounts
  for each row execute function public.mkt_pagina_so_pelo_oauth();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O cofre das credenciais fechado de verdade
-- ───────────────────────────────────────────────────────────────────────────
-- A RLS sem policy já negava tudo, mas o privilégio continuava concedido a
-- `anon` e `authenticated` — inclusive TRUNCATE, que passa por cima de RLS. Uma
-- policy permissiva acrescentada por engano numa leva futura abriria a porta
-- que o comentário da migration anterior afirmava não existir. Agora o
-- privilégio não existe, como em `tenant_lead_ads_connections` e
-- `tenant_whatsapp_connections`.
revoke all on public.mkt_social_account_secrets from anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. "A página instalou o aplicativo" é um fato, não um indício
-- ───────────────────────────────────────────────────────────────────────────
-- A tela dizia "instalada" quando a credencial da página existia. Mas ela é
-- guardada antes da chamada que instala, e essa chamada pode falhar (falta de
-- `pages_manage_metadata`, por exemplo): a conta ficava com credencial, sem
-- inscrição, e a tela ficava muda — exatamente o silêncio que o aviso existe
-- para quebrar. O carimbo abaixo é posto **depois** de a Meta confirmar.
alter table public.mkt_social_accounts
  add column if not exists leads_subscribed_at timestamptz;

comment on column public.mkt_social_accounts.leads_subscribed_at is
  'Quando a Meta confirmou que esta página instalou o aplicativo do Helpoint e passa a mandar os leads de anúncio (CRM-4c). Nulo = a página está conectada mas não manda lead.';
