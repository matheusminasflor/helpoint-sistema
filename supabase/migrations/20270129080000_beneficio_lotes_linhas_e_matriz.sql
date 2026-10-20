-- BENEFÍCIO DE SEXTA E TERMOS NA MATRIZ DE PERMISSÕES (dono, 2026-10-20). Decisões (múltipla escolha):
--   1. a LINHA se cria no próprio cadastro do produto do benefício (vira família de produto do Comercial: lista única);
--   2. o produto tem VÁRIOS LOTES (lote, validade, lacrado/aberto, quantidade) e a retirada puxa os lotes por FIFO —
--      o que vence primeiro sai primeiro; lote vencido não sai;
--   3. seções próprias na matriz: TI › "Termos de responsabilidade" (Ver, Gerar, Anexar assinado e devolução,
--      Excluir); Marketing › "Benefício de sexta" (Ver, Registrar retirada e devolução, Cadastrar produtos e lotes) e a
--      aba "Benefício de sexta" nas Configurações do Marketing (quem libera). O "responsável" único sai: registra quem tem
--      a marcação na matriz. Os perfis de hoje herdam: Termos = o que tinham no Inventário; Benefício = o que tinham no
--      Estoque do Marketing; a aba de configuração, só o perfil Gestor do Marketing ("Gislene e Merilyn não podem").

-- ─── 1. A aba nova da configuração do Marketing (espelho em src/config/abas-de-configuracao.ts) ─────────────────────
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha', 'feriados']
    when 'marketing'   then array['chamados', 'beneficio']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto', 'comprador']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

-- ─── 2. Os perfis de hoje herdam as marcações ──────────────────────────────────────────────────────────────────────
update public.access_profiles
   set permissions = permissions || jsonb_build_object('termos', jsonb_build_object(
         'view',   coalesce((permissions -> 'inventory' ->> 'view')::boolean, false),
         'create', coalesce((permissions -> 'inventory' ->> 'create')::boolean, false),
         'edit',   coalesce((permissions -> 'inventory' ->> 'edit')::boolean, false),
         'delete', coalesce((permissions -> 'inventory' ->> 'delete')::boolean, false)))
 where department = 'ti' and not (permissions ? 'termos');

update public.access_profiles
   set permissions = permissions
         || jsonb_build_object('beneficio', jsonb_build_object(
              'view',   coalesce((permissions -> 'estoque' ->> 'view')::boolean, false),
              'create', coalesce((permissions -> 'estoque' ->> 'create')::boolean, false),
              'edit',   coalesce((permissions -> 'estoque' ->> 'edit')::boolean, false)))
         || jsonb_build_object('config_beneficio', jsonb_build_object('view', name = 'Gestor', 'edit', name = 'Gestor'))
 where department = 'marketing' and not (permissions ? 'beneficio');

-- ─── 3. Termos: a seção própria ────────────────────────────────────────────────────────────────────────────────────
drop policy if exists ti_termos_le on public.ti_termos;
create policy ti_termos_le on public.ti_termos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'termos', 'view'));
drop policy if exists ti_termos_altera on public.ti_termos;
create policy ti_termos_altera on public.ti_termos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'termos', 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'termos', 'edit'));
drop policy if exists ti_termos_apaga on public.ti_termos;
create policy ti_termos_apaga on public.ti_termos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'termos', 'delete'));
drop policy if exists ti_termo_itens_le on public.ti_termo_itens;
create policy ti_termo_itens_le on public.ti_termo_itens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'termos', 'view'));
drop policy if exists ti_termos_arquivo_le on storage.objects;
create policy ti_termos_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'termos', 'view'));
drop policy if exists ti_termos_arquivo_grava on storage.objects;
create policy ti_termos_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
              and public.pode_no_setor('ti', 'termos', 'edit'));
drop policy if exists ti_termos_arquivo_apaga on storage.objects;
create policy ti_termos_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'ti-termos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'termos', 'delete'));

-- As funções dos termos trocam a pergunta (e a mensagem) do Inventário pela dos Termos.
do $$
declare
  r record;
  v_def text;
