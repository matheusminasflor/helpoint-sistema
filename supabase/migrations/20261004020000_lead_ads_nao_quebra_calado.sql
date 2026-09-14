-- CRM-4c, correção achada ao provar: um mapeamento errado derrubava tudo.
-- 2026-09-13.
--
-- Ao exercitar o caminho inteiro no banco, ligar o formulário a um funil falhou
-- com `campo personalizado desconhecido: quantos_pontos` — o guard do CRM
-- fazendo o certo, porque aquele campo não existia naquela empresa. Só que o
-- estrago não parava no lead:
--
--   1. o erro subia pelo trigger que solta os retidos e **abortava o INSERT da
--      configuração** — o administrador não conseguiria nem ligar o formulário,
--      e a mensagem falaria de um campo personalizado, não do mapeamento;
--   2. um único lead com problema levaria junto todos os outros retidos do
--      mesmo formulário, que estavam certos.
--
-- É a mesma família do defeito grave da CRM-3a (formulário do site), onde o
-- visitante via um erro cru do Postgres e o contato ficava sem negócio. A
-- resposta é a mesma em dois tempos: **avisar cedo quem configura**, e **isolar
-- o lead que falha** para ele não derrubar os vizinhos.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Avisar cedo: o mapeamento é conferido na hora de salvar
-- ───────────────────────────────────────────────────────────────────────────
-- O administrador descobre o problema enquanto configura, com o nome da
-- pergunta na mensagem — e não semanas depois, num lead pago que não entrou.
create or replace function public.crm_lead_ads_confere_mapeamento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  v text;
begin
  for k, v in select * from jsonb_each_text(coalesce(new.mapeamento, '{}'::jsonb)) loop
    if v like 'custom:%' then
      if not exists (
        select 1 from public.crm_custom_fields f
         where f.tenant_id = new.tenant_id
           and f.entity = 'contact'
           and f.key = substr(v, 8)
           and f.is_active
      ) then
        raise exception 'a pergunta "%" aponta para um campo personalizado que não existe no cadastro de contato: %',
          k, substr(v, 8) using errcode = '23514';
      end if;
    elsif v not in ('company', 'email', 'phone', 'name') then
      raise exception 'destino desconhecido para a pergunta "%": %', k, v using errcode = '23514';
    end if;
  end loop;
  return new;
end;
$$;
create trigger trg_crm_lead_ads_confere_mapeamento
  before insert or update of mapeamento on public.crm_lead_ads_forms
  for each row execute function public.crm_lead_ads_confere_mapeamento();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Isolar: lead que falha vira 'erro', e os outros seguem
-- ───────────────────────────────────────────────────────────────────────────
-- O `exception` aqui desfaz só o que **este** lead tentou fazer (o Postgres abre
-- um savepoint), grava o motivo em português na linha dele, e devolve o controle
-- — a configuração é salva e os leads bons entram.
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
  v_erro    text;
begin
  select * into v_raw from public.crm_lead_ads_raw where id = p_raw;
  if not found then
    raise exception 'lead nao encontrado' using errcode = 'P0002';
  end if;
  if v_raw.status = 'aplicado' then
    return v_raw.deal_id;
  end if;

  select * into v_cfg from public.crm_lead_ads_forms
   where tenant_id = v_raw.tenant_id and form_id = v_raw.form_id and is_active;
  if not found then
    return null;  -- sem destino: continua retido, e nada é inventado
  end if;

  begin
    v_nome  := coalesce(v_raw.campos->>'full_name',
                        trim(coalesce(v_raw.campos->>'first_name', '') || ' ' ||
                             coalesce(v_raw.campos->>'last_name', '')));
    v_email := v_raw.campos->>'email';
    v_fone  := coalesce(v_raw.campos->>'phone_number', v_raw.campos->>'phone');
    v_wa    := nullif(regexp_replace(coalesce(v_fone, ''), '\D', '', 'g'), '');
    if coalesce(trim(v_nome), '') = '' then
      v_nome := coalesce(v_email, v_fone, 'Lead do anúncio');
    end if;

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

  exception when others then
    -- O lead guarda o motivo e sai da frente. Ele não se perde: continua
    -- inteiro em `campos`, e reprocessa quando a causa for corrigida.
    v_erro := left(sqlerrm, 400);
    update public.crm_lead_ads_raw
       set status = 'erro', erro = v_erro
     where id = p_raw;
    return null;
  end;

  update public.crm_lead_ads_raw
     set status = 'aplicado', deal_id = v_negocio, erro = null
   where id = p_raw;

  return v_negocio;
end;
$$;
revoke execute on function public.crm_lead_ads_aplicar(uuid) from public, anon;
grant execute on function public.crm_lead_ads_aplicar(uuid) to authenticated;

-- E os que estavam em 'erro' voltam à fila quando a configuração muda: corrigir
-- o mapeamento tem de bastar para o lead entrar, sem ninguém catar um a um.
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
     where tenant_id = new.tenant_id and form_id = new.form_id
       and status in ('retido', 'erro')
     order by created_at
  loop
    perform public.crm_lead_ads_aplicar(r.id);
  end loop;
  return null;
end;
$$;
