-- MARKETING › BENEFÍCIO DE SEXTA (dono, 2026-10-20): "toda sexta o colaborador pode levar para casa os produtos
-- disponíveis: até 3 da mesma linha; de linhas distintas, só 2. Usa no fim de semana e devolve segunda. Controlar o que
-- saiu, quando voltou, quem registrou e quem levou; histórico de quem atrasa: com 2 atrasos, só o gestor do Marketing
-- ou o Matheus Baeta liberam (recebem aviso para aprovar ou recusar). Devolvido fora do prazo: motivo obrigatório e se
-- o produto voltou com uso acima do ideal — indício de má-fé." Decisões (múltipla escolha):
--   1. quem registra a retirada e a devolução é o RESPONSÁVEL do benefício (trocável na configuração);
--   2. os 2 atrasos contam nos últimos 6 meses;
--   3. libera quem é gestor do Marketing ou o liberador da configuração (na Minasflor, o Matheus Baeta);
--   4. o prazo é segunda-feira ao meio-dia (Brasília); feriado na segunda empurra para o próximo dia útil, meio-dia.
-- As linhas são as famílias de produto do Comercial (`com_familias`).

alter type public.notification_type add value if not exists 'beneficio_liberar';
alter type public.notification_type add value if not exists 'beneficio_decidido';

create table if not exists public.mkt_beneficio_config (
  tenant_id uuid primary key default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  responsavel_id uuid references public.profiles(id) on delete set null,
  liberador_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.mkt_beneficio_config enable row level security;
create policy mkt_beneficio_config_le on public.mkt_beneficio_config for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy mkt_beneficio_config_grava on public.mkt_beneficio_config for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.is_admin_or_higher(auth.uid()));

-- Na Minasflor, quem libera além do gestor do Marketing é o Matheus Baeta (em outro banco o perfil não existe).
insert into public.mkt_beneficio_config (tenant_id, liberador_id)
select p.tenant_id, p.id from public.profiles p where p.id = 'a30e44b6-18cc-47a3-81c0-5f7b89bd3359'
on conflict (tenant_id) do nothing;

create table if not exists public.mkt_beneficio_produtos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null check (btrim(nome) <> ''),
  familia_id uuid not null references public.com_familias(id),
  quantidade int not null default 0 check (quantidade >= 0),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.mkt_beneficio_produtos enable row level security;

create table if not exists public.mkt_beneficio_retiradas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  colaborador_id uuid not null references public.profiles(id),
  registrado_por uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('aguardando_liberacao', 'recusada', 'retirada', 'devolvida')),
  pedido_em timestamptz not null default now(),
  retirado_em timestamptz,
  prazo timestamptz,
  liberado_por uuid references public.profiles(id) on delete set null,
  liberacao_em timestamptz,
  liberacao_motivo text,
  devolvido_em timestamptz,
  devolvido_para uuid references public.profiles(id) on delete set null,
  atraso boolean not null default false,
  motivo_atraso text,
  estado_na_volta text check (estado_na_volta in ('normal', 'uso_acima', 'danificado')),
  detalhe_da_volta text,
  ma_fe boolean not null default false
);
create index if not exists mkt_beneficio_retiradas_colab on public.mkt_beneficio_retiradas (tenant_id, colaborador_id, pedido_em desc);
alter table public.mkt_beneficio_retiradas enable row level security;

create table if not exists public.mkt_beneficio_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  retirada_id uuid not null references public.mkt_beneficio_retiradas(id) on delete cascade,
  produto_id uuid not null references public.mkt_beneficio_produtos(id),
  quantidade int not null check (quantidade > 0)
);
alter table public.mkt_beneficio_itens enable row level security;

-- ─── Quem é quem ───────────────────────────────────────────────────────────────────────────────────────
create or replace function public.beneficio_e_responsavel()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or exists (select 1 from public.mkt_beneficio_config
                  where tenant_id = public.get_user_tenant_id() and responsavel_id = auth.uid());
$$;
revoke all on function public.beneficio_e_responsavel() from public, anon;
grant execute on function public.beneficio_e_responsavel() to authenticated;

create or replace function public.beneficio_liberadores(p_tenant uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct x), '{}') from (
    select c.liberador_id as x from public.mkt_beneficio_config c where c.tenant_id = p_tenant and c.liberador_id is not null
    union
    select p.id from public.profiles p
      join public.user_module_access m on m.user_id = p.id and m.module = 'marketing'
     where p.tenant_id = p_tenant and coalesce(p.is_active, true) and coalesce(public.gestor_do_setor(p.id, 'marketing'), false)
  ) q;
$$;
revoke all on function public.beneficio_liberadores(uuid) from public, anon, authenticated;

