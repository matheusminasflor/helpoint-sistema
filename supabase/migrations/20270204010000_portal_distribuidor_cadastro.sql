-- Portal do Distribuidor, parte 1 (etapa 6 da proposta "Helpoint no dia a dia"): o cadastro com liberação, a equipe
-- do distribuidor e o aceite dos termos. Decisões em docs/proposta-portal-distribuidor.md ("Decidido em 2026-10-25").
--
-- QUEM É O DISTRIBUIDOR NO BANCO. Uma pessoa de fora, como o cliente do SAC: tem `customer_profiles` (é por ali que ela
-- entra, com código no e-mail) e NÃO tem `profiles` — então `get_user_tenant_id()` é nulo para ela e nenhuma policy de
-- funcionário a alcança. A empresa dela vem do `customer_profiles`. O distribuidor é a empresa (`dist_distribuidores`);
-- cada pessoa que usa o portal é um membro (`dist_membros`): o dono e os vendedores dele (decisão 5, um login por pessoa).
--
-- O FLUXO (adendo do dono, 2026-10-21):
--   1. a pessoa se cadastra (o mesmo cadastro do SAC) e pede o acesso de distribuidor → `dist_pedir_cadastro`;
--   2. a TI recebe o aviso, confere e liga ao cliente do Forteplus (`com_clientes`) → `dist_liberar` (decisão 4: o
--      Gestor da TI, ou quem da TI tiver "Liberar distribuidor" no perfil);
--   3. ele recebe o e-mail de acesso liberado (função `distribuidor-email`) e, no primeiro acesso, aceita os termos.
-- Escrita só por função: nenhuma tabela daqui tem policy de INSERT/UPDATE/DELETE.

-- ── Tabelas ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.dist_distribuidores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  razao_social text not null check (btrim(razao_social) <> ''),
  cnpj text not null check (cnpj ~ '^[0-9]{14}$'),
  cidade text,
  uf text check (uf is null or uf ~ '^[A-Z]{2}$'),
  telefone text,
  status text not null default 'pendente' check (status in ('pendente', 'liberado', 'recusado', 'suspenso')),
  com_cliente_codigo text,
  motivo text,
  pedido_por uuid not null references auth.users(id) on delete cascade,
  decidido_por uuid references auth.users(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- O cliente do Comercial da MESMA empresa (lição da leva I: FK composta com o tenant).
  foreign key (tenant_id, com_cliente_codigo) references public.com_clientes (tenant_id, codigo),
  -- Liberado é ligado a um cliente do Forteplus: é dali que vêm as notas, o estoque e a tabela de preço.
  constraint dist_liberado_tem_cliente check (status <> 'liberado' or com_cliente_codigo is not null),
  constraint dist_recusa_tem_motivo check (status not in ('recusado', 'suspenso') or nullif(btrim(motivo), '') is not null)
);
-- Um CNPJ, um distribuidor em andamento: o recusado pode pedir de novo.
create unique index if not exists dist_distribuidores_cnpj_em_uso
  on public.dist_distribuidores (tenant_id, cnpj) where status in ('pendente', 'liberado', 'suspenso');
create unique index if not exists dist_distribuidores_cliente_em_uso
  on public.dist_distribuidores (tenant_id, com_cliente_codigo) where status in ('liberado', 'suspenso');

create table if not exists public.dist_membros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  distribuidor_id uuid not null references public.dist_distribuidores(id) on delete cascade,
  -- Nulo enquanto o convite não foi aceito: o vendedor convidado ainda não tem login.
  user_id uuid references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and email like '%@%'),
  nome text,
  papel text not null check (papel in ('dono', 'vendedor')),
  ativo boolean not null default true,
  convidado_por uuid references auth.users(id) on delete set null,
  entrou_em timestamptz,
  created_at timestamptz not null default now(),
  unique (distribuidor_id, email)
);
-- Uma pessoa está na equipe de um distribuidor só.
create unique index if not exists dist_membros_uma_equipe on public.dist_membros (user_id) where ativo and user_id is not null;
create index if not exists dist_membros_convite on public.dist_membros (email) where ativo and user_id is null;

create table if not exists public.dist_termos_aceitos (
  user_id uuid not null references auth.users(id) on delete cascade,
  versao text not null,
  aceito_em timestamptz not null default now(),
  primary key (user_id, versao)
);

