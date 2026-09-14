-- CRM-4c: Lead Ads do Facebook e do Instagram. 2026-09-13.
--
-- Decisão do dono, dita duas vezes e que manda no desenho inteiro:
--
--   "os funis são criados, ou seja, você não pode atrelar um lead a um funil;
--    o administrador precisa criar funis primeiro e depois automatizar. Os
--    leads do Facebook caem onde? Ele decide."
--
--   "Pra ele usar formulário e atrelar o site ele precisa configurar onde cai
--    esse lead — ou seja, para se criar formulário, primeiro ele tem que
--    automatizar isso."
--
-- Então **não há destino padrão neste arquivo**. Nenhum funil é escolhido por
-- mim, nem "o primeiro", nem "o marcado como padrão". O formulário do anúncio
-- só vira lead depois que alguém desta casa disser para onde ele vai — é o
-- mesmo contrato do formulário do site (CRM-3a), onde funil, segmento e dono se
-- escolhem ao criar.
--
-- O que **não** pode acontecer é o lead sumir enquanto isso: ele é pago, e o
-- Facebook não reentrega depois. Quem chega de formulário ainda não ligado fica
-- **retido**, com o conteúdo inteiro guardado, e entra no funil no instante em
-- que a configuração aparecer. Reter não é escolher destino: é não perder.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. As chaves compostas que faltavam no funil
-- ───────────────────────────────────────────────────────────────────────────
-- `(id, tenant_id)` é como esta casa impede uma linha de apontar para outra de
-- empresa diferente. Funil, etapa e segmento são do começo do CRM e ficaram
-- sem — e é justamente para eles que o destino do formulário aponta.
alter table public.crm_pipelines       add constraint crm_pipelines_id_tenant_key       unique (id, tenant_id);
alter table public.crm_pipeline_stages add constraint crm_pipeline_stages_id_tenant_key unique (id, tenant_id);
alter table public.crm_segments        add constraint crm_segments_id_tenant_key        unique (id, tenant_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O formulário do anúncio, ligado a um destino
-- ───────────────────────────────────────────────────────────────────────────
-- O formulário é criado **no Facebook**, não aqui: por isso a linha é
-- identificada pelo id de lá. O que esta tabela guarda é a **decisão do
-- administrador** sobre ele.
create table if not exists public.crm_lead_ads_forms (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  -- Vindos da Meta.
  page_id     text not null,
  form_id     text not null,
  form_name   text,
  -- A decisão. `pipeline_id` e `stage_id` são obrigatórios: um formulário ligado
  -- sem destino seria a mesma coisa que não estar ligado, e o dono foi explícito
  -- em que o destino vem antes.
  pipeline_id uuid not null,
  stage_id    uuid not null,
  segment_id  uuid,
  owner_id    uuid,
  /**
   * De qual pergunta do anúncio sai qual campo do contato.
   * `{"quantos_pontos": "custom:quantos_pontos", "cnpj": "company"}` — chave é o
   * nome do campo no formulário do Facebook. O que não estiver aqui vira
   * anotação legível no negócio, em vez de se perder.
   */
  mapeamento  jsonb not null default '{}'::jsonb,
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_lead_ads_forms_unico unique (tenant_id, form_id),
  constraint crm_lead_ads_forms_pipeline_fkey foreign key (pipeline_id, tenant_id)
    references public.crm_pipelines (id, tenant_id) on delete restrict,
  constraint crm_lead_ads_forms_stage_fkey foreign key (stage_id, tenant_id)
    references public.crm_pipeline_stages (id, tenant_id) on delete restrict,
  constraint crm_lead_ads_forms_segment_fkey foreign key (segment_id, tenant_id)
    references public.crm_segments (id, tenant_id) on delete set null (segment_id),
  constraint crm_lead_ads_forms_owner_fkey foreign key (owner_id, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (owner_id)
);

-- Um `form_id` do Facebook pertence a uma empresa só: sem isto, duas empresas
-- apontando o mesmo formulário fariam o lead cair na casa errada.
create unique index if not exists crm_lead_ads_forms_form_idx
  on public.crm_lead_ads_forms (form_id);

create trigger inject_tenant_id_crm_lead_ads_forms before insert on public.crm_lead_ads_forms
  for each row execute function public.inject_tenant_id();
create trigger handle_crm_lead_ads_forms_updated_at before update on public.crm_lead_ads_forms
  for each row execute function public.handle_updated_at();

alter table public.crm_lead_ads_forms enable row level security;

create policy "Quem tem o CRM ve os formularios de anuncio" on public.crm_lead_ads_forms
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_crm_access(auth.uid()));
-- Dizer para onde o lead vai é decisão de quem administra, como criar funil.
create policy "Gestor liga o formulario a um funil" on public.crm_lead_ads_forms
  for insert to authenticated with check (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()));