begin
  for r in select * from (values
    ('ti_dados_para_termo',      $a$pode_no_setor('ti', 'inventory', 'create')$a$, $b$pode_no_setor('ti', 'termos', 'create')$b$),
    ('ti_gerar_termo',           $a$pode_no_setor('ti', 'inventory', 'create')$a$, $b$pode_no_setor('ti', 'termos', 'create')$b$),
    ('ti_gerar_termo',           'Gerar termo pede a permissão de criar no Inventário da TI.',
                                 'Gerar termo pede a permissão "Gerar" em Termos de responsabilidade (TI).'),
    ('ti_devolver_termo',        $a$pode_no_setor('ti', 'inventory', 'edit')$a$, $b$pode_no_setor('ti', 'termos', 'edit')$b$),
    ('ti_devolver_termo',        'Registrar a devolução pede a permissão de editar no Inventário da TI.',
                                 'Registrar a devolução pede "Anexar assinado e devolução" em Termos de responsabilidade (TI).'),
    ('ti_termos_do_equipamento', $a$pode_no_setor('ti', 'inventory', 'view')$a$, $b$pode_no_setor('ti', 'termos', 'view')$b$)
  ) x(funcao, de, para) loop
    select pg_get_functiondef(p.oid) into v_def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcao;
    if v_def is null or position(r.de in v_def) = 0 then
      raise exception 'matriz: % não tem o trecho "%"', r.funcao, r.de;
    end if;
    execute replace(v_def, r.de, r.para);
  end loop;
end;
$$;

-- ─── 4. Benefício: a matriz no lugar do responsável ────────────────────────────────────────────────────────────────
create or replace function public.beneficio_e_responsavel()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_no_setor('marketing', 'beneficio', 'create'), false);
$$;

create or replace function public.beneficio_ve_tudo()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.pode_no_setor('marketing', 'beneficio', 'view'), false) or public.beneficio_e_liberador();
$$;

alter table public.mkt_beneficio_config drop column if exists responsavel_id;
drop policy if exists mkt_beneficio_config_grava on public.mkt_beneficio_config;
create policy mkt_beneficio_config_grava on public.mkt_beneficio_config for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('marketing', 'beneficio'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('marketing', 'beneficio'));

-- ─── 5. Lotes ──────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.mkt_beneficio_produtos drop column if exists quantidade;
drop policy if exists mkt_beneficio_produtos_grava on public.mkt_beneficio_produtos;
create policy mkt_beneficio_produtos_grava on public.mkt_beneficio_produtos for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'beneficio', 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'beneficio', 'edit'));

create table if not exists public.mkt_beneficio_lotes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  produto_id uuid not null references public.mkt_beneficio_produtos(id) on delete cascade,
  lote text not null check (btrim(lote) <> ''),
  validade date,
  condicao text not null default 'lacrado' check (condicao in ('lacrado', 'aberto')),
  quantidade int not null check (quantidade >= 0),
  created_at timestamptz not null default now()
);
create index if not exists mkt_beneficio_lotes_produto on public.mkt_beneficio_lotes (produto_id, validade);
alter table public.mkt_beneficio_lotes enable row level security;
create policy mkt_beneficio_lotes_le on public.mkt_beneficio_lotes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy mkt_beneficio_lotes_grava on public.mkt_beneficio_lotes for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'beneficio', 'edit'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('marketing', 'beneficio', 'edit'));

alter table public.mkt_beneficio_itens add column if not exists lote_id uuid references public.mkt_beneficio_lotes(id);

/** O que ainda está no lote: a quantidade menos o que está fora (retirado ou esperando liberação). */
create or replace function public.beneficio_disponivel_no_lote(p_lote uuid)
returns int language sql stable security definer set search_path = public as $$
  select l.quantidade - coalesce((select sum(it.quantidade) from public.mkt_beneficio_itens it
                                    join public.mkt_beneficio_retiradas r on r.id = it.retirada_id
                                   where it.lote_id = l.id and r.status in ('aguardando_liberacao', 'retirada')), 0)::int
    from public.mkt_beneficio_lotes l where l.id = p_lote;
$$;
revoke all on function public.beneficio_disponivel_no_lote(uuid) from public, anon;
grant execute on function public.beneficio_disponivel_no_lote(uuid) to authenticated;

