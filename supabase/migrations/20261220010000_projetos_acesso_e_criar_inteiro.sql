-- PROJETOS: O ERRO DO MODELO, QUEM VÊ, QUEM EDITA, PESSOA DO SETOR E CRIAR INTEIRO (dono, 2026-10-09).
--
-- 1. "Ao tentar criar um projeto com modelo está dando erro: DELETE requires a WHERE clause."
--    `projeto_copiar_estrutura` limpava as tabelas temporárias com `delete` sem `where`. Pelo psql (pgTAP)
--    passa; pela tela, o PostgREST carrega o `safeupdate` (role `authenticator`) e recusa. Também
--    derrubava "Salvar como modelo". O teste novo carrega o `safeupdate` para andar pela mesma porta.
-- 2. Decisões (múltipla escolha):
--    - EDITAR e EXCLUIR atividade: só o setor dela — quem é do setor e está no projeto, ou o gestor do
--      setor que está no projeto. O dono do projeto e o administrador deixam de mexer em atividade de
--      outro setor (continuam cuidando de briefing, fases e setores);
--    - VER o projeto: só a equipe + Diretoria. O gestor de setor marcado e o administrador que não estão
--      no projeto deixam de ver;
--    - PESSOAS: a pessoa escolhida do setor e o responsável da atividade são sempre DO setor;
--    - CRIAR: 1 A ideia → 2 Setores e pessoas → 3 Atividades (as do modelo, já editadas) → Criar. Nada é
--      gravado antes; o projeto nasce inteiro numa chamada só (`criar_projeto`).

