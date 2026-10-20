-- DEMISSÃO, DEVOLUÇÃO E CONFERÊNCIA DE EQUIPAMENTOS (dono, 2026-10-20; docs/plano-admissao-demissao-equipamentos.md).
-- Caso real: um mouse da empresa foi para casa e o pessoal ficou no lugar — "inadmissível". Decisões (as recomendadas):
--   1. demissão = checklist que trava: o RH escolhe QUEM SAI; a TI recebe um chamado com tudo no nome da pessoa; cada
--      item é marcado devolvido ok / com avaria / não devolvido; o chamado só resolve com tudo marcado e o Termo de
--      Devolução assinado anexado;
--   2. não devolvido (ou trocado) = motivo obrigatório + aviso ao gestor da pessoa, ao RH e aos donos;
--   3. conferência da TI a cada 30 dias (todo mês), com cada pessoa e o que está no nome dela;
--   4. equipamento com foto (tirada na entrega) e histórico de quem teve.
-- Também corrige um defeito antigo: o desligamento tratava QUEM ABRIU o chamado do RH como quem estava saindo.

alter type public.notification_type add value if not exists 'equipamento_pendente';

-- ─── 1. O colaborador do chamado de admissão/desligamento (não é quem abre: é de quem se trata) ───────────
alter table public.tickets add column if not exists colaborador_id uuid references public.profiles(id) on delete set null;
comment on column public.tickets.colaborador_id is
  'Admissão e desligamento do RH (2026-10-20): a pessoa que entra ou sai. Quem abre é o RH (requester_id).';

-- ─── 2. Foto do equipamento (balde privado; caminho `<empresa>/<equipamento>/<arquivo>`) ─────────────────
alter table public.assets add column if not exists foto_path text;

insert into storage.buckets (id, name, public, file_size_limit)
values ('inventario-fotos', 'inventario-fotos', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

create policy inventario_fotos_le on storage.objects for select to authenticated
  using (bucket_id = 'inventario-fotos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'inventory', 'view'));
create policy inventario_fotos_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'inventario-fotos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
              and (public.pode_no_setor('ti', 'inventory', 'edit') or public.pode_no_setor('ti', 'inventory', 'create')));
create policy inventario_fotos_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'inventario-fotos' and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and public.pode_no_setor('ti', 'inventory', 'edit'));

-- ─── 3. Histórico: quem teve o equipamento, de quando a quando ──────────────────────────────────────────
create table if not exists public.asset_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  pessoa_id uuid references public.profiles(id) on delete set null,
  de timestamptz not null default now(),
  ate timestamptz,
  registrado_por uuid references public.profiles(id) on delete set null
);
create index if not exists asset_historico_asset on public.asset_historico (asset_id, de desc);
create index if not exists asset_historico_pessoa on public.asset_historico (pessoa_id, de desc);
alter table public.asset_historico enable row level security;
create policy asset_historico_le on public.asset_historico for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'view'));
-- Só o trigger escreve.

create or replace function public.asset_registra_historico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.assigned_to is not distinct from old.assigned_to then
    return new;
  end if;
  update public.asset_historico set ate = now() where asset_id = new.id and ate is null;
  if new.assigned_to is not null then
    insert into public.asset_historico (tenant_id, asset_id, pessoa_id, registrado_por)
    values (new.tenant_id, new.id, new.assigned_to, auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.asset_registra_historico() from public, anon, authenticated;
drop trigger if exists trg_asset_registra_historico on public.assets;
create trigger trg_asset_registra_historico after insert or update of assigned_to on public.assets
  for each row execute function public.asset_registra_historico();

-- O que já está com alguém hoje começa o histórico (sem data verdadeira de entrega: usa a última atualização).
insert into public.asset_historico (tenant_id, asset_id, pessoa_id, de)
select a.tenant_id, a.id, a.assigned_to, coalesce(a.updated_at, a.created_at)
  from public.assets a
 where a.assigned_to is not null
   and not exists (select 1 from public.asset_historico h where h.asset_id = a.id);

-- ─── 4. Checagens: a devolução do desligamento e a conferência do mês ───────────────────────────────────
create table if not exists public.ti_checagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('devolucao', 'conferencia')),
  ticket_id uuid not null unique references public.tickets(id) on delete cascade,
  colaborador_id uuid references public.profiles(id) on delete set null,
  colaborador_nome text,
  referencia date,
  termo_path text,
  termo_anexado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint ti_checagem_conferencia_tem_mes check (tipo <> 'conferencia' or referencia is not null)
);
create unique index if not exists ti_checagens_um_por_mes on public.ti_checagens (tenant_id, referencia)
  where tipo = 'conferencia';
