-- CRM-3a, correções da auditoria. 2026-09-13.
--
-- 1. **A tabela do formulário nascia com ALL para anon/authenticated** (padrão
--    deste banco — defeito nº 6 de `docs/nao-funciona.md`). A RLS segurava, mas
--    quem barrava `anon` era, por acidente, o `has_crm_access` não ser
--    executável por ele. REVOKE explícito põe a trava onde ela deve estar.
-- 2. **`owner_id` não tinha chave estrangeira nem amarra de empresa**, e vai
--    direto para `crm_deals.owner_id`: um gerente que soubesse o id de alguém
--    de outra empresa punha negócio da sua na fila dele. Chave composta, como
--    em `crm_deals.form_id`.
-- 3. **`redirect_url` aceitava qualquer texto** e a página faz
--    `window.location.href` com ele. Só `https://`.
-- 4. A função pública devolvia `tenant_id` e `form_id`, que a página não usa.
--    Superfície pública menor, de graça.

-- ── 1. A trava onde ela deve estar ─────────────────────────────────────────
revoke all on public.crm_forms from anon;

-- ── 2. O vendedor do formulário é da própria empresa ───────────────────────
alter table public.profiles add constraint profiles_id_tenant_key unique (id, tenant_id);
alter table public.crm_forms
  add constraint crm_forms_owner_id_tenant_id_fkey
  foreign key (owner_id, tenant_id) references public.profiles(id, tenant_id) on delete set null;

-- ── 3. Para onde a página manda o visitante ────────────────────────────────
-- Vazio é "não leva a lugar nenhum": vira nulo, senão o CHECK recusaria a linha.
update public.crm_forms set redirect_url = null where coalesce(trim(redirect_url), '') = '';
alter table public.crm_forms
  add constraint crm_forms_redirect_url_check
  check (redirect_url is null or redirect_url ~* '^https://');

-- ── 4. A página pública vê só o que precisa ────────────────────────────────
drop function if exists public.crm_form_publico(text, text);

create or replace function public.crm_form_publico(p_tenant_slug text, p_form_slug text)
returns table (
  name text, headline text, subhead text,
  submit_label text, success_message text, redirect_url text, fields jsonb,
  empresa text, logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.name, f.headline, f.subhead,
         f.submit_label, f.success_message, f.redirect_url, f.fields,
         t.name, t.logo_url
    from public.crm_forms f
    join public.tenants t on t.id = f.tenant_id
   where t.slug = p_tenant_slug
     and f.slug = p_form_slug
     and f.is_active;
$$;
revoke execute on function public.crm_form_publico(text, text) from public;
grant execute on function public.crm_form_publico(text, text) to anon, authenticated;
