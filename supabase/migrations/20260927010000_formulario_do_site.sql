-- Leva CRM-3a: o formulário do site próprio. 2026-09-13 (ADR-006, ADR-009).
--
-- O Helpoint já recebia lead do site (`crm-lead-intake`), mas **o formulário não
-- existia**: a empresa tinha que escrever o HTML e chamar o endereço na mão. Era
-- o que prendia a Minasflor ao Kommo.
--
-- Decisão do dono (2026-09-13): a empresa **monta o formulário campo a campo**,
-- inclusive com os campos personalizados que já existem no cadastro de contato,
-- e o formulário chega ao site de duas maneiras — **página hospedada** pelo
-- Helpoint (`/f/<empresa>/<formulário>`) e **pedaço de código** que encaixa essa
-- mesma página dentro do site dela. Um formulário, duas maneiras de usar.
--
-- Mais de um formulário por empresa é consequência da escolha: um por campanha
-- ou por segmento, cada um com o seu destino, e o negócio guarda de qual veio.

create table public.crm_forms (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  name          text not null,
  -- Entra no endereço público. Minúsculas, números e hífen.
  slug          text not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$'),
  is_active     boolean not null default true,
  -- Onde o lead cai. Nulo = o funil padrão / sem segmento / sem dono fixo.
  pipeline_id   uuid references public.crm_pipelines(id) on delete set null,
  segment_id    uuid references public.crm_segments(id) on delete set null,
  owner_id      uuid,
  -- O que o visitante vê: título, texto de apoio, botão e o que aparece depois.
  headline      text,
  subhead       text,
  submit_label  text not null default 'Enviar',
  success_message text not null default 'Recebemos sua mensagem. Em breve entramos em contato.',
  redirect_url  text,
  /*
   * Os campos, em ordem. Cada um:
   *   { key, label, type, required, placeholder?, options?, custom_field_id? }
   * `key` é um dos embutidos (name, email, phone, company, message) ou
   * `custom:<id>` para um campo personalizado do contato.
   */
  fields        jsonb not null default '[]'::jsonb,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);
create trigger crm_forms_updated_at before update on public.crm_forms
  for each row execute function public.handle_updated_at();
create trigger crm_forms_tenant_id before insert on public.crm_forms
  for each row execute function public.inject_tenant_id();

alter table public.crm_forms enable row level security;

-- Quem tem o CRM lê; gerente para cima edita. Mesmo teto dos funis.
create policy "CRM lê formulários" on public.crm_forms
  for select using (tenant_id = public.get_user_tenant_id() and public.has_crm_access(auth.uid()));
create policy "Gerente edita formulários" on public.crm_forms
  for all using (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_manager_or_higher(auth.uid()));

-- De qual formulário veio o negócio. Chave composta: formulário de uma empresa
-- não entra em negócio de outra.
alter table public.crm_forms add constraint crm_forms_id_tenant_key unique (id, tenant_id);
alter table public.crm_deals
  add column form_id uuid,
  add constraint crm_deals_form_id_tenant_id_fkey
    foreign key (form_id, tenant_id) references public.crm_forms(id, tenant_id) on delete set null;

/*
 * A página pública lê por aqui, sem login e sem enxergar a tabela: devolve só o
 * que o visitante precisa ver. Nada de `owner_id`, `pipeline_id` ou `segment_id`
 * — quem recebe o lead é assunto interno da empresa.
 */
create or replace function public.crm_form_publico(p_tenant_slug text, p_form_slug text)
returns table (
  form_id uuid, tenant_id uuid, name text, headline text, subhead text,
  submit_label text, success_message text, redirect_url text, fields jsonb,
  empresa text, logo_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select f.id, f.tenant_id, f.name, f.headline, f.subhead,
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
