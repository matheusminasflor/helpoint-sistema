-- CATEGORIAS EM TRÊS NÍVEIS (dono, 2026-10-13: "Software › Forteplus › Cadastro de Clientes e Dúvidas /
-- Correções e Ajustes"). Decisões (múltipla escolha, as recomendadas): até TRÊS níveis (categoria ›
-- subcategoria › item) e para aí; quando a subcategoria tem itens, escolher um é obrigatório (na tela); o
-- item herda do mais próximo acima o que não tem (responsáveis, "é compra").
--
-- O chamado continua guardando `category` = a categoria principal e `subcategory` = o resto do caminho
-- ("Forteplus › Correções e Ajustes"), e `category_id` = o nível mais fundo escolhido.

-- ─── 1. No máximo três níveis, e o filho no mesmo setor do pai ───────────────────────────────────
create or replace function public.categoria_no_maximo_tres_niveis()
returns trigger language plpgsql set search_path = public as $$
declare p public.ti_categories%rowtype;
begin
  if new.parent_id is null then return new; end if;
  select * into p from public.ti_categories where id = new.parent_id;
  if p.parent_id is not null and exists (select 1 from public.ti_categories where id = p.parent_id and parent_id is not null) then
    raise exception 'As categorias vão até três níveis (categoria › subcategoria › item): o item não ganha outro nível dentro.'
      using errcode = '23514';
  end if;
  if p.module is distinct from new.module then
    raise exception 'A subcategoria fica no mesmo setor da categoria de cima.' using errcode = '23514';
  end if;
  -- Quem já tem filhos não pode descer para um nível em que os filhos passariam do terceiro.
  if p.parent_id is not null and exists (select 1 from public.ti_categories where parent_id = new.id) then
    raise exception 'Esta categoria tem itens dentro: no nível de item ela os levaria para um quarto nível.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.categoria_no_maximo_tres_niveis() from public, anon, authenticated;
drop trigger if exists trg_categoria_no_maximo_tres_niveis on public.ti_categories;
create trigger trg_categoria_no_maximo_tres_niveis before insert or update of parent_id, module on public.ti_categories
  for each row execute function public.categoria_no_maximo_tres_niveis();

-- ─── 2. O caminho de uma categoria: a principal e o resto ("Forteplus › Correções e Ajustes") ────
create or replace function public.caminho_da_categoria(p_categoria uuid, out principal text, out resto text)
language sql stable set search_path = public as $$
  select coalesce(a.name, p.name, c.name),
         case when a.id is not null then p.name || ' › ' || c.name when p.id is not null then c.name end
    from public.ti_categories c
    left join public.ti_categories p on p.id = c.parent_id
    left join public.ti_categories a on a.id = p.parent_id
   where c.id = p_categoria;
$$;
revoke all on function public.caminho_da_categoria(uuid) from public, anon;
grant execute on function public.caminho_da_categoria(uuid) to authenticated;

-- ─── 3. Responsáveis: os da própria categoria; sem eles, os do nível de cima mais próximo ────────
create or replace function public.responsaveis_da_categoria(p_category uuid)
returns table(id uuid, full_name text)
language sql stable security definer set search_path to 'public' as $$
  with alvo as (
    select c.id, c.parent_id, c.module, c.tenant_id
      from public.ti_categories c
     where c.id = p_category
       and c.tenant_id = coalesce(public.get_user_tenant_id(), c.tenant_id)
  ), acima as (
    -- 0 = a própria, 1 = a de cima, 2 = a de cima da de cima.
    select alvo.id as category_id, 0 as nivel from alvo
    union all select alvo.parent_id, 1 from alvo where alvo.parent_id is not null
    union all select p.parent_id, 2 from alvo join public.ti_categories p on p.id = alvo.parent_id where p.parent_id is not null
  ), vinculos as (
    select r.user_id, r.category_id
      from public.ti_category_responsaveis r join acima a on a.category_id = r.category_id
     where a.nivel = (select min(a2.nivel) from acima a2
                       where exists (select 1 from public.ti_category_responsaveis r2 where r2.category_id = a2.category_id))
  ), efetivos as (
    select case when f.aus is null then v.user_id else s.substituto_id end as user_id
      from vinculos v
      cross join lateral (select public.ausencia_de_hoje(v.user_id) as aus) f
      left join public.ferias_substitutos s on s.ausencia_id = f.aus and s.category_id = v.category_id
     where f.aus is null or s.substituto_id is not null
  )
  select p.id, p.full_name
    from public.profiles p
    join alvo on p.tenant_id = alvo.tenant_id
   where p.id in (select user_id from efetivos)
     and coalesce(p.is_active, true)
     and public.ausencia_de_hoje(p.id) is null
     and exists (select 1 from public.user_module_access m
                  where m.user_id = p.id and m.module = public.setor_do_modulo(alvo.module))
   order by coalesce(p.full_name, p.email);
$$;

