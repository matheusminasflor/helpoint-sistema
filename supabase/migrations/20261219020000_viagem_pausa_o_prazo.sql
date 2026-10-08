-- VIAGEM PAUSA O PRAZO DO CHAMADO NOVO (dono, 2026-10-08).
--
-- "O Educacional às vezes está em viagem, portanto ficaria injusto SLA vencendo. O gestor ter um botão
-- que seleciona os colaboradores que estarão em viagem e coloca a data e a volta e as horas; as demandas
-- novas após ativar ficam com SLA pausado e avisa quem está abrindo o chamado. Os chamados que já tinham
-- sido abertos, o prazo fica — antes da viagem precisa ser resolvido." Decisões (múltipla escolha):
--   1. chamado novo PARA QUEM VIAJA (responsável da categoria ou escolhido na abertura) pausa; chamado
--      SEM atendente pausa só se TODOS que atendem o setor estiverem viajando;
--   2. pausado = os dois prazos (1ª resposta e solução) começam a contar na VOLTA, dentro do expediente.
--
-- Onde entra: no começo da contagem, em `prazo_padrao_do_chamado` e `prazo_da_primeira_resposta`. Os dois
-- recebem como início o `created_at` do chamado — então a viagem só pesa no chamado que NASCEU durante ela;
-- o que já existia não muda (é o pedido do dono). Transferir recalcula com o novo atendente, como sempre.

-- ─── 1. As viagens ───────────────────────────────────────────────────────────────────────────────
create table if not exists public.viagens_de_atendimento (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  user_id uuid not null,
  inicio timestamptz not null,
  fim timestamptz not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint viagens_de_atendimento_pessoa_fkey foreign key (user_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint viagens_de_atendimento_volta_depois check (fim > inicio)
);
create index if not exists viagens_de_atendimento_pessoa on public.viagens_de_atendimento (tenant_id, user_id, fim);

alter table public.viagens_de_atendimento enable row level security;
revoke all on public.viagens_de_atendimento from anon;

-- Ler: a empresa inteira (quem abre o chamado precisa saber que a pessoa está fora).
create policy viagens_de_atendimento_le on public.viagens_de_atendimento for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
-- Registrar, mudar e tirar: o gestor de um setor em que a pessoa atende (quem tem "Transferir"), ou o
-- administrador. O `with check` repete o `using` inteiro (lição 15).
create policy viagens_de_atendimento_gestor on public.viagens_de_atendimento for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and (public.is_admin_or_higher(auth.uid())
              or exists (select 1 from public.user_module_access m
                          where m.user_id = viagens_de_atendimento.user_id and m.tenant_id = viagens_de_atendimento.tenant_id
                            and public.gestor_do_setor(auth.uid(), m.module))))
  with check (tenant_id = (select public.get_user_tenant_id())
              and (public.is_admin_or_higher(auth.uid())
                   or exists (select 1 from public.user_module_access m
                               where m.user_id = viagens_de_atendimento.user_id and m.tenant_id = viagens_de_atendimento.tenant_id
                                 and public.gestor_do_setor(auth.uid(), m.module))));

-- ─── 2. Quando o atendimento volta ───────────────────────────────────────────────────────────────
-- Nulo = ninguém viajando que segure o chamado. Com atendente: a volta dele, se está fora em `p_quando`.
-- Sem atendente: a primeira volta da equipe, se TODOS que atendem o setor estão fora (equipe vazia = nulo).
create or replace function public.volta_da_viagem(p_tenant uuid, p_module text, p_atendente uuid, p_quando timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  with fora as (
    select v.user_id, max(v.fim) as volta
      from public.viagens_de_atendimento v
     where v.tenant_id = p_tenant and v.inicio <= p_quando and v.fim > p_quando
     group by v.user_id
  ), equipe as (
    select m.user_id, f.volta
      from public.user_module_access m
      join public.profiles p on p.id = m.user_id and p.tenant_id = p_tenant and coalesce(p.is_active, true)
      left join fora f on f.user_id = m.user_id
     where m.tenant_id = p_tenant
       and m.module = case p_module when 'tickets' then 'ti' else p_module end
  )
  select case
           when p_atendente is not null then (select volta from fora where user_id = p_atendente)
           else (select min(volta) from equipe having count(*) > 0 and bool_and(volta is not null))
         end;
$$;
revoke all on function public.volta_da_viagem(uuid, text, uuid, timestamptz) from public, anon, authenticated;

-- O aviso na abertura do chamado: a volta, se quem vai atender (ou a equipe toda) está viajando agora.
create or replace function public.aviso_de_viagem(p_module text, p_atendente uuid)
returns timestamptz language sql stable security definer set search_path = public as $$
  select public.volta_da_viagem(public.get_user_tenant_id(), p_module, p_atendente, now());
$$;
revoke all on function public.aviso_de_viagem(text, uuid) from public, anon;
grant execute on function public.aviso_de_viagem(text, uuid) to authenticated;

-- ─── 3. O prazo começa na volta ──────────────────────────────────────────────────────────────────
create or replace function public.prazo_padrao_do_chamado(p_tenant uuid, p_module text, p_priority text,
  p_inicio timestamp with time zone, p_atendente uuid, p_due_date timestamp with time zone)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_minutos integer;
  v_prazo timestamptz;
begin
  select s.resolution_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
   order by s.module nulls last
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  -- Nasceu com quem atende em viagem: conta da volta (20261219020000).
  p_inicio := coalesce(public.volta_da_viagem(p_tenant, p_module, p_atendente, p_inicio), p_inicio);
  v_prazo := public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
  if p_due_date is not null and p_due_date > v_prazo then
    return p_due_date;
  end if;
  return v_prazo;
end;
$$;

create or replace function public.prazo_da_primeira_resposta(p_tenant uuid, p_module text, p_priority text,
  p_inicio timestamp with time zone, p_atendente uuid)
returns timestamp with time zone language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_minutos integer;
begin
  select s.first_response_time into v_minutos
    from public.sla_policies s
   where s.tenant_id = p_tenant and s.priority::text = p_priority and s.is_active
     and (s.module = p_module or s.module is null)
   order by s.module nulls last
   limit 1;
  if v_minutos is null then
    return null;
  end if;
  p_inicio := coalesce(public.volta_da_viagem(p_tenant, p_module, p_atendente, p_inicio), p_inicio);
  return public.prazo_do_chamado(p_tenant, p_module, p_inicio, v_minutos, p_atendente);
end;
$$;
