-- TI › TERMOS DE RESPONSABILIDADE DE EQUIPAMENTO (dono, 2026-10-20): "no TI ter como colocarmos termos de
-- responsabilidade de equipamentos, igual de contratos; anexamos o termo assinado e o equipamento fica atrelado a ele;
-- para gerar, seleciono o usuário, clico em gerar e já puxa o modelo". Decisões (múltipla escolha):
--   1. o equipamento vem do Inventário; o que não está cadastrado se cadastra ali mesmo, e fica no nome da pessoa;
--   2. CPF, matrícula, setor e empresa vêm do cadastro do RH quando existe, e o que faltar se preenche no termo
--      (o termo guarda o que foi impresso; o RH ganha CPF e matrícula que estavam em branco);
--   3. sai em PDF (o modelo mora no front, `src/lib/termo-equipamento-pdf.ts`);
--   4. "Registrar devolução" fecha o termo e devolve o equipamento ao estoque.
-- Quem mexe é quem tem a seção Inventário da TI no perfil: ver, gerar (criar), anexar o assinado e registrar a
-- devolução (editar), apagar (excluir).

create table if not exists public.ti_termos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  colaborador_id uuid references public.profiles(id) on delete set null,
  colaborador_nome text not null check (btrim(colaborador_nome) <> ''),
  cpf text,
  matricula text,
  setor text,
  empresa text not null check (btrim(empresa) <> ''),
  responsavel_nome text,
  local text,
  status text not null default 'aguardando_assinatura' check (status in ('aguardando_assinatura', 'assinado', 'devolvido')),
  assinado_path text,
  assinado_em date,
  devolvido_em date,
  devolucao_obs text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ti_termo_assinado_tem_arquivo check (status <> 'assinado' or assinado_path is not null),
  constraint ti_termo_devolvido_tem_data check (status <> 'devolvido' or devolvido_em is not null)
);
create index if not exists ti_termos_tenant on public.ti_termos (tenant_id, created_at desc);
alter table public.ti_termos enable row level security;
create policy ti_termos_le on public.ti_termos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'view'));
create policy ti_termos_altera on public.ti_termos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'edit'));
create policy ti_termos_apaga on public.ti_termos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'delete'));
-- Nasce só por `ti_gerar_termo` (termo, itens e equipamento numa transação).

create table if not exists public.ti_termo_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  termo_id uuid not null references public.ti_termos(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  descricao text not null check (btrim(descricao) <> ''),
  marca_modelo text,
  patrimonio text,
  estado text,
  posicao int not null default 1
);
create index if not exists ti_termo_itens_termo on public.ti_termo_itens (termo_id, posicao);
create index if not exists ti_termo_itens_asset on public.ti_termo_itens (asset_id);
alter table public.ti_termo_itens enable row level security;
create policy ti_termo_itens_le on public.ti_termo_itens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'view'));

create or replace function public.ti_termos_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.ti_termos_updated_at() from public, anon, authenticated;
drop trigger if exists trg_ti_termos_updated_at on public.ti_termos;
create trigger trg_ti_termos_updated_at before update on public.ti_termos
  for each row execute function public.ti_termos_updated_at();

-- ─── Os dados do colaborador para o termo (o cadastro do RH, quando existe) ───────────────────────────
-- Quem gera o termo nem sempre lê o RH; aqui ele recebe só o que vai impresso no termo da pessoa escolhida.
create or replace function public.ti_dados_para_termo(p_pessoa uuid)
returns table (nome text, cpf text, matricula text, setor text, empresa text)
language sql stable security definer set search_path = public as $$
  select coalesce(nullif(btrim(r.full_name), ''), p.full_name), r.cpf, r.matricula,
         coalesce(nullif(btrim(r.department), ''), p.department), c.name
    from public.profiles p
    left join public.rh_employee_profiles r on r.user_id = p.id and r.tenant_id = p.tenant_id
    left join public.rh_companies c on c.id = r.company_id
   where p.id = p_pessoa and p.tenant_id = public.get_user_tenant_id()
     and public.pode_no_setor('ti', 'inventory', 'create');
$$;
revoke all on function public.ti_dados_para_termo(uuid) from public, anon;
grant execute on function public.ti_dados_para_termo(uuid) to authenticated;