-- ─── 1. A cópia do modelo sem `delete` nu ────────────────────────────────────────────────────────
create or replace function public.projeto_copiar_estrutura(p_de uuid, p_para uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.projects where id = p_para;
  create temporary table if not exists _mapa_fase (velho uuid, novo uuid) on commit drop;
  create temporary table if not exists _mapa_tarefa (velho uuid, novo uuid) on commit drop;
  -- `where true`: o `safeupdate` do PostgREST recusa delete sem where (o erro que o dono viu).
  delete from _mapa_fase where true; delete from _mapa_tarefa where true;
  insert into _mapa_fase select id, gen_random_uuid() from public.project_fases where project_id = p_de;
  insert into public.project_fases (id, tenant_id, project_id, nome, ordem, created_by)
  select m.novo, v_tenant, p_para, f.nome, f.ordem, auth.uid()
    from public.project_fases f join _mapa_fase m on m.velho = f.id;
  insert into _mapa_tarefa select id, gen_random_uuid() from public.tasks where project_id = p_de;
  insert into public.tasks (id, tenant_id, project_id, title, description, setor, fase_id, status, position, priority)
  select m.novo, v_tenant, p_para, t.title, t.description, t.setor, mf.novo, 'pending', t.position, coalesce(t.priority, 3)
    from public.tasks t join _mapa_tarefa m on m.velho = t.id left join _mapa_fase mf on mf.velho = t.fase_id;
  update public.tasks t set depende_de = md.novo
    from public.tasks v join _mapa_tarefa mv on mv.velho = v.id join _mapa_tarefa md on md.velho = v.depende_de
   where t.id = mv.novo and v.depende_de is not null;
  insert into public.project_setores (tenant_id, project_id, setor)
  select v_tenant, p_para, s.setor from public.project_setores s where s.project_id = p_de
  on conflict (project_id, setor) do nothing;
end;
$$;

-- ─── 2. Quem vê: a equipe + Diretoria ────────────────────────────────────────────────────────────
create or replace function public.ve_todos_os_projetos(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_module_access m where m.user_id = p_user and m.module = 'diretoria');
$$;

create or replace function public.project_visivel(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.project_participa(p_project)
      or exists (
        select 1 from public.projects p
         where p.id = p_project and p.tenant_id = public.get_user_tenant_id()
           and (public.ve_todos_os_projetos(auth.uid()) or p.e_modelo));
$$;

-- A @menção só avisa quem enxerga o projeto — a mesma régua, perguntada sobre outra pessoa.
create or replace function public.atividade_avisa_mencao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_task public.tasks%rowtype;
  v_proj public.projects%rowtype;
  v_pessoa uuid;
begin
  if new.sistema or coalesce(cardinality(new.mencionados), 0) = 0 then return new; end if;
  select * into v_task from public.tasks where id = new.task_id;
  select * into v_proj from public.projects where id = v_task.project_id;
  if v_proj.id is null or v_proj.e_modelo then return new; end if;

  foreach v_pessoa in array array(select distinct unnest(new.mencionados)) loop
    continue when v_pessoa = new.autor_id;
    continue when not coalesce((
      select exists (select 1 from public.profiles p where p.id = v_pessoa and p.tenant_id = v_proj.tenant_id and p.is_active)
         and (exists (select 1 from public.project_members m where m.project_id = v_proj.id and m.user_id = v_pessoa)
              or v_proj.owner_id = v_pessoa
              or public.ve_todos_os_projetos(v_pessoa))
    ), false);
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    values (v_proj.tenant_id, v_pessoa, 'mention', 'project', v_proj.id,
            v_proj.name || ' · ' || v_task.title, left(new.texto, 140));
  end loop;
  return new;
end;
$$;

-- ─── 3. Quem edita e exclui atividade: só o setor dela ───────────────────────────────────────────
create or replace function public.pode_planejar_setor(p_project uuid, p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_setores s where s.project_id = p_project and s.setor = p_setor)
     and public.project_participa(p_project)
     and (public.pessoa_do_setor(auth.uid(), p_setor) or public.gestor_do_setor(auth.uid(), p_setor));
$$;

-- ─── 4. Pessoa do setor: a escolhida no setor e o responsável da atividade ───────────────────────
create or replace function public.projeto_pessoa_e_do_setor()
returns trigger language plpgsql set search_path = public as $$
declare v_pessoa uuid; v_setor text;
begin
  if tg_table_name = 'project_setores' then
    v_pessoa := new.referencia_id; v_setor := new.setor;
  else
    if new.project_id is null then return new; end if;
    v_pessoa := new.user_id; v_setor := new.setor;
  end if;
  if v_pessoa is not null and v_setor is not null and not public.pessoa_do_setor(v_pessoa, v_setor) then
    raise exception 'Escolha alguém do setor %: no projeto, cada setor responde pelas próprias atividades.', v_setor
      using errcode = '23514', constraint = 'projeto_pessoa_do_setor';
  end if;
  return new;
end;
$$;
revoke all on function public.projeto_pessoa_e_do_setor() from public, anon, authenticated;

drop trigger if exists trg_projeto_referencia_do_setor on public.project_setores;
create trigger trg_projeto_referencia_do_setor before insert or update of referencia_id, setor on public.project_setores
  for each row execute function public.projeto_pessoa_e_do_setor();
drop trigger if exists trg_atividade_responsavel_do_setor on public.tasks;
create trigger trg_atividade_responsavel_do_setor before insert or update of user_id, setor on public.tasks
  for each row execute function public.projeto_pessoa_e_do_setor();

-- ─── 5. Criar o projeto inteiro de uma vez ───────────────────────────────────────────────────────
-- p_setores: [{"setor": "marketing", "referencia_id": "<uuid>"}] — pessoa obrigatória e do setor.
-- p_fases:   [{"nome": "Briefing", "atividades": [{"titulo": "...", "setor": "marketing", "descricao": "..."}]}]
-- A atividade só pode ser de um setor marcado. Os avisos e e-mails saem pelos gatilhos de sempre.
create or replace function public.criar_projeto(p_nome text, p_objetivo text, p_entrega date, p_setores jsonb, p_fases jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_id uuid;
  v_fase uuid;
  v_marcados text[];
  s jsonb; f record; a record;
begin
  if v_tenant is null or auth.uid() is null then
    raise exception 'Entre no sistema para criar um projeto.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'Dê um nome ao projeto.' using errcode = '22023';
  end if;
  if jsonb_typeof(p_setores) is distinct from 'array' or jsonb_array_length(p_setores) = 0 then
    raise exception 'Marque pelo menos um setor.' using errcode = '22023';
  end if;
  select array_agg(x->>'setor') into v_marcados from jsonb_array_elements(p_setores) x;

  insert into public.projects (tenant_id, name, description, status, owner_id, created_by, due_date)
  values (v_tenant, btrim(p_nome), nullif(btrim(coalesce(p_objetivo, '')), ''), 'active', auth.uid(), auth.uid(), p_entrega)
  returning id into v_id;

  for s in select * from jsonb_array_elements(p_setores) loop
    if nullif(s->>'referencia_id', '') is null then
      raise exception 'Escolha a pessoa do setor %.', s->>'setor' using errcode = '22023';
    end if;
    insert into public.project_setores (tenant_id, project_id, setor, referencia_id)
    values (v_tenant, v_id, s->>'setor', (s->>'referencia_id')::uuid);
  end loop;

  for f in select value as fase, ordinality as ordem from jsonb_array_elements(coalesce(p_fases, '[]'::jsonb)) with ordinality loop
    insert into public.project_fases (tenant_id, project_id, nome, ordem, created_by)
    values (v_tenant, v_id, btrim(f.fase->>'nome'), f.ordem, auth.uid())
    returning id into v_fase;
    for a in select value as atv, ordinality as pos
               from jsonb_array_elements(coalesce(f.fase->'atividades', '[]'::jsonb)) with ordinality loop
      if coalesce(btrim(a.atv->>'titulo'), '') = '' then continue; end if;
      if not (a.atv->>'setor' = any (v_marcados)) then
        raise exception 'A atividade "%" é de um setor que não está marcado.', a.atv->>'titulo' using errcode = '22023';
      end if;
      insert into public.tasks (tenant_id, project_id, fase_id, title, description, setor, status, position, priority)
      values (v_tenant, v_id, v_fase, btrim(a.atv->>'titulo'), nullif(btrim(coalesce(a.atv->>'descricao', '')), ''),
              a.atv->>'setor', 'pending', f.ordem * 1000 + a.pos, 3);
    end loop;
  end loop;
  return v_id;
end;
$$;
revoke all on function public.criar_projeto(text, text, date, jsonb, jsonb) from public, anon;
grant execute on function public.criar_projeto(text, text, date, jsonb, jsonb) to authenticated;

-- ─── 6. As pessoas e os setores delas, para a tela ───────────────────────────────────────────────
-- A mesma régua de `pessoa_do_setor` (perfil, módulo e perfil de acesso), com a TI como 'ti'.
create or replace function public.pessoas_e_setores()
returns table (id uuid, nome text, setores text[])
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(p.full_name, p.email),
         array(select case x when 'tickets' then 'ti' else x end from unnest(public.setores_da_pessoa(p.id)) x)
    from public.profiles p
   where p.tenant_id = public.get_user_tenant_id() and coalesce(p.is_active, true)
   order by coalesce(p.full_name, p.email);
$$;
revoke all on function public.pessoas_e_setores() from public, anon;
grant execute on function public.pessoas_e_setores() to authenticated;
