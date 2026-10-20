-- TERMOS (20270129030000/40000): o cadastro rápido do equipamento ganha CATEGORIA, MARCA e MODELO separados (dono,
-- 2026-10-20: "criei os produtos no termo mas não consigo pôr categoria, nem o modelo, no ato do termo"). Antes a
-- linha tinha "Marca / Modelo" num campo só, que ia inteiro para o fabricante, e a categoria era sempre Hardware.
-- O item recebe `categoria` (nome da categoria de Inventário da TI), `marca` e `modelo`; o PDF continua com a coluna
-- "Marca / Modelo" (montada no front). Chamada antiga, com `marca_modelo`, segue funcionando.
create or replace function public.ti_categoria_do_inventario(p_nome text)
returns public.asset_category language sql immutable set search_path = public as $$
  select case
    when p_nome ilike '%hard%' then 'hardware'
    when p_nome ilike '%soft%' then 'software'
    when p_nome ilike '%perif%' or p_nome ilike '%perif%' then 'peripheral'
    when p_nome ilike '%rede%' or p_nome ilike '%network%' then 'network'
    when p_nome ilike '%mobile%' or p_nome ilike '%celular%' or p_nome ilike '%m_vel%' then 'mobile'
    when p_nome is null then 'hardware'
    else 'other' end::public.asset_category;
$$;
revoke all on function public.ti_categoria_do_inventario(text) from public, anon;
grant execute on function public.ti_categoria_do_inventario(text) to authenticated;

create or replace function public.ti_gerar_termo(p_termo jsonb, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_pessoa uuid := nullif(p_termo ->> 'colaborador_id', '')::uuid;
  v_termo uuid;
  v_asset uuid;
  v_pat text;
  v_marca text;
  v_modelo text;
  v_cat text;
  v_marca_modelo text;
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
    v_marca := nullif(btrim(i ->> 'marca'), '');
    v_modelo := nullif(btrim(i ->> 'modelo'), '');
    v_cat := nullif(btrim(i ->> 'categoria'), '');
    v_marca_modelo := coalesce(nullif(btrim(i ->> 'marca_modelo'), ''), nullif(concat_ws(' / ', v_marca, v_modelo), ''));
    if v_asset is not null and not exists (select 1 from public.assets where id = v_asset and tenant_id = v_tenant) then
      raise exception 'Equipamento de outra empresa.' using errcode = '42501';
    end if;
    if v_asset is null and v_pat is not null then
      select id into v_asset from public.assets where tenant_id = v_tenant and asset_tag = v_pat;
    end if;
    if v_asset is null then
      insert into public.assets (tenant_id, name, manufacturer, model, asset_tag, category, subcategory, status,
                                 assigned_to, created_by, notes)
      values (v_tenant, btrim(i ->> 'descricao'),
              coalesce(v_marca, case when v_modelo is null then v_marca_modelo end), v_modelo,
              coalesce(v_pat, 'SEM-PAT-' || upper(left(replace(gen_random_uuid()::text, '-', ''), 8))),
              public.ti_categoria_do_inventario(v_cat), v_cat, 'in_use', v_pessoa, auth.uid(),
              'Cadastrado no termo de responsabilidade' || coalesce(' · estado: ' || nullif(btrim(i ->> 'estado'), ''), '')
                || case when v_pat is null then ' · sem nº de patrimônio: troque a etiqueta provisória' else '' end)
      returning id into v_asset;
    elsif v_pessoa is not null then
      update public.assets set assigned_to = v_pessoa, status = 'in_use' where id = v_asset;
    end if;
    insert into public.ti_termo_itens (tenant_id, termo_id, asset_id, descricao, marca_modelo, patrimonio, estado, posicao)
    values (v_tenant, v_termo, v_asset, btrim(i ->> 'descricao'), v_marca_modelo, v_pat, nullif(btrim(i ->> 'estado'), ''), n);
  end loop;

  if v_pessoa is not null then
    update public.rh_employee_profiles
       set cpf = coalesce(nullif(btrim(cpf), ''), nullif(btrim(p_termo ->> 'cpf'), '')),
           matricula = coalesce(nullif(btrim(matricula), ''), nullif(btrim(p_termo ->> 'matricula'), ''))
     where user_id = v_pessoa and tenant_id = v_tenant;
  end if;
  return v_termo;
end;
$$;

-- Os termos de um equipamento, para o Inventário mostrar no detalhe dele (o mais recente primeiro).
create or replace function public.ti_termos_do_equipamento(p_asset uuid)
returns table (termo_id uuid, colaborador_nome text, status text, created_at timestamptz, assinado_path text,
               devolvido_em date)
language sql stable security definer set search_path = public as $$
  select t.id, t.colaborador_nome, t.status, t.created_at, t.assinado_path, t.devolvido_em
    from public.ti_termo_itens i join public.ti_termos t on t.id = i.termo_id
   where i.asset_id = p_asset and t.tenant_id = public.get_user_tenant_id()
     and public.pode_no_setor('ti', 'inventory', 'view')
   order by t.created_at desc;
$$;
revoke all on function public.ti_termos_do_equipamento(uuid) from public, anon;
grant execute on function public.ti_termos_do_equipamento(uuid) to authenticated;