-- ─── 6. Retirar com FIFO ───────────────────────────────────────────────────────────────────────────────────────────
-- p_itens: [{produto_id, quantidade}]. Mesma linha: até 3; linhas diferentes: até 2. Cada produto sai dos lotes que
-- vencem primeiro (sem validade por último; empate: o mais antigo), nunca de lote vencido.
create or replace function public.beneficio_retirar(p_colaborador uuid, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total int;
  v_linhas int;
  v_id uuid;
  v_status text;
  v_nome text;
  v_falta int;
  v_tira int;
  i jsonb;
  l record;
begin
  if not public.beneficio_e_responsavel() then
    raise exception 'Registrar a retirada pede a permissão "Registrar retirada e devolução" do Benefício de sexta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_colaborador and tenant_id = v_tenant) then
    raise exception 'Colaborador de outra empresa.' using errcode = '42501';
  end if;
  if exists (select 1 from public.mkt_beneficio_retiradas where colaborador_id = p_colaborador
               and status in ('aguardando_liberacao', 'retirada')) then
    raise exception 'Este colaborador já tem uma retirada em aberto: registre a devolução antes.' using errcode = '23514';
  end if;
  select coalesce(sum((x ->> 'quantidade')::int), 0), count(distinct p.familia_id)
    into v_total, v_linhas
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x
    join public.mkt_beneficio_produtos p on p.id = (x ->> 'produto_id')::uuid and p.tenant_id = v_tenant and p.ativo;
  if v_total = 0 or v_total <> (select coalesce(sum((x ->> 'quantidade')::int), 0) from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x) then
    raise exception 'Escolha os produtos do benefício.' using errcode = '23514';
  end if;
  if v_linhas = 1 and v_total > 3 then
    raise exception 'Da mesma linha o máximo é 3 produtos.' using errcode = '23514';
  end if;
  if v_linhas > 1 and v_total > 2 then
    raise exception 'Misturando linhas o máximo é 2 produtos.' using errcode = '23514';
  end if;

  v_status := case when public.beneficio_atrasos(p_colaborador) >= 2 then 'aguardando_liberacao' else 'retirada' end;
  insert into public.mkt_beneficio_retiradas (tenant_id, colaborador_id, registrado_por, status, retirado_em, prazo)
  values (v_tenant, p_colaborador, auth.uid(), v_status,
          case when v_status = 'retirada' then now() end,
          case when v_status = 'retirada' then public.beneficio_prazo(v_tenant, now()) end)
  returning id into v_id;

  for i in select * from jsonb_array_elements(p_itens) loop
    v_falta := (i ->> 'quantidade')::int;
    for l in select lt.id, public.beneficio_disponivel_no_lote(lt.id) as livre
               from public.mkt_beneficio_lotes lt
              where lt.produto_id = (i ->> 'produto_id')::uuid and lt.tenant_id = v_tenant
                and (lt.validade is null or lt.validade >= v_hoje)
              order by lt.validade nulls last, lt.created_at
              for update loop
      exit when v_falta = 0;
      continue when l.livre <= 0;
      v_tira := least(v_falta, l.livre);
      insert into public.mkt_beneficio_itens (tenant_id, retirada_id, produto_id, lote_id, quantidade)
      values (v_tenant, v_id, (i ->> 'produto_id')::uuid, l.id, v_tira);
      v_falta := v_falta - v_tira;
    end loop;
    if v_falta > 0 then
      raise exception 'Não há unidades na validade de "%".', (select nome from public.mkt_beneficio_produtos where id = (i ->> 'produto_id')::uuid)
        using errcode = '23514';
    end if;
  end loop;

  if v_status = 'aguardando_liberacao' then
    select full_name into v_nome from public.profiles where id = p_colaborador;
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
    select v_tenant, u, 'beneficio_liberar', 'beneficio', v_id,
           'Benefício de sexta: liberar a retirada de ' || coalesce(v_nome, 'colaborador'),
           coalesce(v_nome, 'O colaborador') || ' atrasou a devolução 2 vezes nos últimos 6 meses. Aprove ou recuse a retirada.', false
      from unnest(public.beneficio_liberadores(v_tenant)) u;
  end if;
  return v_id;
end;
$$;

-- ─── 7. Criar a linha no cadastro do produto (vira família de produto do Comercial) ──────────────────────────────────
create or replace function public.beneficio_criar_linha(p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_id uuid;
begin
  if not coalesce(public.pode_no_setor('marketing', 'beneficio', 'edit'), false) then
    raise exception 'Criar linha pede a permissão "Cadastrar produtos e lotes" do Benefício de sexta.' using errcode = '42501';
  end if;
  if nullif(btrim(p_nome), '') is null then
    raise exception 'Diga o nome da linha.' using errcode = '23514';
  end if;
  select id into v_id from public.com_familias
   where tenant_id = v_tenant and lower(btrim(nome)) = lower(btrim(p_nome));
  if v_id is not null then
    update public.com_familias set ativo = true where id = v_id and not ativo;
    return v_id;
  end if;
  insert into public.com_familias (tenant_id, nome, ordem)
  values (v_tenant, btrim(p_nome), coalesce((select max(ordem) from public.com_familias where tenant_id = v_tenant), 0) + 1)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.beneficio_criar_linha(text) from public, anon;
grant execute on function public.beneficio_criar_linha(text) to authenticated;