alter table public.ti_checagens enable row level security;
create policy ti_checagens_le on public.ti_checagens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'view'));

create table if not exists public.ti_checagem_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checagem_id uuid not null references public.ti_checagens(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  pessoa_id uuid references public.profiles(id) on delete set null,
  pessoa_nome text,
  descricao text not null,
  patrimonio text,
  serie text,
  situacao text check (situacao in ('ok', 'avaria', 'nao_devolvido', 'conferido', 'divergencia')),
  motivo text,
  marcado_por uuid references public.profiles(id) on delete set null,
  marcado_em timestamptz,
  constraint ti_checagem_item_motivo check (
    situacao is null or situacao in ('ok', 'conferido') or nullif(btrim(motivo), '') is not null)
);
create index if not exists ti_checagem_itens_checagem on public.ti_checagem_itens (checagem_id, pessoa_nome, descricao);
create index if not exists ti_checagem_itens_asset on public.ti_checagem_itens (asset_id);
alter table public.ti_checagem_itens enable row level security;
create policy ti_checagem_itens_le on public.ti_checagem_itens for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_no_setor('ti', 'inventory', 'view'));
-- Só as funções abaixo escrevem.

-- Quem é avisado quando algo não volta ou não bate: o gestor da pessoa, o RH e os donos (sem repetir, sem quem marcou).
create or replace function public.equipamento_avisa_pendencia(p_item uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ti_checagem_itens%rowtype;
  c public.ti_checagens%rowtype;
  v_numero int;
  v_titulo text;
begin
  select * into i from public.ti_checagem_itens where id = p_item;
  select * into c from public.ti_checagens where id = i.checagem_id;
  select ticket_number into v_numero from public.tickets where id = c.ticket_id;
  v_titulo := case when i.situacao = 'divergencia' then 'Conferência: equipamento não bate — '
                   when i.situacao = 'avaria' then 'Devolução com avaria — '
                   else 'Equipamento não devolvido — ' end || coalesce(i.pessoa_nome, 'colaborador');
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message, email_sent)
  select c.tenant_id, u, 'equipamento_pendente', 'ticket', c.ticket_id, v_titulo,
         i.descricao || coalesce(' (patrimônio ' || i.patrimonio || ')', '') || ': ' || i.motivo
           || ' — chamado #' || v_numero, false
    from (select distinct u from (
            select public.gestores_da_pessoa(i.pessoa_id) u where i.pessoa_id is not null
            union all select unnest(public.membros_do_aviso(c.tenant_id, 'rh'))
            union all select unnest(public.donos_da_empresa(c.tenant_id))) x
          where u is not null and u is distinct from auth.uid()) d;
end;
$$;
revoke all on function public.equipamento_avisa_pendencia(uuid) from public, anon, authenticated;