create or replace function public.beneficio_e_liberador()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = any (public.beneficio_liberadores(public.get_user_tenant_id()));
$$;
revoke all on function public.beneficio_e_liberador() from public, anon;
grant execute on function public.beneficio_e_liberador() to authenticated;

-- Quem vê: o responsável, quem libera, o Marketing com a seção Estoque, e o colaborador as próprias retiradas.
create or replace function public.beneficio_ve_tudo()
returns boolean language sql stable security definer set search_path = public as $$
  select public.beneficio_e_responsavel() or public.beneficio_e_liberador()
      or coalesce(public.pode_no_setor('marketing', 'estoque', 'view'), false);
$$;
revoke all on function public.beneficio_ve_tudo() from public, anon;
grant execute on function public.beneficio_ve_tudo() to authenticated;

create policy mkt_beneficio_produtos_le on public.mkt_beneficio_produtos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy mkt_beneficio_produtos_grava on public.mkt_beneficio_produtos for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.beneficio_e_responsavel())
  with check (tenant_id = (select public.get_user_tenant_id()) and public.beneficio_e_responsavel());
create policy mkt_beneficio_retiradas_le on public.mkt_beneficio_retiradas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and (colaborador_id = auth.uid() or public.beneficio_ve_tudo()));
create policy mkt_beneficio_itens_le on public.mkt_beneficio_itens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.mkt_beneficio_retiradas r where r.id = retirada_id
                       and (r.colaborador_id = auth.uid() or public.beneficio_ve_tudo())));
-- Retirada, liberação e devolução só pelas funções abaixo.

-- ─── O prazo: segunda (ou o próximo dia útil) ao meio-dia de Brasília ──────────────────────────────────
create or replace function public.beneficio_prazo(p_tenant uuid, p_retirada timestamptz)
returns timestamptz language plpgsql stable set search_path = public as $$
declare
  d date := (p_retirada at time zone 'America/Sao_Paulo')::date + 1;
begin
  while extract(isodow from d) <> 1 loop d := d + 1; end loop;
  while extract(isodow from d) in (6, 7)
        or exists (select 1 from public.feriados_nacionais(extract(year from d)::int) f where f.data = d)
        or exists (select 1 from public.feriados_da_empresa f where f.tenant_id = p_tenant and f.data = d) loop
    d := d + 1;
  end loop;
  return (d + time '12:00') at time zone 'America/Sao_Paulo';
end;
$$;
revoke all on function public.beneficio_prazo(uuid, timestamptz) from public, anon;
grant execute on function public.beneficio_prazo(uuid, timestamptz) to authenticated;

/** Atrasos nos últimos 6 meses: devolvidas com atraso e as que estão fora agora, já vencidas. */
create or replace function public.beneficio_atrasos(p_colaborador uuid)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.mkt_beneficio_retiradas
   where tenant_id = public.get_user_tenant_id() and colaborador_id = p_colaborador
     and pedido_em > now() - interval '6 months'
     and (atraso or (status = 'retirada' and prazo < now()));
$$;
revoke all on function public.beneficio_atrasos(uuid) from public, anon;
grant execute on function public.beneficio_atrasos(uuid) to authenticated;

