-- CRM-4a, correções da auditoria. 2026-09-13.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. A conversa de um estranho caía no cadastro de um cliente
-- ───────────────────────────────────────────────────────────────────────────
-- Para reconhecer quem já é cliente, a função comparava os dígitos do telefone
-- cadastrado com `right(numero_da_meta, 10)`. Dez dígitos cortam o país **e o
-- primeiro algarismo do DDD** de um celular: o fixo `(19) 8888-7777` virava
-- `1988887777`, e o celular de BH `5531988887777` também — pessoas diferentes,
-- cidades diferentes, mesmo cadastro.
--
-- Duas consequências, e a segunda é pior que a primeira: a conversa do estranho
-- entrava na ficha do cliente, e a resposta do vendedor passava a ir para o
-- número do estranho, porque é dali que `whatsapp-send` tira o destino.
--
-- A chave certa é **DDD + os últimos oito dígitos**. Ela resolve o caso legítimo
-- (`(31) 97777-6666` ↔ `5531977776666`), resolve de quebra o nono dígito de
-- celular antigo, e não junta DDDs diferentes.
create or replace function public.crm_telefone_chave(p_telefone text)
returns text
language sql
immutable
as $$
  with d as (select regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g') as n),
  sem_ddi as (
    select case
             when length(n) in (12, 13) and left(n, 2) = '55' then substr(n, 3)
             else n
           end as n
      from d
  )
  select case when length(n) >= 10 then left(n, 2) || right(n, 8) end from sem_ddi;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Duas entregas ao mesmo tempo abriam dois negócios
-- ───────────────────────────────────────────────────────────────────────────
-- A Meta reentrega em paralelo. O `on conflict do nothing` do fim dedupe a
-- mensagem, mas as duas chamadas já tinham passado pelo "este contato tem
-- negócio aberto?" antes de qualquer uma inserir — e as duas abriam um. Ficava
-- um negócio vazio a mais no funil, exatamente o que a leva prometia impedir.
--
-- O trinco é por empresa + número, e dura só a transação: duas mensagens de
-- clientes diferentes não esperam uma pela outra.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 3. E a função deixa de confiar no tenant que lhe passam
-- ───────────────────────────────────────────────────────────────────────────
-- Ela é `security definer`: recebendo `p_tenant` pronto, o isolamento entre
-- empresas dependia de quem chama ter acertado. Agora recebe o
-- `phone_number_id` — que é o que a Meta manda — e **resolve a empresa aqui
-- dentro**, pela tabela de conexões, onde o índice único garante um dono só.
-- Nenhum chamador consegue mais errar a empresa.
drop function if exists public.crm_whatsapp_receber(uuid, text, text, text, text, text, text);

create or replace function public.crm_whatsapp_receber(
  p_phone_number_id text,
  p_wa_id           text,
  p_nome            text,
  p_wa_message      text,
  p_body            text,
  p_media_url       text default null,
  p_media_type      text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant  uuid;
  v_contato uuid;
  v_negocio uuid;
  v_etapa   uuid;
  v_nome    text := coalesce(nullif(trim(p_nome), ''), p_wa_id);
  v_chave   text;
begin
  if coalesce(trim(p_phone_number_id), '') = '' or coalesce(trim(p_wa_id), '') = '' then
    raise exception 'mensagem sem número de destino ou sem remetente' using errcode = '22023';
  end if;

  select tenant_id into v_tenant from public.tenant_whatsapp_connections
   where phone_number_id = p_phone_number_id and is_active;
  if not found then
    raise exception 'número não pertence a nenhuma empresa ativa' using errcode = 'P0002';
  end if;

  -- Antes de qualquer leitura que decida criar coisa, o trinco. Sem ele, duas
  -- entregas simultâneas leem "não existe" as duas e criam as duas.
  perform pg_advisory_xact_lock(hashtext(v_tenant::text || '|' || p_wa_id));

  if p_wa_message is not null then
    select deal_id into v_negocio from public.crm_messages
     where tenant_id = v_tenant and wa_message_id = p_wa_message;
    if found then
      return v_negocio;
    end if;
  end if;

  select id into v_contato from public.crm_contacts
   where tenant_id = v_tenant and whatsapp_id = p_wa_id;

  if not found then
    v_chave := public.crm_telefone_chave(p_wa_id);
    select id into v_contato from public.crm_contacts
     where tenant_id = v_tenant
       and v_chave is not null
       and public.crm_telefone_chave(phone) = v_chave
     order by created_at limit 1;

    if found then
      update public.crm_contacts set whatsapp_id = p_wa_id where id = v_contato;
    else
      insert into public.crm_contacts (tenant_id, name, phone, whatsapp_id, source)
      values (v_tenant, v_nome, p_wa_id, p_wa_id, 'whatsapp')
      returning id into v_contato;
    end if;
  end if;

  select d.id into v_negocio
    from public.crm_deals d
    join public.crm_pipeline_stages st on st.id = d.stage_id
   where d.tenant_id = v_tenant and d.contact_id = v_contato and st.kind = 'open'
   order by d.updated_at desc limit 1;

  if not found then
    select st.id into v_etapa
      from public.crm_pipeline_stages st
      join public.crm_pipelines p on p.id = st.pipeline_id
     where st.tenant_id = v_tenant and st.kind = 'open' and p.is_default
     order by st.position limit 1;
    if not found then
      raise exception 'a empresa nao tem funil com etapa inicial' using errcode = 'P0002';
    end if;

    insert into public.crm_deals (tenant_id, contact_id, stage_id, title, source)
    values (v_tenant, v_contato, v_etapa, 'WhatsApp — ' || v_nome, 'whatsapp')
    returning id into v_negocio;
  end if;

  insert into public.crm_messages
    (tenant_id, contact_id, deal_id, direction, wa_message_id, body, media_url, media_type, status)
  values
    (v_tenant, v_contato, v_negocio, 'in', p_wa_message, p_body, p_media_url, p_media_type, 'received')
  on conflict do nothing;

  return v_negocio;
end;
$$;
revoke execute on function public.crm_whatsapp_receber(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. O que segurava a escrita da conversa era só a ausência de policy
-- ───────────────────────────────────────────────────────────────────────────
-- O comentário da migration anterior diz que ninguém escreve mensagem pela
-- tela — mas `authenticated` continuava com INSERT, UPDATE e DELETE na tabela
-- (o `revoke all` de lá alcançava só o `anon`). Só a falta de policy segurava,
-- e uma policy `for all` acrescentada por engano numa leva futura abriria a
-- escrita sem reprovar teste nenhum. Agora o privilégio também não existe.
revoke insert, update, delete on public.crm_messages from authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Código morto
-- ───────────────────────────────────────────────────────────────────────────
-- `crm_whatsapp_status()` nasceu na leva e nunca teve chamador: a tela pergunta
-- o estado à edge function, que é quem sabe do webhook e do segredo do app.
drop function if exists public.crm_whatsapp_status();