-- Marcar um item: o efeito no Inventário vem junto (ok → estoque; avaria → manutenção; não devolvido → segue no nome
-- da pessoa). Pode remarcar enquanto o chamado está aberto (engano acontece).
create or replace function public.ti_marcar_item(p_item uuid, p_situacao text, p_motivo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  i public.ti_checagem_itens%rowtype;
  c public.ti_checagens%rowtype;
  v_status text;
begin
  if not public.pode_no_setor('ti', 'inventory', 'edit') then
    raise exception 'Marcar equipamento pede a permissão de editar no Inventário da TI.' using errcode = '42501';
  end if;
  select * into i from public.ti_checagem_itens
   where id = p_item and tenant_id = public.get_user_tenant_id() for update;
  if i.id is null then
    raise exception 'Item não encontrado.' using errcode = '42501';
  end if;
  select * into c from public.ti_checagens where id = i.checagem_id;
  select status::text into v_status from public.tickets where id = c.ticket_id;
  if v_status in ('resolved', 'closed', 'cancelled', 'rejected') then
    raise exception 'O chamado já foi encerrado.' using errcode = '23514';
  end if;
  if (c.tipo = 'devolucao' and p_situacao not in ('ok', 'avaria', 'nao_devolvido'))
     or (c.tipo = 'conferencia' and p_situacao not in ('conferido', 'divergencia')) then
    raise exception 'Situação inválida.' using errcode = '23514';
  end if;
  if p_situacao not in ('ok', 'conferido') and nullif(btrim(p_motivo), '') is null then
    raise exception 'Diga o motivo.' using errcode = '23514';
  end if;

  update public.ti_checagem_itens
     set situacao = p_situacao, motivo = nullif(btrim(p_motivo), ''), marcado_por = auth.uid(), marcado_em = now()
   where id = i.id;

  if c.tipo = 'devolucao' and i.asset_id is not null then
    if p_situacao = 'ok' then
      update public.assets set assigned_to = null, status = 'in_stock' where id = i.asset_id;
    elsif p_situacao = 'avaria' then
      update public.assets set assigned_to = null, status = 'maintenance' where id = i.asset_id;
    else
      update public.assets set assigned_to = c.colaborador_id, status = 'in_use' where id = i.asset_id;
    end if;
  end if;

  if p_situacao in ('avaria', 'nao_devolvido', 'divergencia') and i.situacao is distinct from p_situacao then
    perform public.equipamento_avisa_pendencia(i.id);
  end if;
end;
$$;
revoke all on function public.ti_marcar_item(uuid, text, text) from public, anon;
grant execute on function public.ti_marcar_item(uuid, text, text) to authenticated;

-- O Termo de Devolução assinado (balde `ti-termos`, caminho `<empresa>/devolucoes/<checagem>/<arquivo>`). Só depois de
-- tudo marcado (o termo impresso lista a situação de cada item). Fecha os termos de responsabilidade da pessoa cujo
-- equipamento todo voltou.
create or replace function public.ti_anexar_termo_de_devolucao(p_checagem uuid, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.ti_checagens%rowtype;
begin
  if not public.pode_no_setor('ti', 'inventory', 'edit') then
    raise exception 'Anexar o termo pede a permissão de editar no Inventário da TI.' using errcode = '42501';
  end if;
  select * into c from public.ti_checagens
   where id = p_checagem and tenant_id = public.get_user_tenant_id() and tipo = 'devolucao' for update;
  if c.id is null then
    raise exception 'Devolução não encontrada.' using errcode = '42501';
  end if;
  if nullif(btrim(p_path), '') is null or split_part(p_path, '/', 1) <> c.tenant_id::text then
    raise exception 'Arquivo inválido.' using errcode = '23514';
  end if;
  if exists (select 1 from public.ti_checagem_itens where checagem_id = c.id and situacao is null) then
    raise exception 'Marque cada equipamento antes de anexar o termo de devolução.' using errcode = '23514';
  end if;
  update public.ti_checagens set termo_path = p_path, termo_anexado_em = now() where id = c.id;

  update public.ti_termos t
     set status = 'devolvido', devolvido_em = (now() at time zone 'America/Sao_Paulo')::date,
         devolucao_obs = coalesce(devolucao_obs, 'Desligamento: termo de devolução anexado no chamado.')
   where t.tenant_id = c.tenant_id and t.colaborador_id = c.colaborador_id and t.status <> 'devolvido'
     and not exists (select 1 from public.ti_termo_itens ti
                       join public.ti_checagem_itens ci on ci.asset_id = ti.asset_id and ci.checagem_id = c.id
                      where ti.termo_id = t.id and ci.situacao = 'nao_devolvido');
end;
$$;
revoke all on function public.ti_anexar_termo_de_devolucao(uuid, text) from public, anon;
grant execute on function public.ti_anexar_termo_de_devolucao(uuid, text) to authenticated;

-- A trava: chamado com checagem só resolve com tudo marcado — e a devolução, com o termo assinado.
create or replace function public.ti_checagem_trava_o_chamado()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  c public.ti_checagens%rowtype;
begin
  if new.status::text not in ('resolved', 'closed') or old.status is not distinct from new.status then
    return new;
  end if;
  select * into c from public.ti_checagens where ticket_id = new.id;
  if c.id is null then
    return new;
  end if;
  if exists (select 1 from public.ti_checagem_itens where checagem_id = c.id and situacao is null) then
    raise exception 'Não é possível resolver: marque cada equipamento da lista.' using errcode = '23514';
  end if;
  if c.tipo = 'devolucao' and c.termo_path is null
     and exists (select 1 from public.ti_checagem_itens where checagem_id = c.id) then
    raise exception 'Não é possível resolver: anexe o Termo de Devolução assinado.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.ti_checagem_trava_o_chamado() from public, anon, authenticated;
drop trigger if exists trg_ti_checagem_trava_o_chamado on public.tickets;
create trigger trg_ti_checagem_trava_o_chamado before update of status on public.tickets
  for each row execute function public.ti_checagem_trava_o_chamado();

-- ─── 5. O desligamento: o RH diz quem sai; a TI recebe equipamentos + acessos ─────────────────────────────
create or replace function public.create_offboarding_ti_ticket()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_categoria uuid;
  v_acessos text;
  v_equipamentos text;
  v_nome text;
  v_chamado uuid;
  v_checagem uuid;
begin
  if new.module <> 'rh' or new.subcategory is null or new.subcategory not ilike 'desligamento%' then
    return new;
  end if;
  if new.colaborador_id is null then
    raise exception 'Desligamento: escolha o colaborador que está saindo.' using errcode = '23514';
  end if;

  select id into v_categoria from public.ti_categories
   where tenant_id = new.tenant_id and module = 'tickets' and name = 'Demissional' and is_active limit 1;
  if v_categoria is null then
    select id into v_categoria from public.ti_categories
     where tenant_id = new.tenant_id and module = 'tickets' and (name = 'Conta AD' or name ilike 'Acesso%') limit 1;
  end if;

  select coalesce(full_name, email, 'colaborador') into v_nome from public.profiles where id = new.colaborador_id;

  select string_agg(format('• [%s] %s%s', access_type, name,
           case when nullif(details ->> 'note', '') is not null then ' — ' || (details ->> 'note') else '' end),
         E'\n' order by access_type, name)
    into v_acessos
    from public.employee_access_grants
   where tenant_id = new.tenant_id and employee_id = new.colaborador_id and revoked_at is null;

  select string_agg(format('• %s%s', name, coalesce(' — patrimônio ' || asset_tag, '')), E'\n' order by name)
    into v_equipamentos
    from public.assets where tenant_id = new.tenant_id and assigned_to = new.colaborador_id;

  insert into public.tickets (tenant_id, module, title, description, category_id, priority, status,
                              requester_id, created_by, colaborador_id)
  values (new.tenant_id, 'tickets', 'Desligamento — devolver equipamentos e acessos — ' || v_nome,
          format(E'Gerado pelo desligamento (chamado RH #%s).\n\nColaborador: %s\n\nEquipamentos no nome da pessoa (marque cada um no painel "Devolução de equipamentos"):\n%s\n\nAcessos a revogar:\n%s',
                 new.ticket_number, v_nome,
                 coalesce(v_equipamentos, '(nenhum equipamento no nome da pessoa no Inventário)'),
                 coalesce(v_acessos, '(nenhum acesso registrado na admissão — confira com o RH)')),
          v_categoria, 'high', 'open', new.requester_id, new.created_by, new.colaborador_id)
  returning id into v_chamado;

  insert into public.ti_checagens (tenant_id, tipo, ticket_id, colaborador_id, colaborador_nome)
  values (new.tenant_id, 'devolucao', v_chamado, new.colaborador_id, v_nome)
  returning id into v_checagem;

  insert into public.ti_checagem_itens (tenant_id, checagem_id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie)
  select new.tenant_id, v_checagem, a.id, new.colaborador_id, v_nome,
         a.name || coalesce(' — ' || nullif(btrim(concat_ws(' ', a.manufacturer, a.model)), ''), ''),
         a.asset_tag, a.serial_number
    from public.assets a where a.tenant_id = new.tenant_id and a.assigned_to = new.colaborador_id;

  update public.employee_access_grants set revoke_ticket_id = v_chamado, updated_at = now()
   where tenant_id = new.tenant_id and employee_id = new.colaborador_id and revoked_at is null;
  return new;
end;
$$;

-- ─── 6. A conferência do mês: um chamado da TI com cada pessoa e o que está no nome dela ─────────────────
create or replace function public.ti_abrir_conferencia_do_mes()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_rotulo text := to_char(v_mes, 'MM/YYYY');
  t record;
  v_dono uuid;
  v_chamado uuid;
  v_checagem uuid;
  n int := 0;
begin
  for t in
    select distinct a.tenant_id from public.assets a
     where a.assigned_to is not null
       and not exists (select 1 from public.ti_checagens c
                        where c.tenant_id = a.tenant_id and c.tipo = 'conferencia' and c.referencia = v_mes)
  loop
    v_dono := (public.donos_da_empresa(t.tenant_id))[1];
    if v_dono is null then
      continue;
    end if;
    insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, created_by)
    values (t.tenant_id, 'tickets', 'Conferência de equipamentos — ' || v_rotulo,
            E'Conferência mensal (automática). Confira com cada pessoa se o equipamento no nome dela está com ela — '
            || E'patrimônio e número de série batendo — e marque no painel "Conferência de equipamentos".\n'
            || E'Divergência (trocado, sumido, levado para casa) pede o motivo e avisa o gestor da pessoa, o RH e a diretoria.',
            'medium', 'open', v_dono, v_dono)
    returning id into v_chamado;
    insert into public.ti_checagens (tenant_id, tipo, ticket_id, referencia)
    values (t.tenant_id, 'conferencia', v_chamado, v_mes) returning id into v_checagem;
    insert into public.ti_checagem_itens (tenant_id, checagem_id, asset_id, pessoa_id, pessoa_nome, descricao, patrimonio, serie)
    select a.tenant_id, v_checagem, a.id, a.assigned_to, coalesce(p.full_name, p.email),
           a.name || coalesce(' — ' || nullif(btrim(concat_ws(' ', a.manufacturer, a.model)), ''), ''),
           a.asset_tag, a.serial_number
      from public.assets a left join public.profiles p on p.id = a.assigned_to
     where a.tenant_id = t.tenant_id and a.assigned_to is not null;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.ti_abrir_conferencia_do_mes() from public, anon, authenticated;

-- 08:00 no Brasil (11:00 UTC), todo dia: abre a do mês se ainda não existe (no dia 1º, ou no primeiro dia em que
-- houver equipamento com alguém).
select cron.unschedule('ti-conferencia-do-mes') where exists (select 1 from cron.job where jobname = 'ti-conferencia-do-mes');
select cron.schedule('ti-conferencia-do-mes', '0 11 * * *', $cron$select public.ti_abrir_conferencia_do_mes()$cron$);
