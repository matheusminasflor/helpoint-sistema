-- CRM-4a: WhatsApp — a conversa dentro do negócio. 2026-09-13.
--
-- Decisões do dono:
--   • ADR-006, já valendo: **API oficial da Meta**, número por empresa. Nada de
--     conexão por QR code — banimento não é risco aceitável num produto que se
--     vende a terceiros.
--   • 2026-09-13: a conversa vive **dentro do negócio**, na linha do tempo,
--     junto de reunião, pedido e anotação — e não numa caixa de entrada à
--     parte. Quem abre o negócio daqui a um mês vê a venda inteira num lugar.
--   • 2026-09-13: mensagem de número desconhecido **vira lead sozinha**. Lead
--     que chega no WhatsApp e ninguém anota é lead perdido — é a razão de a
--     integração existir.
--
-- O que NÃO entra aqui, de propósito: a mensagem-modelo (template) aprovada
-- pela Meta e o passo de fluxo que a dispara — vem na CRM-4b, porque depende de
-- aprovação deles e é cobrada por envio.

-- ───────────────────────────────────────────────────────────────────────────
-- 0. As chaves compostas que faltavam no CRM
-- ───────────────────────────────────────────────────────────────────────────
-- `(id, tenant_id)` é a resposta desta casa para escrita cruzada entre
-- empresas: com ela, uma linha só pode apontar para outra da **mesma** empresa,
-- e o banco recusa antes de qualquer policy. As tabelas mais novas já nascem
-- assim; `crm_contacts` e `crm_deals` são do começo do CRM e ficaram para trás.
-- A conversa aponta para as duas, então elas ganham a chave agora.
alter table public.crm_contacts add constraint crm_contacts_id_tenant_key unique (id, tenant_id);
alter table public.crm_deals    add constraint crm_deals_id_tenant_key    unique (id, tenant_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A credencial da empresa
-- ───────────────────────────────────────────────────────────────────────────
-- Fechada como as irmãs (`tenant_focusnfe_connections`): RLS ligada e **nenhuma
-- policy**, mais revoke de anon e authenticated. Só a edge function, com a
-- chave de serviço, lê isto. A tela pergunta o estado por `crm_whatsapp_status()`,
-- que devolve o número e a situação — nunca o token.
create table if not exists public.tenant_whatsapp_connections (
  tenant_id        uuid primary key references public.tenants (id) on delete cascade,
  -- Os três que a Meta dá quando o número é registrado.
  phone_number_id  text not null,
  waba_id          text not null,
  access_token     text not null,
  -- O número como o cliente o vê, só para a tela mostrar de quem é a conversa.
  display_phone    text,
  -- Segredo que a Meta devolve em cada chamada do webhook, para provarmos que é
  -- ela. Gerado aqui, informado no painel da Meta.
  verify_token     text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  -- Segredo do app, para conferir a assinatura `X-Hub-Signature-256`.
  app_secret       text,
  is_active        boolean not null default true,
  connected_by     uuid,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.tenant_whatsapp_connections enable row level security;
revoke all on public.tenant_whatsapp_connections from anon, authenticated;

create trigger handle_tenant_whatsapp_updated_at before update on public.tenant_whatsapp_connections
  for each row execute function public.handle_updated_at();

-- Um `phone_number_id` pertence a uma empresa só: sem isto, duas empresas
-- apontando o mesmo número fariam a mensagem cair na caixa errada.
create unique index if not exists tenant_whatsapp_phone_number_idx
  on public.tenant_whatsapp_connections (phone_number_id);

-- O que a tela pode saber: se está ligado, para qual número, e desde quando.
create or replace function public.crm_whatsapp_status()
returns table (conectado boolean, numero text, ativo boolean, desde timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select true, c.display_phone, c.is_active, c.created_at
    from public.tenant_whatsapp_connections c
   where c.tenant_id = public.get_user_tenant_id()
     and public.has_crm_access(auth.uid())
  union all
  select false, null::text, false, null::timestamptz
   where not exists (
     select 1 from public.tenant_whatsapp_connections c2
      where c2.tenant_id = public.get_user_tenant_id())
     and public.has_crm_access(auth.uid())
  limit 1;
$$;
revoke execute on function public.crm_whatsapp_status() from public, anon;
grant execute on function public.crm_whatsapp_status() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. O número do cliente, do jeito que a Meta o escreve
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_contacts.phone` é o telefone como a pessoa digitou — com parênteses,
-- traço, espaço, às vezes sem DDI. A Meta identifica o cliente por um número
-- só de dígitos com código do país. Guardar os dois evita adivinhação a cada
-- mensagem recebida, que é onde um contato vira dois.
alter table public.crm_contacts
  add column if not exists whatsapp_id text;

create unique index if not exists crm_contacts_whatsapp_idx
  on public.crm_contacts (tenant_id, whatsapp_id) where whatsapp_id is not null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. A conversa
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.crm_messages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  contact_id   uuid not null,
  -- Onde a conversa aparece. Nulo só no instante entre criar o contato e o
  -- negócio; na prática sempre preenchido.
  deal_id      uuid,
  channel      text not null default 'whatsapp',
  direction    text not null,
  -- O id da mensagem na Meta. É **a** defesa contra a reentrega: o webhook dela
  -- repete a mesma mensagem quando não recebe 200 rápido, e sem esta chave cada
  -- repetição viraria uma linha na conversa do cliente.
  wa_message_id text,
  body         text,
  media_url    text,
  media_type   text,
  status       text not null default 'received',
  error        text,
  -- Preenchido quando a mensagem saiu por uma mensagem-modelo (CRM-4b).
  template_name text,
  -- Quem respondeu, quando foi gente. Nulo = veio do cliente ou de um fluxo.
  sent_by      uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint crm_messages_contact_fkey foreign key (contact_id, tenant_id)
    references public.crm_contacts (id, tenant_id) on delete cascade,
  constraint crm_messages_deal_fkey foreign key (deal_id, tenant_id)
    references public.crm_deals (id, tenant_id) on delete set null (deal_id),
  constraint crm_messages_sent_by_fkey foreign key (sent_by, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (sent_by),
  constraint crm_messages_channel_check check (channel in ('whatsapp')),
  constraint crm_messages_direction_check check (direction in ('in', 'out')),
  constraint crm_messages_status_check
    check (status in ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
  -- Mensagem sem texto e sem arquivo não é mensagem.
  constraint crm_messages_tem_conteudo_check
    check (body is not null or media_url is not null or template_name is not null)
);

create unique index if not exists crm_messages_wa_id_idx
  on public.crm_messages (tenant_id, wa_message_id) where wa_message_id is not null;
create index if not exists crm_messages_deal_idx
  on public.crm_messages (deal_id, created_at);
create index if not exists crm_messages_contact_idx
  on public.crm_messages (contact_id, created_at desc);

create trigger inject_tenant_id_crm_messages before insert on public.crm_messages
  for each row execute function public.inject_tenant_id();
create trigger handle_crm_messages_updated_at before update on public.crm_messages
  for each row execute function public.handle_updated_at();

alter table public.crm_messages enable row level security;

-- Conversa de venda é de quem tem o Comercial, como o resto do CRM.
create policy "Quem tem o CRM ve as mensagens" on public.crm_messages
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_crm_access(auth.uid()));
-- Ninguém escreve mensagem direto pela tela: quem grava é a edge function, que
-- é quem realmente falou com a Meta. Uma linha aqui sem a mensagem ter saído
-- seria uma conversa que o cliente nunca viu.
revoke all on public.crm_messages from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. A mensagem que chega
-- ───────────────────────────────────────────────────────────────────────────
-- Uma função só, e não quatro chamadas da edge function, porque isto tem de ser
-- tudo ou nada: achar ou criar o contato, achar ou abrir o negócio, e gravar a
-- mensagem. Foi exatamente aqui que o formulário do site (CRM-3a) deixou
-- contato sem negócio quando o meio do caminho falhou.
--
-- Devolve o negócio onde a mensagem entrou, para a função poder avisar a equipe.
create or replace function public.crm_whatsapp_receber(
  p_tenant      uuid,
  p_wa_id       text,
  p_nome        text,
  p_wa_message  text,
  p_body        text,
  p_media_url   text default null,
  p_media_type  text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contato uuid;
  v_negocio uuid;
  v_etapa   uuid;
  v_nome    text := coalesce(nullif(trim(p_nome), ''), p_wa_id);
begin
  if p_tenant is null or coalesce(trim(p_wa_id), '') = '' then
    raise exception 'mensagem sem empresa ou sem remetente' using errcode = '22023';
  end if;

  -- Reentrega da Meta: se esta mensagem já está gravada, não faz nada de novo e
  -- devolve o negócio onde ela caiu da primeira vez.
  if p_wa_message is not null then
    select deal_id into v_negocio from public.crm_messages
     where tenant_id = p_tenant and wa_message_id = p_wa_message;
    if found then
      return v_negocio;
    end if;
  end if;

  select id into v_contato from public.crm_contacts
   where tenant_id = p_tenant and whatsapp_id = p_wa_id;

  if not found then
    -- Antes de criar um contato novo, tenta casar pelo telefone que já existe:
    -- o cliente cadastrado à mão vira o mesmo cliente, não um segundo.
    select id into v_contato from public.crm_contacts
     where tenant_id = p_tenant
       and phone is not null
       and regexp_replace(phone, '\D', '', 'g') in (p_wa_id, right(p_wa_id, 10), right(p_wa_id, 11))
     order by created_at limit 1;

    if found then
      update public.crm_contacts set whatsapp_id = p_wa_id where id = v_contato;
    else
      insert into public.crm_contacts (tenant_id, name, phone, whatsapp_id, source)
      values (p_tenant, v_nome, p_wa_id, p_wa_id, 'whatsapp')
      returning id into v_contato;
    end if;
  end if;

  -- A conversa entra no negócio aberto mais recente desse contato; se ele não
  -- tem nenhum, abre um na primeira etapa do funil padrão.
  select d.id into v_negocio
    from public.crm_deals d
    join public.crm_pipeline_stages st on st.id = d.stage_id
   where d.tenant_id = p_tenant and d.contact_id = v_contato and st.kind = 'open'
   order by d.updated_at desc limit 1;

  if not found then
    select st.id into v_etapa
      from public.crm_pipeline_stages st
      join public.crm_pipelines p on p.id = st.pipeline_id
     where st.tenant_id = p_tenant and st.kind = 'open' and p.is_default
     order by st.position limit 1;
    if not found then
      raise exception 'a empresa nao tem funil com etapa inicial' using errcode = 'P0002';
    end if;

    insert into public.crm_deals (tenant_id, contact_id, stage_id, title, source)
    values (p_tenant, v_contato, v_etapa, 'WhatsApp — ' || v_nome, 'whatsapp')
    returning id into v_negocio;
  end if;

  insert into public.crm_messages
    (tenant_id, contact_id, deal_id, direction, wa_message_id, body, media_url, media_type, status)
  values
    (p_tenant, v_contato, v_negocio, 'in', p_wa_message, p_body, p_media_url, p_media_type, 'received')
  on conflict do nothing;

  return v_negocio;
end;
$$;
revoke execute on function public.crm_whatsapp_receber(uuid, text, text, text, text, text, text)
  from public, anon, authenticated;
