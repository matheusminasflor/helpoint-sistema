-- Raio-X do Cliente (proposta aprovada pelo dono em 2026-11-05): perfil, dores, propostas e o resultado de cada contato.
-- O registro mora no cliente, não no lançamento nem no vendedor: quem assume a carteira vê toda a história, e o
-- lançamento continua travado depois de salvo. Quem acessa a carteira vê e acrescenta; só o gestor corrige.

create or replace function public.com_pode_ver_cliente(p_codigo text)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.com_clientes c
     where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo
       and public.com_pode_ver_carteira(coalesce(c.carteira, ''))
  );
$$;

-- O cliente e os outros códigos do mesmo grupo: na Carteira, o grupo é um cliente só.
create or replace function public.com_codigos_do_grupo(p_codigo text)
returns text[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(o.codigo order by o.codigo), array[p_codigo])
    from public.com_clientes c
    join public.com_clientes o on o.tenant_id = c.tenant_id
     and public.com_chave_do_grupo(o.grupo, o.codigo) = public.com_chave_do_grupo(c.grupo, c.codigo)
   where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo;
$$;

-- Cada salvamento é uma versão nova: é assim que a situação de antes continua guardada.
create table public.com_cliente_perfis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  cliente_codigo text not null,
  tipo_negocio text,
  quem_decide text,
  melhor_contato text,
  o_que_pesa text,
  situacao text check (situacao in ('crescendo', 'estavel', 'em_dificuldade', 'parado', 'fechou')),
  autor_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, cliente_codigo) references public.com_clientes(tenant_id, codigo) on update cascade on delete restrict
);
create index com_cliente_perfis_cliente on public.com_cliente_perfis (tenant_id, cliente_codigo, created_at desc);

create table public.com_cliente_dores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  cliente_codigo text not null,
  motivo text not null check (motivo in ('preco', 'frete', 'estoque', 'credito', 'concorrente', 'produto', 'atendimento', 'pouca_venda', 'outros')),
  motivo_outros text,
  descricao text,
  status text not null default 'aberta' check (status in ('aberta', 'em_tratamento', 'resolvida', 'sem_solucao')),
  registrada_em date not null default (now() at time zone 'America/Sao_Paulo')::date,
  interacao_id uuid references public.com_interacoes(id) on delete set null,
  autor_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint com_cliente_dores_outros check (motivo <> 'outros' or nullif(btrim(motivo_outros), '') is not null),
  foreign key (tenant_id, cliente_codigo) references public.com_clientes(tenant_id, codigo) on update cascade on delete restrict
);
create index com_cliente_dores_cliente on public.com_cliente_dores (tenant_id, cliente_codigo, registrada_em desc);
create unique index com_cliente_dores_interacao on public.com_cliente_dores (interacao_id) where interacao_id is not null;

create table public.com_cliente_propostas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  dor_id uuid not null references public.com_cliente_dores(id) on delete cascade,
  tipo text not null check (tipo in ('campanha', 'preco', 'prazo', 'frete', 'treinamento', 'bonificacao', 'visita', 'outros')),
  proposta text not null check (btrim(proposta) <> ''),
  resultado text not null default 'aguardando' check (resultado in ('aguardando', 'funcionou', 'nao_funcionou')),
  autor_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index com_cliente_propostas_dor on public.com_cliente_propostas (dor_id);

-- "Não atendeu" é resultado do contato, não motivo de não comprar: não vira dor.
create table public.com_contato_resultados (
  interacao_id uuid primary key references public.com_interacoes(id) on delete cascade,
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  cliente_codigo text not null,
  resultado text not null check (resultado in ('falou', 'nao_atendeu', 'recado')),
  autor_id uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  foreign key (tenant_id, cliente_codigo) references public.com_clientes(tenant_id, codigo) on update cascade on delete restrict
);

alter table public.com_cliente_perfis enable row level security;
alter table public.com_cliente_dores enable row level security;
alter table public.com_cliente_propostas enable row level security;
alter table public.com_contato_resultados enable row level security;

create policy com_cliente_perfis_select on public.com_cliente_perfis for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.com_pode_ver_cliente(cliente_codigo));
create policy com_cliente_perfis_insert on public.com_cliente_perfis for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and autor_id = auth.uid() and public.com_pode_ver_cliente(cliente_codigo));

