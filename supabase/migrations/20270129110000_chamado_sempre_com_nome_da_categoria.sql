-- O chamado #142 apareceu "sem categoria" (dono, 2026-10-20). Ele tinha o `category_id`, mas não o nome: a tela mostra
-- `category`/`subcategory`, que só o formulário preenchia. Todo chamado aberto pelo banco — automação
-- (`automation_ticket_do_passo`), RH, Compras, cadastro do Comercial, desligamento — gravava só o id.
-- Regra: o banco escreve o nome a partir do id, venha o chamado de onde vier. Mesmo formato do formulário:
-- `category` = a categoria principal; `subcategory` = o resto do caminho com " › " ("Forteplus › Correções e Ajustes").

create or replace function public.chamado_nome_da_categoria()
returns trigger language plpgsql set search_path = public as $$
declare
  v_caminho text[];
begin
  if new.category_id is null then
    return new;
  end if;
  -- No INSERT só preenche o que veio vazio; no UPDATE, quando o id mudou e o nome não acompanhou.
  if tg_op = 'INSERT' and new.category is not null then
    return new;
  end if;
  if tg_op = 'UPDATE' and (new.category_id is not distinct from old.category_id
                           or new.category is distinct from old.category) then
    return new;
  end if;

  with recursive acima as (
    select c.id, c.name, c.parent_id, 0 as nivel from public.ti_categories c where c.id = new.category_id
    union all
    select p.id, p.name, p.parent_id, a.nivel + 1 from public.ti_categories p join acima a on p.id = a.parent_id
  )
  select array_agg(name order by nivel desc) into v_caminho from acima;

  if v_caminho is null then
    return new;
  end if;
  new.category := v_caminho[1];
  new.subcategory := nullif(array_to_string(v_caminho[2:], ' › '), '');
  return new;
end;
$$;

drop trigger if exists trg_chamado_nome_da_categoria on public.tickets;
create trigger trg_chamado_nome_da_categoria
  before insert or update of category_id on public.tickets
  for each row execute function public.chamado_nome_da_categoria();

-- Os que já nasceram assim (o #142, da automação da Silvana).
with recursive acima as (
  select t.id as ticket_id, c.id, c.name, c.parent_id, 0 as nivel
    from public.tickets t join public.ti_categories c on c.id = t.category_id
   where t.category is null
  union all
  select a.ticket_id, p.id, p.name, p.parent_id, a.nivel + 1
    from public.ti_categories p join acima a on p.id = a.parent_id
), caminho as (
  select ticket_id, array_agg(name order by nivel desc) as nomes from acima group by ticket_id
)
update public.tickets t
   set category = c.nomes[1], subcategory = nullif(array_to_string(c.nomes[2:], ' › '), '')
  from caminho c where c.ticket_id = t.id;

-- A conferência do mês (20270129100000) também nascia sem categoria: entra em Hardware (dono, 2026-10-20).
create or replace function public.ti_abrir_conferencia_do_mes()
returns int language plpgsql security definer set search_path = public as $$
declare
  v_mes date := date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date;
  v_rotulo text := to_char(v_mes, 'MM/YYYY');
  t record;
  v_dono uuid;
  v_categoria uuid;
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
    select id into v_categoria from public.ti_categories
     where tenant_id = t.tenant_id and module = 'tickets' and parent_id is null and is_active and name = 'Hardware'
     limit 1;
    insert into public.tickets (tenant_id, module, title, description, category_id, priority, status, requester_id, created_by)
    values (t.tenant_id, 'tickets', 'Conferência de equipamentos — ' || v_rotulo,
            E'Conferência mensal (automática). Confira com cada pessoa se o equipamento no nome dela está com ela — '
            || E'patrimônio e número de série batendo — e marque no painel "Conferência de equipamentos".\n'
            || E'Divergência (trocado, sumido, levado para casa) pede o motivo e avisa o gestor da pessoa, o RH e a diretoria.',
            v_categoria, 'medium', 'open', v_dono, v_dono)
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