create policy "Gestor muda o destino" on public.crm_lead_ads_forms
  for update to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id());
create policy "Gestor desliga o formulario" on public.crm_lead_ads_forms
  for delete to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()));

revoke all on public.crm_lead_ads_forms from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O lead como o Facebook o entregou
-- ───────────────────────────────────────────────────────────────────────────
-- Guardado **sempre**, configurado ou não. Serve a três coisas: não perder o
-- lead pago de um formulário ainda não ligado; não criar o mesmo lead duas
-- vezes quando a Meta reentrega; e poder reprocessar se o mapeamento estiver
-- errado, sem pedir nada ao Facebook (que não reentrega).
create table if not exists public.crm_lead_ads_raw (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  leadgen_id  text not null,
  page_id     text,
  form_id     text,
  -- 'retido'    = chegou de formulário sem destino configurado
  -- 'aplicado'  = virou contato e negócio
  -- 'erro'      = tentou e falhou; `erro` diz o quê
  status      text not null default 'retido',
  campos      jsonb not null default '{}'::jsonb,
  deal_id     uuid,
  erro        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint crm_lead_ads_raw_unico unique (tenant_id, leadgen_id),
  constraint crm_lead_ads_raw_status_check check (status in ('retido', 'aplicado', 'erro')),
  constraint crm_lead_ads_raw_deal_fkey foreign key (deal_id, tenant_id)
    references public.crm_deals (id, tenant_id) on delete set null (deal_id)
);

create index if not exists crm_lead_ads_raw_retidos_idx
  on public.crm_lead_ads_raw (tenant_id, status, created_at);

create trigger inject_tenant_id_crm_lead_ads_raw before insert on public.crm_lead_ads_raw
  for each row execute function public.inject_tenant_id();
create trigger handle_crm_lead_ads_raw_updated_at before update on public.crm_lead_ads_raw
  for each row execute function public.handle_updated_at();

alter table public.crm_lead_ads_raw enable row level security;