-- ─── 4. Transferir com o caminho inteiro ─────────────────────────────────────────────────────────
create or replace function public.transferir_chamado(p_ticket uuid, p_para uuid, p_modulo text, p_categoria_id uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  t public.tickets%rowtype;
  v_cat public.ti_categories%rowtype;
  v_caminho record;
  v_para text;
  v_de_setor text;
  v_para_setor text;
begin
  if auth.uid() is null then
    raise exception 'Entre no sistema para transferir o chamado.' using errcode = '42501';
  end if;

  select * into t from public.tickets
   where id = p_ticket and tenant_id = public.get_user_tenant_id()
   for update;
  if not found then
    raise exception 'Chamado não encontrado.' using errcode = '42501';
  end if;

  if t.module = 'compras' or p_modulo = 'compras' then
    raise exception 'Chamado de Compras não muda de setor: ele tem orçamentos e aprovação próprios.'
      using errcode = '22023';
  end if;
  if t.status::text in ('resolved', 'closed', 'cancelled', 'rejected') then
    raise exception 'Chamado encerrado não muda de setor. Reabra antes de transferir.' using errcode = '22023';
  end if;
  if not public.pode_no_chamado(t.module, 'transfer') then
    raise exception 'Seu perfil de acesso não permite transferir este chamado.' using errcode = '42501';
  end if;
  if p_modulo is not distinct from t.module then
    raise exception 'A pessoa já é do setor do chamado: transfira sem mudar de setor.' using errcode = '22023';
  end if;
  if p_para is null or not (p_modulo = any (public.setores_para_transferir(p_para))) then
    raise exception 'Essa pessoa não atende o setor %.', public.nome_do_setor_do_chamado(p_modulo)
      using errcode = '22023';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo da transferência.' using errcode = '22023';
  end if;

  select * into v_cat from public.ti_categories c
   where c.id = p_categoria_id and c.tenant_id = t.tenant_id and c.module = p_modulo
     and coalesce(c.is_active, true);
  if not found then
    raise exception 'A categoria tem de ser do setor %.', public.nome_do_setor_do_chamado(p_modulo)
      using errcode = '23514';
  end if;
  select * into v_caminho from public.caminho_da_categoria(v_cat.id);

  update public.tickets
     set module = p_modulo,
         category_id = v_cat.id,
         category = v_caminho.principal,
         subcategory = v_caminho.resto,
         assigned_to = p_para
   where id = t.id;

  select coalesce(full_name, email) into v_para from public.profiles where id = p_para;
  v_de_setor := public.nome_do_setor_do_chamado(t.module);
  v_para_setor := public.nome_do_setor_do_chamado(p_modulo);
  insert into public.ticket_comments (tenant_id, ticket_id, author_id, content, is_internal)
  values (t.tenant_id, t.id, auth.uid(),
          format('Transferido de %s para %s — para %s. Categoria: %s. Motivo: %s',
                 v_de_setor, v_para_setor, coalesce(v_para, 'outra pessoa'),
                 v_caminho.principal || coalesce(' › ' || v_caminho.resto, ''),
                 btrim(p_motivo)),
          true);
  return t.id;
end;
$$;

-- ─── 5. Férias: o nome da categoria com o caminho inteiro ────────────────────────────────────────
create or replace function public.ferias_demandas(p_vacation uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  a record;
begin
  if not public.pode_repassar_ferias(p_vacation) then
    raise exception 'Só quem recebe o aviso de ausência do setor (ou um administrador) repassa estas demandas.' using errcode = '42501';
  end if;
  select * into a from public.ausencias_que_repassam where id = p_vacation;
  return jsonb_build_object(
    'pessoa', (select jsonb_build_object('id', p.id, 'nome', coalesce(p.full_name, p.email)) from public.profiles p where p.id = a.user_id),
    'inicio', a.inicio, 'fim', a.fim, 'tipo', public.rotulo_da_ausencia(a.tipo),
    'chamados', coalesce((
      select jsonb_agg(jsonb_build_object('id', t.id, 'numero', t.ticket_number, 'titulo', t.title, 'modulo', t.module)
                       order by t.created_at)
        from public.tickets t
       where t.assigned_to = a.user_id and t.tenant_id = a.tenant_id
         and t.status in ('open', 'in_progress', 'waiting_user', 'waiting_parts', 'scheduled')), '[]'::jsonb),
    'categorias', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'nome', k.principal || coalesce(' › ' || k.resto, ''),
                                          'modulo', c.module, 'substituto', s.substituto_id)
                       order by c.module, k.principal, k.resto nulls first)
        from public.ti_category_responsaveis r
        join public.ti_categories c on c.id = r.category_id
        cross join lateral public.caminho_da_categoria(c.id) k
        left join public.ferias_substitutos s on s.ausencia_id = a.id and s.category_id = c.id
       where r.user_id = a.user_id), '[]'::jsonb));
end;
$$;