create policy com_cliente_dores_select on public.com_cliente_dores for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.com_pode_ver_cliente(cliente_codigo));
create policy com_cliente_dores_insert on public.com_cliente_dores for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and autor_id = auth.uid() and public.com_pode_ver_cliente(cliente_codigo));
create policy com_cliente_dores_update on public.com_cliente_dores for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.com_pode_ver_cliente(cliente_codigo))
  with check (tenant_id = public.get_user_tenant_id() and public.com_pode_ver_cliente(cliente_codigo));

create policy com_cliente_propostas_select on public.com_cliente_propostas for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and exists (
    select 1 from public.com_cliente_dores d where d.id = dor_id));
create policy com_cliente_propostas_insert on public.com_cliente_propostas for insert to authenticated
  with check (tenant_id = public.get_user_tenant_id() and autor_id = auth.uid() and exists (
    select 1 from public.com_cliente_dores d where d.id = dor_id));
create policy com_cliente_propostas_update on public.com_cliente_propostas for update to authenticated
  using (tenant_id = public.get_user_tenant_id() and exists (
    select 1 from public.com_cliente_dores d where d.id = dor_id))
  with check (tenant_id = public.get_user_tenant_id() and exists (
    select 1 from public.com_cliente_dores d where d.id = dor_id));

create policy com_contato_resultados_select on public.com_contato_resultados for select to authenticated
  using (tenant_id = public.get_user_tenant_id() and public.com_pode_ver_cliente(cliente_codigo));

-- O andamento (status da dor, resultado da proposta) é de quem atende. O que foi escrito, só o gestor corrige.
create or replace function public.com_raio_x_so_o_gestor_corrige()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.updated_at := now();
  if new.tenant_id is distinct from old.tenant_id or new.autor_id is distinct from old.autor_id then
    raise exception 'A origem do registro não muda.' using errcode = '42501';
  end if;
  if public.com_pode_corrigir_lancamento() then
    return new;
  end if;
  if tg_table_name = 'com_cliente_dores' then
    if (new.cliente_codigo, new.motivo, new.motivo_outros, new.descricao, new.registrada_em, new.interacao_id)
       is distinct from (old.cliente_codigo, old.motivo, old.motivo_outros, old.descricao, old.registrada_em, old.interacao_id) then
      raise exception 'Só o gestor corrige o que foi registrado.' using errcode = '42501';
    end if;
  elsif (new.dor_id, new.tipo, new.proposta) is distinct from (old.dor_id, old.tipo, old.proposta) then
    raise exception 'Só o gestor corrige o que foi registrado.' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger com_cliente_dores_guarda before update on public.com_cliente_dores
  for each row execute function public.com_raio_x_so_o_gestor_corrige();
create trigger com_cliente_propostas_guarda before update on public.com_cliente_propostas
  for each row execute function public.com_raio_x_so_o_gestor_corrige();

-- A pergunta do lançamento: duas chamadas, como o checklist. Se esta falhar, a tela repete sem duplicar.
create or replace function public.com_registrar_contato_no_raio_x(
  p_interacao uuid, p_resultado text, p_motivo text default null, p_motivo_outros text default null,
  p_descricao text default null, p_proposta_tipo text default null, p_proposta text default null
) returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_cliente text;
  v_autor uuid;
  v_dor uuid;
begin
  select i.cliente_codigo, i.vendedor_id into v_cliente, v_autor
    from public.com_interacoes i where i.id = p_interacao and i.tenant_id = v_tenant;
  if v_cliente is null or not (v_autor = auth.uid() or public.com_pode_corrigir_lancamento()) then
    raise exception 'Você não pode registrar neste lançamento.' using errcode = '42501';
  end if;
  if p_resultado = 'falou' and p_motivo is null then
    raise exception 'Informe por que o cliente não está comprando.' using errcode = '23514';
  end if;

  insert into public.com_contato_resultados (interacao_id, tenant_id, cliente_codigo, resultado, autor_id)
  values (p_interacao, v_tenant, v_cliente, p_resultado, auth.uid())
  on conflict (interacao_id) do nothing;

  if p_resultado <> 'falou' then
    return null;
  end if;

  insert into public.com_cliente_dores (tenant_id, cliente_codigo, motivo, motivo_outros, descricao, interacao_id, autor_id)
  values (v_tenant, v_cliente, p_motivo, nullif(btrim(p_motivo_outros), ''), nullif(btrim(p_descricao), ''), p_interacao, auth.uid())
  on conflict (interacao_id) where interacao_id is not null do nothing
  returning id into v_dor;

  if v_dor is not null and nullif(btrim(p_proposta), '') is not null then
    insert into public.com_cliente_propostas (tenant_id, dor_id, tipo, proposta, autor_id)
    values (v_tenant, v_dor, coalesce(p_proposta_tipo, 'outros'), btrim(p_proposta), auth.uid());
  end if;
  return v_dor;
