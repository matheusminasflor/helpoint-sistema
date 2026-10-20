-- TERMOS (20270129030000), correção: o equipamento do cadastro rápido sem nº de patrimônio quebrava o termo inteiro
-- (`assets.asset_tag` é obrigatório e único por empresa — o pgTAP do CI #413 pegou). Agora:
--   * sem patrimônio, o Inventário recebe uma etiqueta provisória "SEM-PAT-xxxxxxxx" (troca-se depois no Inventário);
--   * com um patrimônio que JÁ está no Inventário, o termo usa aquele equipamento em vez de cadastrar outro.
-- O resto da função é o mesmo da versão no ar.
create or replace function public.ti_gerar_termo(p_termo jsonb, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_pessoa uuid := nullif(p_termo ->> 'colaborador_id', '')::uuid;
  v_termo uuid;
  v_asset uuid;
  v_pat text;
  i jsonb;
  n int := 0;
begin
  if not public.pode_no_setor('ti', 'inventory', 'create') then
    raise exception 'Gerar termo pede a permissão de criar no Inventário da TI.' using errcode = '42501';
  end if;
  if v_pessoa is not null and not exists (select 1 from public.profiles where id = v_pessoa and tenant_id = v_tenant) then
    raise exception 'Pessoa de outra empresa.' using errcode = '42501';
  end if;
  if jsonb_array_length(coalesce(p_itens, '[]'::jsonb)) = 0 then
    raise exception 'Coloque pelo menos um equipamento no termo.' using errcode = '23514';
  end if;

  insert into public.ti_termos (tenant_id, colaborador_id, colaborador_nome, cpf, matricula, setor, empresa,
                                responsavel_nome, local, created_by)
  values (v_tenant, v_pessoa, btrim(p_termo ->> 'colaborador_nome'), nullif(btrim(p_termo ->> 'cpf'), ''),
          nullif(btrim(p_termo ->> 'matricula'), ''), nullif(btrim(p_termo ->> 'setor'), ''),
          btrim(p_termo ->> 'empresa'), nullif(btrim(p_termo ->> 'responsavel_nome'), ''),
          nullif(btrim(p_termo ->> 'local'), ''), auth.uid())
  returning id into v_termo;

  for i in select * from jsonb_array_elements(p_itens) loop
    n := n + 1;
    v_asset := nullif(i ->> 'asset_id', '')::uuid;
    v_pat := nullif(btrim(i ->> 'patrimonio'), '');
    if v_asset is not null and not exists (select 1 from public.assets where id = v_asset and tenant_id = v_tenant) then
      raise exception 'Equipamento de outra empresa.' using errcode = '42501';
    end if;
    if v_asset is null and v_pat is not null then
      select id into v_asset from public.assets where tenant_id = v_tenant and asset_tag = v_pat;
    end if;
    if v_asset is null then
      -- O cadastro rápido: entra no Inventário como hardware em uso.
      insert into public.assets (tenant_id, name, manufacturer, asset_tag, category, status, assigned_to, created_by, notes)
      values (v_tenant, btrim(i ->> 'descricao'), nullif(btrim(i ->> 'marca_modelo'), ''),
              coalesce(v_pat, 'SEM-PAT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8))),
              'hardware', 'in_use', v_pessoa, auth.uid(),
              'Cadastrado no termo de responsabilidade' || coalesce(' · estado: ' || nullif(btrim(i ->> 'estado'), ''), '')
                || case when v_pat is null then ' · sem nº de patrimônio: troque a etiqueta provisória' else '' end)
      returning id into v_asset;
    elsif v_pessoa is not null then
      update public.assets set assigned_to = v_pessoa, status = 'in_use' where id = v_asset;
    end if;
    insert into public.ti_termo_itens (tenant_id, termo_id, asset_id, descricao, marca_modelo, patrimonio, estado, posicao)
    values (v_tenant, v_termo, v_asset, btrim(i ->> 'descricao'), nullif(btrim(i ->> 'marca_modelo'), ''),
            v_pat, nullif(btrim(i ->> 'estado'), ''), n);
  end loop;

  -- O que faltava no RH e foi preenchido no termo vale para a próxima vez (só preenche o vazio).
  if v_pessoa is not null then
    update public.rh_employee_profiles
       set cpf = coalesce(nullif(btrim(cpf), ''), nullif(btrim(p_termo ->> 'cpf'), '')),
           matricula = coalesce(nullif(btrim(matricula), ''), nullif(btrim(p_termo ->> 'matricula'), ''))
     where user_id = v_pessoa and tenant_id = v_tenant;
  end if;
  return v_termo;
end;
$$;
