-- Leva E3 (ADR-007): importação de planilha — contatos e negócios — com
-- desfazer. 2026-09-11.
--
-- Referência de produto: o assistente de importação do Twenty (6 passos,
-- casamento de colunas, validação em grade, lotes de 200, teto de 10 000,
-- dedupe pelas chaves únicas). A tela é do front; aqui fica o que é regra:
--
--   crm_imports                       a memória de cada importação (contadores, erros, desfeita ou não)
--   crm_contacts/crm_deals.import_id  de qual importação a linha nasceu (é o que o "desfazer" lê)
--   source 'importacao'               origem nova em contato e negócio
--   crm_find_or_create_contact()      A regra de reaproveitar contato: e-mail, senão telefone, senão cria.
--                                     Antes vivia em TypeScript no crm-lead-intake; agora é uma só,
--                                     usada pelo site (edge function) e pela planilha.
--   crm_import_rows(import, rows)     grava um lote: contato (reaproveitado ou novo) + negócio na etapa
--                                     dita; erro por linha não derruba o lote
--   crm_undo_import(import)           apaga os negócios do import e os contatos que ele criou e que
--                                     não ganharam outro negócio; só o último import da empresa
--
-- Contato e lote são security invoker: o RLS do vendedor vale dentro da RPC. A
-- edge function chama a função de contato com service role, como já fazia com
-- as tabelas. Só o desfazer é definer (ver lá o porquê).

alter table public.crm_contacts drop constraint crm_contacts_source_check;
alter table public.crm_contacts add constraint crm_contacts_source_check
  check (source in ('manual', 'site', 'whatsapp', 'indicacao', 'importacao', 'outro'));
alter table public.crm_deals drop constraint crm_deals_source_check;
alter table public.crm_deals add constraint crm_deals_source_check
  check (source in ('manual', 'site', 'whatsapp', 'indicacao', 'importacao', 'outro'));

-- ───────────────────────────────────────────────────────────────────────────
-- A importação
-- ───────────────────────────────────────────────────────────────────────────
create table public.crm_imports (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  file_name        text not null default '',
  pipeline_id      uuid references public.crm_pipelines(id) on delete set null,
  status           text not null default 'running' check (status in ('running', 'done', 'undone')),
  rows_total       integer not null default 0,
  contacts_created integer not null default 0,
  contacts_reused  integer not null default 0,
  deals_created    integer not null default 0,
  errors           jsonb not null default '[]'::jsonb check (jsonb_typeof(errors) = 'array'),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index crm_imports_tenant_idx on public.crm_imports (tenant_id, created_at desc);

create trigger inject_tenant_id_crm_imports before insert on public.crm_imports for each row execute function public.inject_tenant_id();

alter table public.crm_imports enable row level security;
create policy "Comercial reads crm_imports"   on public.crm_imports for select to authenticated using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Comercial inserts crm_imports" on public.crm_imports for insert to authenticated with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));
create policy "Comercial updates crm_imports" on public.crm_imports for update to authenticated using (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid())) with check (tenant_id = public.get_user_tenant_id() and public.has_comercial_access(auth.uid()));

alter table public.crm_contacts add column import_id uuid references public.crm_imports(id) on delete set null;
alter table public.crm_deals    add column import_id uuid references public.crm_imports(id) on delete set null;
create index crm_contacts_import_idx on public.crm_contacts (import_id) where import_id is not null;
create index crm_deals_import_idx    on public.crm_deals (import_id) where import_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- A regra de contato: e-mail, senão telefone, senão cria
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_find_or_create_contact(
  p_tenant   uuid,
  p_name     text,
  p_email    text default null,
  p_phone    text default null,
  p_company  text default null,
  p_source   text default 'manual',
  p_owner    uuid default null,
  p_extra    jsonb default '{}'::jsonb,   -- {whatsapp, document, city, state, notes, custom} só na criação
  p_import   uuid default null
)
returns table (contact_id uuid, created boolean, owner_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '');
  v_id    uuid;
  v_owner uuid;