-- ─── Retirar ──────────────────────────────────────────────────────────────────────────────────────────
-- p_itens: [{produto_id, quantidade}]. Mesma linha: até 3; linhas diferentes: até 2 no total.
create or replace function public.beneficio_retirar(p_colaborador uuid, p_itens jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_total int;
  v_linhas int;
  v_id uuid;
  v_status text;
  v_nome text;
  i jsonb;
begin
  if not public.beneficio_e_responsavel() then
    raise exception 'Só o responsável do benefício registra a retirada (Marketing › Benefício de sexta › Configurar).' using errcode = '42501';
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
  -- Disponível: a quantidade menos o que está fora (retirado ou esperando liberação).
  for i in select * from jsonb_array_elements(p_itens) loop
    if (select p.quantidade - coalesce((select sum(it.quantidade) from public.mkt_beneficio_itens it
                                          join public.mkt_beneficio_retiradas r on r.id = it.retirada_id
                                         where it.produto_id = p.id and r.status in ('aguardando_liberacao', 'retirada')), 0)
          from public.mkt_beneficio_produtos p where p.id = (i ->> 'produto_id')::uuid) < (i ->> 'quantidade')::int then
      raise exception 'Não há unidades disponíveis de "%".', (select nome from public.mkt_beneficio_produtos where id = (i ->> 'produto_id')::uuid)
        using errcode = '23514';
    end if;
  end loop;

  v_status := case when public.beneficio_atrasos(p_colaborador) >= 2 then 'aguardando_liberacao' else 'retirada' end;
  insert into public.mkt_beneficio_retiradas (tenant_id, colaborador_id, registrado_por, status, retirado_em, prazo)
  values (v_tenant, p_colaborador, auth.uid(), v_status,
          case when v_status = 'retirada' then now() end,
          case when v_status = 'retirada' then public.beneficio_prazo(v_tenant, now()) end)
  returning id into v_id;
  insert into public.mkt_beneficio_itens (tenant_id, retirada_id, produto_id, quantidade)
  select v_tenant, v_id, (x ->> 'produto_id')::uuid, (x ->> 'quantidade')::int from jsonb_array_elements(p_itens) x;

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
revoke all on function public.beneficio_retirar(uuid, jsonb) from public, anon;
grant execute on function public.beneficio_retirar(uuid, jsonb) to authenticated;

-- ─── Liberar ou recusar (quem tem 2 atrasos) ──────────────────────────────────────────────────────────
create or replace function public.beneficio_liberar(p_retirada uuid, p_aprova boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.mkt_beneficio_retiradas%rowtype;
begin
  if not (public.beneficio_e_liberador() or public.is_admin_or_higher(auth.uid())) then
    raise exception 'Só o gestor do Marketing ou o liberador do benefício decidem.' using errcode = '42501';
  end if;
  select * into r from public.mkt_beneficio_retiradas where id = p_retirada and tenant_id = public.get_user_tenant_id() for update;
  if r.id is null or r.status <> 'aguardando_liberacao' then
    raise exception 'Esta retirada não está esperando liberação.' using errcode = '22023';
  end if;
  if not p_aprova and nullif(btrim(p_motivo), '') is null then
    raise exception 'Para recusar, escreva o motivo.' using errcode = '23514';
  end if;
  update public.mkt_beneficio_retiradas
     set status = case when p_aprova then 'retirada' else 'recusada' end,
         liberado_por = auth.uid(), liberacao_em = now(), liberacao_motivo = nullif(btrim(p_motivo), ''),
         retirado_em = case when p_aprova then now() end,
         prazo = case when p_aprova then public.beneficio_prazo(r.tenant_id, now()) end
   where id = r.id;
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select r.tenant_id, x, 'beneficio_decidido', 'beneficio', r.id,
         'Benefício de sexta: retirada ' || case when p_aprova then 'liberada' else 'recusada' end,
         coalesce('Motivo: ' || nullif(btrim(p_motivo), ''), case when p_aprova then 'Pode entregar os produtos.' else '' end), false
    from unnest(array[r.colaborador_id, r.registrado_por]) x where x is not null and x <> auth.uid();
end;
$$;
revoke all on function public.beneficio_liberar(uuid, boolean, text) from public, anon;
grant execute on function public.beneficio_liberar(uuid, boolean, text) to authenticated;

-- ─── Devolver ─────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.beneficio_devolver(p_retirada uuid, p_estado text, p_motivo_atraso text default null,
                                                     p_detalhe text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  r public.mkt_beneficio_retiradas%rowtype;
  v_atraso boolean;
begin
  if not public.beneficio_e_responsavel() then
    raise exception 'Só o responsável do benefício registra a devolução.' using errcode = '42501';
  end if;
  select * into r from public.mkt_beneficio_retiradas where id = p_retirada and tenant_id = public.get_user_tenant_id() for update;
  if r.id is null or r.status <> 'retirada' then
    raise exception 'Esta retirada não está com o colaborador.' using errcode = '22023';
  end if;
  if p_estado not in ('normal', 'uso_acima', 'danificado') then
    raise exception 'Diga em que estado o produto voltou.' using errcode = '23514';
  end if;
  v_atraso := now() > r.prazo;
  if v_atraso and (nullif(btrim(p_motivo_atraso), '') is null or nullif(btrim(p_detalhe), '') is null) then
    raise exception 'Devolução fora do prazo: escreva o motivo do atraso e detalhe o estado do produto.' using errcode = '23514';
  end if;
  if p_estado <> 'normal' and nullif(btrim(p_detalhe), '') is null then
    raise exception 'Detalhe o que há de diferente no produto.' using errcode = '23514';
  end if;
  update public.mkt_beneficio_retiradas
     set status = 'devolvida', devolvido_em = now(), devolvido_para = auth.uid(), atraso = v_atraso,
         motivo_atraso = nullif(btrim(p_motivo_atraso), ''), estado_na_volta = p_estado,
         detalhe_da_volta = nullif(btrim(p_detalhe), ''),
         -- Demorou E usou além do ideal: aproveitou o tempo a mais (dono: "induz má-fé").
         ma_fe = v_atraso and p_estado = 'uso_acima'
   where id = r.id;
end;
$$;
revoke all on function public.beneficio_devolver(uuid, text, text, text) from public, anon;
grant execute on function public.beneficio_devolver(uuid, text, text, text) to authenticated;