-- ─── Gerar: o termo, os itens, o equipamento novo no Inventário e tudo no nome da pessoa ───────────────
-- p_termo: {colaborador_id, colaborador_nome, cpf, matricula, setor, empresa, responsavel_nome, local}
-- p_itens: [{asset_id?, descricao, marca_modelo, patrimonio, estado}] — sem asset_id, o equipamento é cadastrado.
create or replace function public.ti_gerar_termo(p_termo jsonb, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_pessoa uuid := nullif(p_termo ->> 'colaborador_id', '')::uuid;
  v_termo uuid;
  v_asset uuid;
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
    if v_asset is not null and not exists (select 1 from public.assets where id = v_asset and tenant_id = v_tenant) then
      raise exception 'Equipamento de outra empresa.' using errcode = '42501';
    end if;
    if v_asset is null then
      -- O cadastro rápido: entra no Inventário como periférico/hardware em uso.
      insert into public.assets (tenant_id, name, manufacturer, model, asset_tag, category, status, assigned_to, created_by, notes)
      values (v_tenant, btrim(i ->> 'descricao'), nullif(btrim(i ->> 'marca_modelo'), ''), null,
              nullif(btrim(i ->> 'patrimonio'), ''), 'hardware', 'in_use', v_pessoa, auth.uid(),
              'Cadastrado no termo de responsabilidade' || coalesce(' · estado: ' || nullif(btrim(i ->> 'estado'), ''), ''))
      returning id into v_asset;
    elsif v_pessoa is not null then
      update public.assets set assigned_to = v_pessoa, status = 'in_use' where id = v_asset;
    end if;
    insert into public.ti_termo_itens (tenant_id, termo_id, asset_id, descricao, marca_modelo, patrimonio, estado, posicao)
    values (v_tenant, v_termo, v_asset, btrim(i ->> 'descricao'), nullif(btrim(i ->> 'marca_modelo'), ''),
            nullif(btrim(i ->> 'patrimonio'), ''), nullif(btrim(i ->> 'estado'), ''), n);
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
revoke all on function public.ti_gerar_termo(jsonb, jsonb) from public, anon;
grant execute on function public.ti_gerar_termo(jsonb, jsonb) to authenticated;

-- ─── Devolver: o termo fecha e o equipamento volta ao estoque ─────────────────────────────────────────
create or replace function public.ti_devolver_termo(p_termo uuid, p_data date, p_obs text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  t public.ti_termos%rowtype;
begin
  if not public.pode_no_setor('ti', 'inventory', 'edit') then
    raise exception 'Registrar a devolução pede a permissão de editar no Inventário da TI.' using errcode = '42501';
  end if;
  select * into t from public.ti_termos where id = p_termo and tenant_id = public.get_user_tenant_id() for update;
  if t.id is null then
    raise exception 'Termo não encontrado.' using errcode = '42501';
  end if;
  if t.status = 'devolvido' then
    raise exception 'Este termo já foi devolvido.' using errcode = '23514';
  end if;
  if p_data is null then
    raise exception 'Diga a data da devolução.' using errcode = '23514';
  end if;
  update public.ti_termos set status = 'devolvido', devolvido_em = p_data, devolucao_obs = nullif(btrim(p_obs), '')
   where id = t.id;
  -- Só o que ainda está com a pessoa do termo (se já foi para outra, fica onde está).
  update public.assets a set assigned_to = null, status = 'in_stock'
    from public.ti_termo_itens i
   where i.termo_id = t.id and a.id = i.asset_id
     and (t.colaborador_id is null or a.assigned_to is not distinct from t.colaborador_id);
end;
$$;
revoke all on function public.ti_devolver_termo(uuid, date, text) from public, anon;
grant execute on function public.ti_devolver_termo(uuid, date, text) to authenticated;

-- ─── O termo assinado (balde privado; caminho `<empresa>/<termo>/<arquivo>`) ─────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('ti-termos', 'ti-termos', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy ti_termos_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'inventory', 'view'));
create policy ti_termos_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
              and public.pode_no_setor('ti', 'inventory', 'edit'));
create policy ti_termos_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'inventory', 'delete'));