alter table public.dist_distribuidores enable row level security;
alter table public.dist_membros enable row level security;
alter table public.dist_termos_aceitos enable row level security;

create trigger trg_dist_distribuidores_updated_at before update on public.dist_distribuidores
  for each row execute function public.handle_updated_at();

-- ── Quem é quem ─────────────────────────────────────────────────────────────────────────────────────────────────
-- O distribuidor de quem chama (membro ativo e com login), ou nulo.
create or replace function public.dist_meu()
returns uuid language sql stable security definer set search_path = public as $$
  select m.distribuidor_id from public.dist_membros m
   where m.user_id = auth.uid() and m.ativo limit 1
$$;

create or replace function public.dist_sou_dono(p_distribuidor uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.dist_membros m
                  where m.distribuidor_id = p_distribuidor and m.user_id = auth.uid() and m.ativo and m.papel = 'dono')
$$;

-- Da TI (decisão 4): ver a lista e liberar. Dono e administrador passam por `pode_no_setor`.
create or replace function public.dist_pode_ver()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_no_setor('ti', 'distribuidores', 'view') or public.pode_no_setor('ti', 'distribuidores', 'liberar')
$$;

create or replace function public.dist_pode_liberar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_no_setor('ti', 'distribuidores', 'liberar')
$$;

-- Quem recebe o aviso do pedido: quem pode liberar. Lido do perfil direto (como `quem_decide_no_setor`), porque
-- `tem_permissao` pergunta por quem está logado — e quem está logado aqui é o distribuidor, de fora da empresa.
create or replace function public.dist_quem_libera(p_tenant uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x.id), '{}') from (
    select p.id from public.profiles p
      join public.user_roles r on r.user_id = p.id and r.role in ('owner', 'admin')
     where p.tenant_id = p_tenant and coalesce(p.is_active, true)
    union
    select uap.user_id from public.user_access_profiles uap
      join public.access_profiles ap on ap.id = uap.profile_id
      join public.profiles p on p.id = uap.user_id and p.tenant_id = p_tenant and coalesce(p.is_active, true)
     where ap.tenant_id = p_tenant and ap.department = 'ti'
       and coalesce((uap.overrides -> 'distribuidores' ->> 'liberar')::boolean,
                    (ap.permissions -> 'distribuidores' ->> 'liberar')::boolean, false)
  ) x
$$;

-- ── O que cada um vê ────────────────────────────────────────────────────────────────────────────────────────────
create policy dist_distribuidores_select on public.dist_distribuidores for select to authenticated
  using (id = public.dist_meu() or (tenant_id = public.get_user_tenant_id() and public.dist_pode_ver()));

-- O dono vê a equipe toda; o vendedor, a si mesmo; a TI, todos.
create policy dist_membros_select on public.dist_membros for select to authenticated
  using (user_id = auth.uid()
      or (distribuidor_id = public.dist_meu() and public.dist_sou_dono(distribuidor_id))
      or (tenant_id = public.get_user_tenant_id() and public.dist_pode_ver()));

create policy dist_termos_aceitos_select on public.dist_termos_aceitos for select to authenticated
  using (user_id = auth.uid());

