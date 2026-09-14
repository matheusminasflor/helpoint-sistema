-- CRM-4c, correção: o valor entra no tipo que o campo pede. 2026-09-13.
--
-- O formulário do Facebook entrega **tudo como texto** — inclusive "12" para
-- uma pergunta numérica. O campo personalizado do contato tem tipo, e o guard
-- do CRM recusa com `campo "quantos_pontos" espera número`. O lead ia para
-- `erro` e o administrador via uma mensagem sobre tipo de campo, sem relação
-- óbvia com o anúncio.
--
-- É exatamente o defeito que a CRM-3a (formulário do site) teve e corrigiu com
-- coerção por tipo. Aqui vale o mesmo, com uma diferença: no site é a empresa
-- que desenha o campo e escolhe o tipo; no anúncio, o texto vem do Facebook e
-- **pode não ser convertível** ("uns 12", "não sei"). Nesse caso o valor não se
-- perde nem derruba o lead: vai para a anotação, legível, como qualquer
-- resposta que não foi mapeada.
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
  v_slug    text;
  v_tipo    text;
  v_txt     text;
  v_val     jsonb;
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
    return null;
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
      v_txt := v #>> '{}';

      if v_destino like 'custom:%' then
        v_slug := substr(v_destino, 8);
        select f.type into v_tipo from public.crm_custom_fields f
         where f.tenant_id = v_raw.tenant_id and f.entity = 'contact' and f.key = v_slug;

        v_val := null;
        begin
          v_val := case v_tipo
            when 'number'  then to_jsonb(replace(trim(v_txt), ',', '.')::numeric)
            when 'boolean' then to_jsonb(lower(trim(v_txt)) in ('sim', 'true', '1', 'yes'))
            when 'date'    then to_jsonb(trim(v_txt)::date::text)
            else to_jsonb(v_txt)
          end;
        exception when others then
          v_val := null;  -- texto que não vira número/data: vai para a anotação
        end;

        if v_val is null then
          v_sobra := v_sobra || k || ': ' || coalesce(v_txt, '') || chr(10);
        else
          v_custom := v_custom || jsonb_build_object(v_slug, v_val);
        end if;

      elsif v_destino = 'company' then
        v_empresa := v_txt;
      else
        v_sobra := v_sobra || k || ': ' || coalesce(v_txt, '') || chr(10);
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
    v_erro := left(sqlerrm, 400);
    update public.crm_lead_ads_raw set status = 'erro', erro = v_erro where id = p_raw;
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