end;
$$;

-- Os contatos do cliente para quem acessa a carteira, de qualquer vendedor. É função, e não policy em `com_interacoes`,
-- porque abrir a tabela faria os lançamentos da colega entrarem nas telas e nos indicadores da vendedora.
create or replace function public.com_contatos_do_cliente(p_codigo text)
returns table (id uuid, data date, status text, valor_venda numeric, prazo date, observacoes text, vendedor text)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.com_pode_ver_cliente(p_codigo) then
    raise exception 'Você não tem acesso a este cliente.' using errcode = '42501';
  end if;
  return query
  select i.id, i.data, i.status, i.valor_venda, i.prazo, i.observacoes, p.full_name
    from public.com_interacoes i
    left join public.profiles p on p.id = i.vendedor_id
   where i.tenant_id = public.get_user_tenant_id() and i.cliente_codigo = any (public.com_codigos_do_grupo(p_codigo))
   order by i.data desc, i.created_at desc
   limit 100;
end;
$$;

-- Tudo do Raio-X de um cliente, em uma ida ao banco. O grupo responde junto.
create or replace function public.com_raio_x_do_cliente(p_codigo text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_codigos text[] := public.com_codigos_do_grupo(p_codigo);
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultima date;
  v_valor numeric;
begin
  if not public.com_pode_ver_cliente(p_codigo) then
    raise exception 'Você não tem acesso a este cliente.' using errcode = '42501';
  end if;
  select max(v.dia) filter (where v.valor > 0) into v_ultima
    from public.com_vendas_unificadas(v_codigos, '1900-01-01', v_hoje + 1, null) v;
  select sum(v.valor) into v_valor
    from public.com_vendas_unificadas(v_codigos, v_ultima, v_ultima + 1, null) v;

  return jsonb_build_object(
    'ultima_compra', v_ultima,
    'valor_ultima_compra', v_valor,
    'perfis', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'tipo_negocio', f.tipo_negocio, 'quem_decide', f.quem_decide, 'melhor_contato', f.melhor_contato,
               'o_que_pesa', f.o_que_pesa, 'situacao', f.situacao, 'created_at', f.created_at, 'autor', a.full_name)
             order by f.created_at desc)
        from public.com_cliente_perfis f
        left join public.profiles a on a.id = f.autor_id
       where f.tenant_id = v_tenant and f.cliente_codigo = any (v_codigos)), '[]'::jsonb),
    'dores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'motivo', d.motivo, 'motivo_outros', d.motivo_outros, 'descricao', d.descricao, 'status', d.status,
               'registrada_em', d.registrada_em, 'autor', a.full_name,
               'propostas', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', o.id, 'tipo', o.tipo, 'proposta', o.proposta, 'resultado', o.resultado,
                          'created_at', o.created_at, 'autor', pa.full_name) order by o.created_at)
                   from public.com_cliente_propostas o
                   left join public.profiles pa on pa.id = o.autor_id
                  where o.dor_id = d.id), '[]'::jsonb))
             order by d.registrada_em desc, d.created_at desc)
        from public.com_cliente_dores d
        left join public.profiles a on a.id = d.autor_id
       where d.tenant_id = v_tenant and d.cliente_codigo = any (v_codigos)), '[]'::jsonb),
    'tentativas_sem_falar', (
      select count(*) from public.com_contato_resultados r
       where r.tenant_id = v_tenant and r.cliente_codigo = any (v_codigos) and r.resultado <> 'falou'
         and r.created_at > coalesce((
           select max(f.created_at) from public.com_contato_resultados f
            where f.tenant_id = v_tenant and f.cliente_codigo = any (v_codigos) and f.resultado = 'falou'), '-infinity'))
  );
end;
$$;