create policy "Quem tem o CRM ve os leads de anuncio" on public.crm_lead_ads_raw
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_crm_access(auth.uid()));
-- Quem grava é a edge function que falou com a Meta.
revoke all on public.crm_lead_ads_raw from anon;
revoke insert, update, delete on public.crm_lead_ads_raw from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Do lead cru ao negócio
-- ───────────────────────────────────────────────────────────────────────────
-- Uma função só, porque é tudo ou nada: achar ou criar o contato, abrir o
-- negócio no destino **que o administrador escolheu**, anotar o que veio, e
-- marcar o lead como aplicado. Sem configuração, ela não inventa lugar nenhum:
-- devolve nulo e o lead fica retido.
--
-- Devolve o negócio, ou nulo se o formulário ainda não tem destino.
create or replace function public.crm_lead_ads_aplicar(p_raw uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_raw     public.crm_lead_ads_raw;
  v_cfg     public.crm_lead_ads_forms;
  v_contato uuid;
  v_negocio uuid;
  v_nome    text;
  v_email   text;
  v_fone    text;
  v_wa      text;
  v_custom  jsonb := '{}'::jsonb;
  v_sobra   text := '';
  v_empresa text;
  k         text;
  v         jsonb;
  v_destino text;
begin
  select * into v_raw from public.crm_lead_ads_raw where id = p_raw;
  if not found then
    raise exception 'lead nao encontrado' using errcode = 'P0002';
  end if;
  if v_raw.status = 'aplicado' then
    return v_raw.deal_id;  -- reentrega ou reprocesso: não duplica
  end if;

  select * into v_cfg from public.crm_lead_ads_forms
   where tenant_id = v_raw.tenant_id and form_id = v_raw.form_id and is_active;
  if not found then
    -- **Sem destino configurado o lead não entra.** Fica retido, inteiro, e
    -- entra assim que alguém ligar o formulário a um funil.
    return null;
  end if;

  -- Os três que o Facebook nomeia igual em todo formulário.
  v_nome  := coalesce(v_raw.campos->>'full_name',
                      trim(coalesce(v_raw.campos->>'first_name', '') || ' ' ||
                           coalesce(v_raw.campos->>'last_name', '')));
  v_email := v_raw.campos->>'email';
  v_fone  := coalesce(v_raw.campos->>'phone_number', v_raw.campos->>'phone');
  v_wa    := nullif(regexp_replace(coalesce(v_fone, ''), '\D', '', 'g'), '');
  if coalesce(trim(v_nome), '') = '' then
    v_nome := coalesce(v_email, v_fone, 'Lead do anúncio');
  end if;

  -- O que o administrador mapeou vai para o campo certo; o que ele não mapeou
  -- vira anotação, em vez de se perder.
  for k, v in select * from jsonb_each(v_raw.campos) loop
    if k in ('full_name', 'first_name', 'last_name', 'email', 'phone_number', 'phone') then
      continue;
    end if;
    v_destino := v_cfg.mapeamento->>k;
    if v_destino like 'custom:%' then
      v_custom := v_custom || jsonb_build_object(substr(v_destino, 8), v #>> '{}');
    elsif v_destino = 'company' then
      v_empresa := v #>> '{}';
    else
      v_sobra := v_sobra || k || ': ' || coalesce(v #>> '{}', '') || chr(10);
    end if;
  end loop;

  -- Cliente que já existe não vira um segundo: o telefone é comparado pela
  -- mesma chave do WhatsApp (DDD + oito dígitos), e o e-mail bate direto.
  select id into v_contato from public.crm_contacts
   where tenant_id = v_raw.tenant_id
     and ((v_email is not null and lower(email) = lower(v_email))
          or (v_wa is not null and public.crm_telefone_chave(phone) = public.crm_telefone_chave(v_wa)))
   order by created_at limit 1;

  if not found then
    insert into public.crm_contacts
      (tenant_id, name, email, phone, company, segment_id, owner_id, source, custom)
    values (v_raw.tenant_id, v_nome, v_email, v_fone, v_empresa,
            v_cfg.segment_id, v_cfg.owner_id, 'facebook', v_custom)
    returning id into v_contato;
  elsif v_custom <> '{}'::jsonb then
    update public.crm_contacts
       set custom = coalesce(custom, '{}'::jsonb) || v_custom
     where id = v_contato;
  end if;

  insert into public.crm_deals (tenant_id, contact_id, stage_id, title, source, owner_id)
  values (v_raw.tenant_id, v_contato, v_cfg.stage_id,
          coalesce(v_cfg.form_name, 'Anúncio') || ' — ' || v_nome,
          'facebook', v_cfg.owner_id)
  returning id into v_negocio;

  if v_sobra <> '' then
    insert into public.crm_deal_activities (tenant_id, deal_id, kind, content)
    values (v_raw.tenant_id, v_negocio, 'note',
            'Respostas do formulário do anúncio:' || chr(10) || v_sobra);
  end if;

  update public.crm_lead_ads_raw
     set status = 'aplicado', deal_id = v_negocio, erro = null
   where id = p_raw;

  return v_negocio;
end;
$$;
revoke execute on function public.crm_lead_ads_aplicar(uuid) from public, anon;
-- Quem tem o Comercial pode mandar aplicar os retidos depois de configurar — a
-- função confere o tenant pelo próprio lead, então não há como alcançar o alheio.
grant execute on function public.crm_lead_ads_aplicar(uuid) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Ligar o formulário libera o que estava esperando
-- ───────────────────────────────────────────────────────────────────────────
-- É a razão de reter: o administrador configura e os leads pagos que chegaram
-- antes entram na hora, sem ninguém precisar saber que existiam.
create or replace function public.crm_lead_ads_soltar_retidos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.crm_lead_ads_raw;
begin
  for r in
    select * from public.crm_lead_ads_raw
     where tenant_id = new.tenant_id and form_id = new.form_id and status = 'retido'
     order by created_at
  loop
    perform public.crm_lead_ads_aplicar(r.id);
  end loop;
  return null;
end;
$$;
create trigger trg_crm_lead_ads_soltar_retidos
  after insert or update of pipeline_id, stage_id, is_active on public.crm_lead_ads_forms
  for each row when (new.is_active)
  execute function public.crm_lead_ads_soltar_retidos();