begin
  if v_email is not null then
    select c.id, c.owner_id into v_id, v_owner from public.crm_contacts c
     where c.tenant_id = p_tenant and lower(c.email) = v_email
     order by c.created_at limit 1;
  end if;
  if v_id is null and v_phone is not null then
    select c.id, c.owner_id into v_id, v_owner from public.crm_contacts c
     where c.tenant_id = p_tenant
       and (regexp_replace(coalesce(c.phone, ''), '\D', '', 'g') = v_phone
         or regexp_replace(coalesce(c.whatsapp, ''), '\D', '', 'g') = v_phone)
     order by c.created_at limit 1;
  end if;
  if v_id is not null then
    return query select v_id, false, v_owner;
    return;
  end if;

  insert into public.crm_contacts (tenant_id, name, email, phone, whatsapp, document, company, city, state, notes, source, owner_id, custom, import_id, created_by)
  values (
    p_tenant, left(trim(p_name), 160), v_email, v_phone,
    coalesce(nullif(regexp_replace(coalesce(p_extra->>'whatsapp', ''), '\D', '', 'g'), ''), v_phone),
    nullif(regexp_replace(coalesce(p_extra->>'document', ''), '\D', '', 'g'), ''),
    nullif(trim(coalesce(p_company, '')), ''),
    nullif(trim(coalesce(p_extra->>'city', '')), ''),
    nullif(upper(trim(coalesce(p_extra->>'state', ''))), ''),
    nullif(trim(coalesce(p_extra->>'notes', '')), ''),
    coalesce(p_source, 'manual'), p_owner,
    coalesce(p_extra->'custom', '{}'::jsonb),
    p_import, auth.uid()
  )
  returning id into v_id;
  return query select v_id, true, p_owner;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Um lote de linhas. Cada linha: {name, email, phone, company, owner_id, deal_title,
-- value, stage_id, expected_close_date, contact_custom, deal_custom, whatsapp,
-- document, city, state, notes, line}
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.crm_import_rows(p_import uuid, p_rows jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import   public.crm_imports;
  r          jsonb;
  v_contact  record;
  v_deal     uuid;
  v_stage    public.crm_pipeline_stages;
  n_created  int := 0;
  n_reused   int := 0;
  n_deals    int := 0;
  v_errors   jsonb := '[]'::jsonb;
begin
  select * into v_import from public.crm_imports where id = p_import;
  if v_import.id is null then
    raise exception 'importação não encontrada';
  end if;
  if v_import.status <> 'running' then
    raise exception 'esta importação já terminou';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'mande até 200 linhas por vez';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    begin
      if length(trim(coalesce(r->>'name', ''))) = 0 then
        raise exception 'nome vazio';
      end if;

      select * into v_contact from public.crm_find_or_create_contact(
        v_import.tenant_id, r->>'name', r->>'email', r->>'phone', r->>'company', 'importacao',
        nullif(r->>'owner_id', '')::uuid,
        jsonb_build_object(
          'whatsapp', r->>'whatsapp', 'document', r->>'document', 'city', r->>'city', 'state', r->>'state',
          'notes', r->>'notes', 'custom', coalesce(r->'contact_custom', '{}'::jsonb)),
        p_import);
      if v_contact.created then n_created := n_created + 1; else n_reused := n_reused + 1; end if;

      if nullif(r->>'stage_id', '') is not null then
        select * into v_stage from public.crm_pipeline_stages where id = (r->>'stage_id')::uuid and tenant_id = v_import.tenant_id;
        if v_stage.id is null then
          raise exception 'etapa não encontrada';
        end if;
        insert into public.crm_deals (tenant_id, contact_id, stage_id, title, value, owner_id, source, expected_close_date, custom, import_id, created_by)
        values (
          v_import.tenant_id, v_contact.contact_id, v_stage.id,
          left(coalesce(nullif(trim(r->>'deal_title'), ''), r->>'name'), 160),
          greatest(coalesce((r->>'value')::numeric, 0), 0),
          coalesce(nullif(r->>'owner_id', '')::uuid, v_contact.owner_id),
          'importacao',
          nullif(r->>'expected_close_date', '')::date,
          coalesce(r->'deal_custom', '{}'::jsonb),
          p_import, auth.uid()
        )
        returning id into v_deal;
        insert into public.crm_deal_activities (tenant_id, deal_id, author_id, kind, content, meta)
        values (v_import.tenant_id, v_deal, auth.uid(), 'system', 'Importado da planilha "' || v_import.file_name || '"',
                jsonb_build_object('import_id', p_import, 'line', r->'line'));
        n_deals := n_deals + 1;
      end if;
    exception when others then
      v_errors := v_errors || jsonb_build_object('line', r->'line', 'name', r->>'name', 'error', left(sqlerrm, 200));
    end;
  end loop;

  update public.crm_imports
     set contacts_created = contacts_created + n_created,
         contacts_reused  = contacts_reused + n_reused,
         deals_created    = deals_created + n_deals,
         errors           = errors || v_errors
   where id = p_import;

  return jsonb_build_object('contacts_created', n_created, 'contacts_reused', n_reused, 'deals_created', n_deals, 'errors', v_errors);
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- Desfazer: só a última importação da empresa
-- ───────────────────────────────────────────────────────────────────────────
-- DEFINER, de propósito: apagar negócio e contato é policy de gerente para
-- cima, mas quem importou precisa poder desfazer na hora — e só o que a
-- própria importação criou. A checagem de empresa e módulo é explícita aqui,
-- porque o RLS não vale dentro de definer.
create or replace function public.crm_undo_import(p_import uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_import  public.crm_imports;
  n_deals   int;
  n_contacts int;
begin
  select * into v_import from public.crm_imports where id = p_import;
  if v_import.id is null
     or v_import.tenant_id is distinct from public.get_user_tenant_id()
     or not public.has_comercial_access(auth.uid()) then
    raise exception 'importação não encontrada';
  end if;
  if v_import.status = 'undone' then
    raise exception 'esta importação já foi desfeita';
  end if;
  -- "A última" = nenhuma mais nova ainda de pé. Comparar por created_at e não
  -- por ordenação: duas na mesma transação empatam, e o id é aleatório.
  if exists (select 1 from public.crm_imports i
              where i.tenant_id = v_import.tenant_id and i.status <> 'undone' and i.created_at > v_import.created_at) then
    -- ponytail: desfazer uma antiga apagaria negócios que ganharam histórico depois; o teto é "só a última".
    raise exception 'só a última importação pode ser desfeita';
  end if;

  with d as (delete from public.crm_deals where import_id = p_import returning 1)
  select count(*) into n_deals from d;

  with c as (
    delete from public.crm_contacts c
     where c.import_id = p_import
       and not exists (select 1 from public.crm_deals d where d.contact_id = c.id)
    returning 1)
  select count(*) into n_contacts from c;

  update public.crm_imports set status = 'undone', finished_at = now() where id = p_import;
  return jsonb_build_object('deals_deleted', n_deals, 'contacts_deleted', n_contacts);
end;
$$;

revoke all on function public.crm_undo_import(uuid) from public, anon;