-- ── A situação de quem abre o portal ────────────────────────────────────────────────────────────────────────────
-- Uma chamada responde tudo o que a tela precisa para decidir o que mostrar.
create or replace function public.dist_situacao(p_versao_termos text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_email text;
  v_cp public.customer_profiles;
  v_m public.dist_membros;
  v_d public.dist_distribuidores;
begin
  if auth.uid() is null then
    return jsonb_build_object('situacao', 'sem_login');
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  select m.* into v_m from public.dist_membros m where m.user_id = auth.uid() and m.ativo limit 1;
  if v_m.id is not null then
    select * into v_d from public.dist_distribuidores where id = v_m.distribuidor_id;
    return jsonb_build_object(
      'situacao', v_d.status,
      'papel', v_m.papel,
      'termos_ok', exists (select 1 from public.dist_termos_aceitos t where t.user_id = auth.uid() and t.versao = p_versao_termos),
      'distribuidor', jsonb_build_object('id', v_d.id, 'razao_social', v_d.razao_social, 'cidade', v_d.cidade,
                                         'uf', v_d.uf, 'motivo', v_d.motivo, 'pedido_em', v_d.created_at));
  end if;

  -- Convidado por um distribuidor liberado da mesma empresa do cadastro dele.
  select cp.* into v_cp from public.customer_profiles cp where cp.user_id = auth.uid() order by cp.created_at limit 1;
  if v_cp.id is null then
    return jsonb_build_object('situacao', 'sem_cadastro_de_cliente');
  end if;

  select m.* into v_m from public.dist_membros m
    join public.dist_distribuidores d on d.id = m.distribuidor_id and d.status = 'liberado' and d.tenant_id = v_cp.tenant_id
   where m.user_id is null and m.ativo and m.email = v_email
   order by m.created_at desc limit 1;
  if v_m.id is not null then
    select * into v_d from public.dist_distribuidores where id = v_m.distribuidor_id;
    return jsonb_build_object('situacao', 'convidado', 'convite', v_m.id, 'distribuidor',
                              jsonb_build_object('razao_social', v_d.razao_social, 'cidade', v_d.cidade, 'uf', v_d.uf));
  end if;

  -- O pedido recusado mais recente, para dizer o motivo e deixar pedir de novo.
  select d.* into v_d from public.dist_distribuidores d where d.pedido_por = auth.uid() order by d.created_at desc limit 1;
  return jsonb_build_object('situacao', 'sem_pedido',
    'recusado', case when v_d.id is not null then jsonb_build_object('motivo', v_d.motivo, 'em', v_d.decidido_em) end,
    'cadastro', jsonb_build_object('razao_social', v_cp.razao_social, 'cnpj', regexp_replace(coalesce(v_cp.cnpj, v_cp.document, ''), '\D', '', 'g'),
                                   'telefone', coalesce(v_cp.phone, v_cp.whatsapp), 'cidade', v_cp.address_city, 'uf', v_cp.address_state));
end;
$$;

-- ── 1. O pedido de cadastro ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dist_pedir_cadastro(p_razao_social text, p_cnpj text, p_cidade text, p_uf text, p_telefone text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_cp public.customer_profiles;
  v_cnpj text := regexp_replace(coalesce(p_cnpj, ''), '\D', '', 'g');
  v_email text;
  v_id uuid;
begin
  select cp.* into v_cp from public.customer_profiles cp where cp.user_id = auth.uid() order by cp.created_at limit 1;
  if v_cp.id is null then
    raise exception 'Faça o cadastro antes de pedir o acesso de distribuidor.' using errcode = '42501';
  end if;
  if public.dist_meu() is not null then
    raise exception 'Você já está na equipe de um distribuidor.' using errcode = '23505';
  end if;
  if exists (select 1 from public.dist_distribuidores where pedido_por = auth.uid() and status = 'pendente') then
    raise exception 'Seu pedido já está com a Minasflor.' using errcode = '23505';
  end if;
  if length(v_cnpj) <> 14 then
    raise exception 'Informe o CNPJ com os 14 números.' using errcode = '23514';
  end if;
  if exists (select 1 from public.dist_distribuidores where tenant_id = v_cp.tenant_id and cnpj = v_cnpj
                and status in ('pendente', 'liberado', 'suspenso')) then
    raise exception 'Este CNPJ já tem cadastro de distribuidor. Peça ao responsável para convidar você para a equipe.'
      using errcode = '23505';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();

  insert into public.dist_distribuidores (tenant_id, razao_social, cnpj, cidade, uf, telefone, pedido_por)
  values (v_cp.tenant_id, btrim(p_razao_social), v_cnpj, nullif(btrim(p_cidade), ''), nullif(upper(btrim(p_uf)), ''),
          nullif(btrim(p_telefone), ''), auth.uid())
  returning id into v_id;

  insert into public.dist_membros (tenant_id, distribuidor_id, user_id, email, nome, papel, entrou_em)
  values (v_cp.tenant_id, v_id, auth.uid(), v_email, v_cp.full_name, 'dono', now());

  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_cp.tenant_id, u, 'distribuidor', 'distribuidor', v_id, 'Distribuidor pediu cadastro',
         btrim(p_razao_social) || ' pediu acesso ao Portal do Distribuidor. Confira os dados e ligue ao cliente do Forteplus.'
    from unnest(public.dist_quem_libera(v_cp.tenant_id)) u;
  return v_id;
end;
$$;

-- ── 2. A decisão da TI ──────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.dist_decidir(p_id uuid, p_acao text, p_cliente_codigo text default null, p_motivo text default null)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_d public.dist_distribuidores;
begin
  if not public.dist_pode_liberar() then
    raise exception 'Só o Gestor da TI, ou quem da TI tem "Liberar distribuidor" no perfil, decide o cadastro.'
      using errcode = '42501';
  end if;
  select * into v_d from public.dist_distribuidores where id = p_id and tenant_id = public.get_user_tenant_id() for update;
  if v_d.id is null then
    raise exception 'Distribuidor não encontrado.' using errcode = 'P0002';
  end if;

  if p_acao = 'liberar' then
    if not exists (select 1 from public.com_clientes c where c.tenant_id = v_d.tenant_id and c.codigo = p_cliente_codigo) then
      raise exception 'Escolha o cliente do Forteplus deste distribuidor.' using errcode = '23514';
    end if;
    if exists (select 1 from public.dist_distribuidores o where o.tenant_id = v_d.tenant_id and o.id <> p_id
                  and o.com_cliente_codigo = p_cliente_codigo and o.status in ('liberado', 'suspenso')) then
      raise exception 'Este cliente do Forteplus já está ligado a outro distribuidor.' using errcode = '23505';
    end if;
    update public.dist_distribuidores
       set status = 'liberado', com_cliente_codigo = p_cliente_codigo, motivo = null,
           decidido_por = auth.uid(), decidido_em = now()
     where id = p_id;
  elsif p_acao in ('recusar', 'suspender') then
    if nullif(btrim(p_motivo), '') is null then
      raise exception 'Escreva o motivo: ele aparece para o distribuidor.' using errcode = '23514';
    end if;
    if p_acao = 'suspender' and v_d.status <> 'liberado' then
      raise exception 'Só se suspende quem está liberado.' using errcode = '23514';
    end if;
    if p_acao = 'recusar' and v_d.status <> 'pendente' then
      raise exception 'Só se recusa o pedido que está esperando.' using errcode = '23514';
    end if;
    update public.dist_distribuidores
       set status = case p_acao when 'recusar' then 'recusado' else 'suspenso' end, motivo = btrim(p_motivo),
           decidido_por = auth.uid(), decidido_em = now()
     where id = p_id;
  else
    raise exception 'Ação desconhecida: %', p_acao using errcode = '22023';
  end if;

  -- Quem decidiu leu: o aviso do pedido sai do "Lyra avisa" de todos.
  update public.notifications set is_read = true
   where reference_type = 'distribuidor' and reference_id = p_id and not is_read;
end;
$$;

-- O cliente do Forteplus a ligar. A TI não lê `com_clientes` (a policy é do Comercial e da Diretoria): quem libera
-- busca por aqui, só o que precisa para reconhecer o cliente. O de mesmo CNPJ vem primeiro.
create or replace function public.dist_clientes_para_ligar(p_distribuidor uuid, p_busca text)
returns table (codigo text, razao_social text, documento text, cidade text, estado text, tabela_preco text, mesmo_cnpj boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare
  v_cnpj text;
begin
  if not public.dist_pode_liberar() then
    raise exception 'Só quem libera distribuidor busca o cliente.' using errcode = '42501';
  end if;
  select d.cnpj into v_cnpj from public.dist_distribuidores d
   where d.id = p_distribuidor and d.tenant_id = public.get_user_tenant_id();
  return query
    select c.codigo, c.razao_social, c.documento, c.cidade, c.estado, c.tabela_preco, c.documento = v_cnpj
      from public.com_clientes c
     where c.tenant_id = public.get_user_tenant_id()
       and (c.documento = v_cnpj
            or (length(btrim(coalesce(p_busca, ''))) >= 2
                and (c.razao_social ilike '%' || btrim(p_busca) || '%' or c.fantasia ilike '%' || btrim(p_busca) || '%'
                     or c.codigo = btrim(p_busca) or c.documento = regexp_replace(p_busca, '\D', '', 'g'))))
     order by c.documento = v_cnpj desc, c.razao_social
     limit 20;
end;
$$;

-- ── 3. A equipe do distribuidor ─────────────────────────────────────────────────────────────────────────────────
create or replace function public.dist_convidar(p_email text, p_nome text)
returns uuid language plpgsql volatile security definer set search_path = public as $$
declare
  v_dist uuid := public.dist_meu();
  v_d public.dist_distribuidores;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_id uuid;
begin
  if v_dist is null or not public.dist_sou_dono(v_dist) then
    raise exception 'Só o responsável pelo distribuidor convida a equipe.' using errcode = '42501';
  end if;
  select * into v_d from public.dist_distribuidores where id = v_dist;
  if v_d.status <> 'liberado' then
    raise exception 'O acesso do distribuidor ainda não foi liberado.' using errcode = '42501';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Confira o e-mail.' using errcode = '23514';
  end if;
  if exists (select 1 from public.dist_membros m join auth.users u on u.id = m.user_id
              where m.ativo and lower(u.email) = v_email) then
    raise exception 'Esta pessoa já está na equipe de um distribuidor.' using errcode = '23505';
  end if;

  insert into public.dist_membros (tenant_id, distribuidor_id, email, nome, papel, convidado_por)
  values (v_d.tenant_id, v_dist, v_email, nullif(btrim(p_nome), ''), 'vendedor', auth.uid())
  on conflict (distribuidor_id, email) do update
     set ativo = true, nome = coalesce(excluded.nome, dist_membros.nome), convidado_por = auth.uid(),
         user_id = case when dist_membros.ativo then dist_membros.user_id end
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.dist_aceitar_convite(p_convite uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_email text;
  v_m public.dist_membros;
begin
  if public.dist_meu() is not null then
    raise exception 'Você já está na equipe de um distribuidor.' using errcode = '23505';
  end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  select m.* into v_m from public.dist_membros m
    join public.dist_distribuidores d on d.id = m.distribuidor_id and d.status = 'liberado'
   where m.id = p_convite and m.ativo and m.user_id is null and m.email = v_email
     -- O cadastro de quem aceita é da mesma empresa do distribuidor.
     and exists (select 1 from public.customer_profiles cp where cp.user_id = auth.uid() and cp.tenant_id = m.tenant_id);
  if v_m.id is null then
    raise exception 'Convite não encontrado para o seu e-mail.' using errcode = 'P0002';
  end if;
  update public.dist_membros
     set user_id = auth.uid(), entrou_em = now(),
         nome = coalesce(nome, (select cp.full_name from public.customer_profiles cp
                                 where cp.user_id = auth.uid() and cp.tenant_id = v_m.tenant_id limit 1))
   where id = v_m.id;
end;
$$;

create or replace function public.dist_tirar_da_equipe(p_membro uuid)
returns void language plpgsql volatile security definer set search_path = public as $$
declare
  v_m public.dist_membros;
begin
  select * into v_m from public.dist_membros where id = p_membro;
  if v_m.id is null or not public.dist_sou_dono(v_m.distribuidor_id) then
    raise exception 'Só o responsável pelo distribuidor tira alguém da equipe.' using errcode = '42501';
  end if;
  if v_m.papel = 'dono' then
    raise exception 'O responsável não sai da própria equipe.' using errcode = '23514';
  end if;
  update public.dist_membros set ativo = false where id = p_membro;
end;
$$;

create or replace function public.dist_aceitar_termos(p_versao text)
returns void language sql volatile security definer set search_path = public as $$
  insert into public.dist_termos_aceitos (user_id, versao)
  select auth.uid(), p_versao where public.dist_meu() is not null
  on conflict do nothing
$$;

-- ── O e-mail (função `distribuidor-email`) ──────────────────────────────────────────────────────────────────────
-- Os dados de um e-mail, só para quem pode mandá-lo: o de acesso liberado, para quem libera; o convite, para o dono.
create or replace function public.dist_dados_do_email(p_tipo text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if p_tipo = 'liberado' then
    if not public.dist_pode_liberar() then return null; end if;
    select jsonb_build_object('para', m.email, 'nome', m.nome, 'razao_social', d.razao_social,
                              'empresa', t.name, 'slug', t.slug)
      into v
      from public.dist_distribuidores d
      join public.dist_membros m on m.distribuidor_id = d.id and m.papel = 'dono' and m.ativo
      join public.tenants t on t.id = d.tenant_id
     where d.id = p_id and d.status = 'liberado' and d.tenant_id = public.get_user_tenant_id();
  elsif p_tipo = 'convite' then
    select jsonb_build_object('para', m.email, 'nome', m.nome, 'razao_social', d.razao_social,
                              'empresa', t.name, 'slug', t.slug)
      into v
      from public.dist_membros m
      join public.dist_distribuidores d on d.id = m.distribuidor_id and d.status = 'liberado'
      join public.tenants t on t.id = d.tenant_id
     where m.id = p_id and m.ativo and m.user_id is null and public.dist_sou_dono(m.distribuidor_id);
  end if;
  return v;
end;
$$;

-- ── A permissão nova, nascida para quem já faria isso (decisão 4) ───────────────────────────────────────────────
-- "Liberar distribuidor" nasce ligada só no perfil Gestor da TI; dono e administrador passam sempre.
create or replace function public.perfis_ganham_distribuidores(p_tenant uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.access_profiles
     set permissions = permissions || jsonb_build_object('distribuidores',
           jsonb_build_object('view', name = 'Gestor', 'liberar', name = 'Gestor'))
   where tenant_id = p_tenant and department = 'ti' and not (permissions ? 'distribuidores');
end;
$$;
revoke all on function public.perfis_ganham_distribuidores(uuid) from public, anon, authenticated;
select public.perfis_ganham_distribuidores(t.id) from public.tenants t;

-- Empresa nova já nasce com a seção (a versão de 20270201010000, mais a linha nova).
create or replace function public.seed_default_categories_novos_modulos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare d text;
begin
  perform public.seed_categorias_comercial_educacional(new.id);
  perform public.seed_categorias_expedicao_producao(new.id);
  foreach d in array array['ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'comercial', 'educacional',
                           'expedicao', 'producao'] loop
    perform public.seed_default_access_profiles(new.id, d);
  end loop;
  perform public.completar_perfis_do_financeiro(new.id);
  perform public.seed_perfis_de_compras(new.id);
  perform public.perfis_ganham_acoes_de_chamado(new.id);
  perform public.perfis_ganham_secoes_da_etapa_0b(new.id);
  perform public.perfis_ganham_solicitacoes(new.id);
  perform public.perfis_ganham_distribuidores(new.id);
  insert into public.access_profiles (tenant_id, department, name, description, is_default, permissions)
  values (new.id, 'diretoria', 'Diretor', 'Vê todas as telas da Diretoria', true,
          '{"resumo": {"view": true}, "indicadores": {"view": true, "definir_metas": true}, "metas": {"view": true},
            "clientes": {"view": true}, "produtos": {"view": true}, "diretrizes": {"view": true}}'::jsonb)
  on conflict (tenant_id, department, name) do nothing;
  return new;
end;
$$;

-- ── Lição 14: nada novo alcançável por quem não entrou ─────────────────────────────────────────────────────────
revoke all on function public.dist_meu() from public, anon;
revoke all on function public.dist_sou_dono(uuid) from public, anon;
revoke all on function public.dist_pode_ver() from public, anon;
revoke all on function public.dist_pode_liberar() from public, anon;
revoke all on function public.dist_quem_libera(uuid) from public, anon, authenticated;
revoke all on function public.dist_situacao(text) from public, anon;
revoke all on function public.dist_pedir_cadastro(text, text, text, text, text) from public, anon;
revoke all on function public.dist_decidir(uuid, text, text, text) from public, anon;
revoke all on function public.dist_convidar(text, text) from public, anon;
revoke all on function public.dist_aceitar_convite(uuid) from public, anon;
revoke all on function public.dist_tirar_da_equipe(uuid) from public, anon;
revoke all on function public.dist_aceitar_termos(text) from public, anon;
revoke all on function public.dist_dados_do_email(text, uuid) from public, anon;
revoke all on function public.dist_clientes_para_ligar(uuid, text) from public, anon;
grant execute on function public.dist_meu() to authenticated;
grant execute on function public.dist_sou_dono(uuid) to authenticated;
grant execute on function public.dist_pode_ver() to authenticated;
grant execute on function public.dist_pode_liberar() to authenticated;
grant execute on function public.dist_situacao(text) to authenticated;
grant execute on function public.dist_pedir_cadastro(text, text, text, text, text) to authenticated;
grant execute on function public.dist_decidir(uuid, text, text, text) to authenticated;
grant execute on function public.dist_convidar(text, text) to authenticated;
grant execute on function public.dist_aceitar_convite(uuid) to authenticated;
grant execute on function public.dist_tirar_da_equipe(uuid) to authenticated;
grant execute on function public.dist_aceitar_termos(text) to authenticated;
grant execute on function public.dist_dados_do_email(text, uuid) to authenticated;
grant execute on function public.dist_clientes_para_ligar(uuid, text) to authenticated;