-- Uma linha por dor, com o que o cliente comprava e se voltou a comprar. Os valores saem de `com_vendas_unificadas`,
-- a mesma leitura da Carteira. Só os clientes que a pessoa pode ver.
create or replace function public.com_raio_x_relatorio(p_de date default null, p_ate date default null, p_carteira text default null)
returns table (
  dor_id uuid, cliente_codigo text, cliente text, carteira text, motivo text, motivo_outros text, descricao text, status text,
  registrada_em date, autor text, compravam numeric, voltou_em date, propostas jsonb, perfil jsonb
) language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_carteira text := nullif(public.normalizar_nome_carteira(coalesce(p_carteira, '')), '');
  v_codigos text[];
begin
  select array_agg(c.codigo) into v_codigos from public.com_clientes c
   where c.tenant_id = v_tenant and public.com_pode_ver_carteira(coalesce(c.carteira, ''));

  return query
  with vendas as (
    select public.com_chave_do_grupo(c.grupo, c.codigo) as chave, v.dia, v.valor
      from public.com_vendas_unificadas(v_codigos, '1900-01-01', v_hoje + 1, null) v
      join public.com_clientes c on c.tenant_id = v_tenant and c.codigo = v.codigo
  )
  select d.id, d.cliente_codigo, coalesce(nullif(btrim(c.grupo), ''), c.razao_social), c.carteira, d.motivo, d.motivo_outros, d.descricao,
         d.status, d.registrada_em, a.full_name,
         coalesce(u.compravam, 0),
         (select min(v.dia) from vendas v where v.chave = public.com_chave_do_grupo(c.grupo, c.codigo) and v.dia > d.registrada_em and v.valor > 0),
         coalesce((select jsonb_agg(jsonb_build_object('tipo', o.tipo, 'proposta', o.proposta, 'resultado', o.resultado) order by o.created_at)
                     from public.com_cliente_propostas o where o.dor_id = d.id), '[]'::jsonb),
         (select to_jsonb(f) - 'id' - 'tenant_id' - 'autor_id' from public.com_cliente_perfis f
           where f.tenant_id = v_tenant and f.cliente_codigo = any (public.com_codigos_do_grupo(d.cliente_codigo))
           order by f.created_at desc limit 1)
    from public.com_cliente_dores d
    join public.com_clientes c on c.tenant_id = d.tenant_id and c.codigo = d.cliente_codigo
    left join public.profiles a on a.id = d.autor_id
    left join lateral (
      -- "Compravam": os 12 meses até a última compra anterior à dor.
      select sum(v.valor) as compravam
        from vendas v
        join lateral (select max(x.dia) as dia from vendas x
                       where x.chave = public.com_chave_do_grupo(c.grupo, c.codigo) and x.dia <= d.registrada_em and x.valor > 0) ult on true
       where v.chave = public.com_chave_do_grupo(c.grupo, c.codigo) and v.dia > ult.dia - 365 and v.dia <= ult.dia
    ) u on true
   where d.tenant_id = v_tenant and d.cliente_codigo = any (v_codigos)
     and (p_de is null or d.registrada_em >= p_de) and (p_ate is null or d.registrada_em <= p_ate)
     and (v_carteira is null or c.carteira = v_carteira)
   order by coalesce(u.compravam, 0) desc, d.registrada_em desc;
end;
$$;

revoke all on function public.com_pode_ver_cliente(text) from public, anon;
revoke all on function public.com_codigos_do_grupo(text) from public, anon;
revoke all on function public.com_raio_x_so_o_gestor_corrige() from public, anon;
revoke all on function public.com_registrar_contato_no_raio_x(uuid, text, text, text, text, text, text) from public, anon;
revoke all on function public.com_contatos_do_cliente(text) from public, anon;
revoke all on function public.com_raio_x_do_cliente(text) from public, anon;
revoke all on function public.com_raio_x_relatorio(date, date, text) from public, anon;
grant execute on function public.com_pode_ver_cliente(text) to authenticated;
grant execute on function public.com_codigos_do_grupo(text) to authenticated;
grant execute on function public.com_registrar_contato_no_raio_x(uuid, text, text, text, text, text, text) to authenticated;
grant execute on function public.com_contatos_do_cliente(text) to authenticated;
grant execute on function public.com_raio_x_do_cliente(text) to authenticated;
grant execute on function public.com_raio_x_relatorio(date, date, text) to authenticated;
