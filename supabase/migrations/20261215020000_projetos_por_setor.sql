-- PROJETOS POR SETOR (decisões do dono, 2026-10-07). Plano: docs/plano-projetos.md; especificação:
-- docs/especificacao-projetos.md.
--
-- O projeto nasce do BRIEFING (objetivo = `description`, entrega = `due_date`) e dos SETORES envolvidos;
-- cada setor planeja as SUAS atividades e escolhe a fase (fases compartilhadas). A atividade é uma linha
-- de `tasks` com `project_id` (decisão de 2026-09-13, mantida): assim ela já aparece no "Comece por" da
-- Home, na Lyra e nos relatórios de produtividade.

-- ─── 1. Colunas e tabelas ─────────────────────────────────────────────────────────────────────
alter table public.projects add column if not exists e_modelo boolean not null default false;
comment on column public.projects.description is 'O briefing: a ideia e o objetivo do projeto.';
comment on column public.projects.e_modelo is 'Modelo de projeto (fases e atividades sugeridas por setor, sem datas e pessoas).';

create table if not exists public.project_setores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  project_id uuid not null,
  setor text not null check (setor in ('ti','marketing','comercial','rh','financeiro','producao','expedicao','educacional','qualidade','compras')),
  referencia_id uuid,
  avisado_em timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint project_setores_project_fkey foreign key (project_id, tenant_id) references public.projects (id, tenant_id) on delete cascade,
  constraint project_setores_ref_fkey foreign key (referencia_id, tenant_id) references public.profiles (id, tenant_id) on delete set null (referencia_id),
  constraint project_setores_uma_vez unique (project_id, setor)
);
comment on table public.project_setores is 'Setores envolvidos no projeto. "Planejou" é derivado: o setor tem atividade no projeto.';

create table if not exists public.project_fases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  project_id uuid not null,
  nome text not null check (length(btrim(nome)) > 0),
  ordem numeric not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint project_fases_id_tenant_key unique (id, tenant_id),
  constraint project_fases_project_fkey foreign key (project_id, tenant_id) references public.projects (id, tenant_id) on delete cascade
);
create index if not exists project_fases_project_idx on public.project_fases (project_id, ordem);

alter table public.tasks
  add column if not exists fase_id uuid,
  add column if not exists setor text,
  add column if not exists link text,
  add column if not exists fator_externo text,
  add column if not exists depende_de uuid references public.tasks(id) on delete set null,
  add column if not exists percentual integer not null default 0,
  add column if not exists inicio date,
  add column if not exists termino date;
alter table public.tasks drop constraint if exists tasks_percentual_check;
alter table public.tasks add constraint tasks_percentual_check check (percentual between 0 and 100);
alter table public.tasks drop constraint if exists tasks_setor_check;
alter table public.tasks add constraint tasks_setor_check
  check (setor is null or setor in ('ti','marketing','comercial','rh','financeiro','producao','expedicao','educacional','qualidade','compras'));
alter table public.tasks drop constraint if exists tasks_periodo_check;
alter table public.tasks add constraint tasks_periodo_check check (termino is null or inicio is null or termino >= inicio);
alter table public.tasks drop constraint if exists tasks_fase_fkey;
alter table public.tasks add constraint tasks_fase_fkey foreign key (fase_id, tenant_id)
  references public.project_fases (id, tenant_id) on delete set null (fase_id);
create index if not exists tasks_fase_idx on public.tasks (fase_id);
create index if not exists tasks_depende_idx on public.tasks (depende_de);

create table if not exists public.task_comentarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  autor_id uuid default auth.uid(),
  texto text not null check (length(btrim(texto)) > 0),
  -- Linha escrita pelo histórico (trigger), não por uma pessoa.
  sistema boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists task_comentarios_task_idx on public.task_comentarios (task_id, created_at);

create table if not exists public.project_anexos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  project_id uuid not null,
  task_id uuid references public.tasks(id) on delete cascade,
  nome text not null,
  caminho text not null unique,
  tamanho bigint,
  enviado_por uuid default auth.uid(),
  created_at timestamptz not null default now(),
  constraint project_anexos_project_fkey foreign key (project_id, tenant_id) references public.projects (id, tenant_id) on delete cascade
);

-- ─── 2. Uma regra só de permissão ─────────────────────────────────────────────────────────────
-- Diretoria = módulo Diretoria (ou dono/admin). NÃO o cargo de gerente: gestor que não participa não vê
-- (teste projetos_e_quadro, pedido do dono de 2026-09-13).
create or replace function public.ve_todos_os_projetos(p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(p_user)
      or exists (select 1 from public.user_module_access m where m.user_id = p_user and m.module = 'diretoria');
$$;

create or replace function public.pessoa_do_setor(p_user uuid, p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select (case p_setor when 'ti' then 'tickets' else p_setor end) = any (public.setores_da_pessoa(p_user));
$$;

-- Gestor do setor = a caixinha "Transferir" do perfil do setor — a mesma que já define quem gere a fila.
create or replace function public.gestor_do_setor(p_user uuid, p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.tem_permissao(p_user, p_setor, 'tickets', 'transfer');
$$;

create or replace function public.pode_editar_projeto(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
     where p.id = p_project and p.tenant_id = public.get_user_tenant_id()
       and (p.owner_id = auth.uid() or public.is_admin_or_higher(auth.uid())));
$$;

-- Planejar o setor no projeto: quem edita o projeto; ou, com o setor envolvido, o gestor dele ou a pessoa do
-- setor que está na equipe.
create or replace function public.pode_planejar_setor(p_project uuid, p_setor text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_editar_projeto(p_project)
      or (exists (select 1 from public.project_setores s where s.project_id = p_project and s.setor = p_setor)
          and (public.gestor_do_setor(auth.uid(), p_setor)
               or (public.project_participa(p_project) and public.pessoa_do_setor(auth.uid(), p_setor))));
$$;

-- Visível: equipe; quem vê todos; modelo (todos da empresa usam); referência ou gestor de setor envolvido
-- (senão o setor não consegue planejar). `create or replace` mantém a ACL.
create or replace function public.project_visivel(p_project uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.project_participa(p_project)
      or exists (
        select 1 from public.projects p
         where p.id = p_project and p.tenant_id = public.get_user_tenant_id()
           and (public.ve_todos_os_projetos(auth.uid())
                or p.e_modelo
                or exists (select 1 from public.project_setores s
                            where s.project_id = p.id
                              and (s.referencia_id = auth.uid() or public.gestor_do_setor(auth.uid(), s.setor)))));
$$;

revoke all on function public.ve_todos_os_projetos(uuid) from public, anon;
revoke all on function public.pessoa_do_setor(uuid, text) from public, anon;
revoke all on function public.gestor_do_setor(uuid, text) from public, anon;
revoke all on function public.pode_editar_projeto(uuid) from public, anon;
revoke all on function public.pode_planejar_setor(uuid, text) from public, anon;
grant execute on function public.ve_todos_os_projetos(uuid) to authenticated;
grant execute on function public.pessoa_do_setor(uuid, text) to authenticated;
grant execute on function public.gestor_do_setor(uuid, text) to authenticated;
grant execute on function public.pode_editar_projeto(uuid) to authenticated;
grant execute on function public.pode_planejar_setor(uuid, text) to authenticated;

-- ─── 3. RLS ───────────────────────────────────────────────────────────────────────────────────
alter table public.project_setores enable row level security;
alter table public.project_fases enable row level security;
alter table public.task_comentarios enable row level security;
alter table public.project_anexos enable row level security;
revoke all on public.project_setores, public.project_fases, public.task_comentarios, public.project_anexos from anon;

create policy project_setores_le on public.project_setores for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.project_visivel(project_id));
create policy project_setores_dono on public.project_setores for all to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_projeto(project_id))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_projeto(project_id));

create policy project_fases_le on public.project_fases for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.project_visivel(project_id));
-- Criar fase: quem pode planejar algum setor do projeto (o setor que não acha fase cria uma).
create policy project_fases_cria on public.project_fases for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
    and (public.pode_editar_projeto(project_id)
         or exists (select 1 from public.project_setores s
                     where s.project_id = project_fases.project_id
                       and public.pode_planejar_setor(s.project_id, s.setor))));
-- Renomear, reordenar e apagar: só quem edita o projeto. `with check` repete o `using` (lição 15).
create policy project_fases_dono_altera on public.project_fases for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_projeto(project_id))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_projeto(project_id));
create policy project_fases_dono_apaga on public.project_fases for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_editar_projeto(project_id));

-- Comentário: lê quem vê a atividade; escreve quem vê o projeto, em nome próprio (nunca como "sistema").
create policy task_comentarios_le on public.task_comentarios for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
     and exists (select 1 from public.tasks t where t.id = task_id and t.project_id is not null
                   and public.project_visivel(t.project_id)));
create policy task_comentarios_escreve on public.task_comentarios for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and autor_id = auth.uid() and not sistema
     and exists (select 1 from public.tasks t where t.id = task_id and t.project_id is not null
                   and public.project_visivel(t.project_id)));
create policy task_comentarios_apaga_o_seu on public.task_comentarios for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and autor_id = auth.uid() and not sistema);

create policy project_anexos_le on public.project_anexos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.project_visivel(project_id));
create policy project_anexos_envia on public.project_anexos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and enviado_por = auth.uid()
    and public.project_visivel(project_id));
create policy project_anexos_apaga on public.project_anexos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
    and (enviado_por = auth.uid() or public.pode_editar_projeto(project_id)));

-- O projeto: a policy de edição de 20260930010000 tinha `with check` só com a empresa — a porta de saída
-- da lição 15. Repete a permissão do `using`.
drop policy if exists "Dono do projeto ou admin edita" on public.projects;
create policy "Dono do projeto ou admin edita" on public.projects
  for update using (
    tenant_id = public.get_user_tenant_id()
    and (owner_id = auth.uid() or public.is_admin_or_higher(auth.uid())))
  with check (
    tenant_id = public.get_user_tenant_id()
    and (owner_id = auth.uid() or created_by = auth.uid() or public.is_admin_or_higher(auth.uid())));

-- As atividades. Tarefa pessoal (sem projeto) continua exatamente como era; tarefa de projeto SEM setor
-- (o quadro antigo) também; a COM setor segue o setor.
drop policy if exists "Ve a propria tarefa ou a do projeto em que esta" on public.tasks;
drop policy if exists "Cria tarefa para si ou no projeto em que esta" on public.tasks;
drop policy if exists "Edita a propria tarefa ou a do projeto em que esta" on public.tasks;
drop policy if exists "Apaga a propria tarefa ou a do projeto em que esta" on public.tasks;

create policy "Ve a propria tarefa ou a do projeto em que esta" on public.tasks
  for select using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid() or public.is_supervisor_or_higher(auth.uid())
              else public.project_visivel(project_id) end));
create policy "Cria tarefa para si ou no projeto em que esta" on public.tasks
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null then user_id = auth.uid()
              when setor is null then public.project_visivel(project_id)
              else public.pode_planejar_setor(project_id, setor) end));
-- O responsável também atualiza (só % e farol: o trigger `trg_atividade_guarda` barra o resto).
create policy "Edita a propria tarefa ou a do projeto em que esta" on public.tasks
  for update using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null then user_id = auth.uid()
              when setor is null then public.project_visivel(project_id)
              else public.pode_planejar_setor(project_id, setor) or user_id = auth.uid() end))
  with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null then user_id = auth.uid()
              when setor is null then public.project_visivel(project_id)
              else public.pode_planejar_setor(project_id, setor) or user_id = auth.uid() end));
create policy "Apaga a propria tarefa ou a do projeto em que esta" on public.tasks
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null then user_id = auth.uid()
              when setor is null then public.project_visivel(project_id)
              else public.pode_planejar_setor(project_id, setor) end));

-- ─── 4. Guarda, sincronia do farol, equipe automática e histórico ─────────────────────────────
-- O responsável que não planeja o setor muda só % e farol (e a posição). Escrita de trigger passa
-- (lição 8: `pg_trigger_depth() > 1` é o sistema, não a pessoa).
create or replace function public.atividade_guarda()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 or auth.uid() is null or new.project_id is null or old.setor is null then
    return new;
  end if;
  if not public.pode_planejar_setor(old.project_id, old.setor) then
    if (new.title, new.description, new.setor, new.fase_id, new.link, new.fator_externo, new.depende_de,
        new.inicio, new.termino, new.user_id, new.project_id, new.priority)
       is distinct from
       (old.title, old.description, old.setor, old.fase_id, old.link, old.fator_externo, old.depende_de,
        old.inicio, old.termino, old.user_id, old.project_id, old.priority) then
      raise exception 'Como responsável você atualiza o andamento (%% e farol). O resto da atividade é do setor.'
        using errcode = '42501';
    end if;
  elsif new.setor is distinct from old.setor and not public.pode_planejar_setor(new.project_id, new.setor) then
    raise exception 'Você não planeja o setor de destino desta atividade.' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_atividade_guarda on public.tasks;
create trigger trg_atividade_guarda before update on public.tasks
  for each row execute function public.atividade_guarda();

-- Farol e % andam juntos; o término vira o `due_date` que a Home ordena (18h de Brasília).
create or replace function public.atividade_sincroniza()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.project_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'completed' then
    new.percentual := 100;
  elsif new.percentual = 100 and new.status in ('pending', 'in_progress') then
    new.status := 'completed';
  elsif new.percentual > 0 and new.status = 'pending' then
    new.status := 'in_progress';
  end if;
  if new.status = 'completed' and new.completed_at is null then new.completed_at := now(); end if;
  if new.status <> 'completed' then new.completed_at := null; end if;
  if new.termino is not null and (tg_op = 'INSERT' or new.termino is distinct from old.termino) then
    new.due_date := (new.termino + time '18:00') at time zone 'America/Sao_Paulo';
  elsif new.termino is null and tg_op = 'UPDATE' and old.termino is not null then
    new.due_date := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_atividade_sincroniza on public.tasks;
create trigger trg_atividade_sincroniza before insert or update on public.tasks
  for each row execute function public.atividade_sincroniza();

-- Quem recebe atividade entra na equipe (senão não veria o projeto); e é avisado.
create or replace function public.atividade_atribuida()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proj record;
begin
  if new.project_id is null or new.user_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then return null; end if;
  select id, name, e_modelo, tenant_id into v_proj from public.projects where id = new.project_id;
  if v_proj.e_modelo then return null; end if;
  insert into public.project_members (tenant_id, project_id, user_id)
  values (new.tenant_id, new.project_id, new.user_id) on conflict (project_id, user_id) do nothing;
  perform public.notify_users(new.tenant_id, array[new.user_id], 'projeto_atividade', 'project', new.project_id,
    'Projeto ' || v_proj.name || ': atividade para você',
    '"' || new.title || '"' || coalesce(' · termina em ' || to_char(new.termino, 'DD/MM'), ''),
    auth.uid());
  return null;
end;
$$;
drop trigger if exists trg_atividade_atribuida on public.tasks;
create trigger trg_atividade_atribuida after insert or update of user_id on public.tasks
  for each row execute function public.atividade_atribuida();

-- Dependência liberada: quem esperava por esta atividade é avisado quando ela finaliza.
create or replace function public.atividade_libera_dependentes()
returns trigger language plpgsql security definer set search_path = public as $$
declare d record; v_nome text;
begin
  if new.project_id is null or new.status <> 'completed' or old.status = 'completed' then return null; end if;
  select name into v_nome from public.projects where id = new.project_id and not e_modelo;
  if v_nome is null then return null; end if;
  for d in select t.* from public.tasks t where t.depende_de = new.id and t.status <> 'completed' loop
    perform public.notify_users(d.tenant_id,
      case when d.user_id is not null then array[d.user_id]
           else (select array_agg(uap.user_id) from public.user_access_profiles uap
                  where uap.tenant_id = d.tenant_id and uap.department = d.setor
                    and public.gestor_do_setor(uap.user_id, d.setor)) end,
      'projeto_dependencia', 'project', d.project_id,
      'Projeto ' || v_nome || ': pode começar',
      '"' || new.title || '" foi finalizada — "' || d.title || '" já pode começar.',
      auth.uid());
  end loop;
  return null;
end;
$$;
-- Sem lista de colunas de propósito: `after update of status` só dispara quando o UPDATE ESCREVE o status, e
-- o responsável manda só o % — quem muda o status é `trg_atividade_sincroniza`. A função confere a transição.
drop trigger if exists trg_atividade_libera on public.tasks;
create trigger trg_atividade_libera after update on public.tasks
  for each row execute function public.atividade_libera_dependentes();

-- Histórico: o que mudou, por quem (comentário de sistema que a equipe lê).
create or replace function public.atividade_historico()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_quem text; v_txt text[] := '{}'; v_novo text;
begin
  if new.project_id is null or exists (select 1 from public.projects where id = new.project_id and e_modelo) then
    return null;
  end if;
  select coalesce(full_name, email) into v_quem from public.profiles where id = auth.uid();
  if new.percentual is distinct from old.percentual then
    v_txt := v_txt || ('% concluído ' || old.percentual || ' → ' || new.percentual);
  end if;
  if new.status is distinct from old.status then
    v_txt := v_txt || ('farol ' || old.status || ' → ' || new.status);
  end if;
  if new.user_id is distinct from old.user_id then
    select coalesce(full_name, email) into v_novo from public.profiles where id = new.user_id;
    v_txt := v_txt || ('responsável → ' || coalesce(v_novo, 'ninguém'));
  end if;
  if (new.inicio, new.termino) is distinct from (old.inicio, old.termino) then
    v_txt := v_txt || ('datas ' || coalesce(to_char(new.inicio, 'DD/MM'), '—') || ' → ' || coalesce(to_char(new.termino, 'DD/MM'), '—'));
  end if;
  if new.fator_externo is distinct from old.fator_externo then
    v_txt := v_txt || ('fator externo: ' || coalesce(new.fator_externo, 'nenhum'));
  end if;
  if array_length(v_txt, 1) is null then return null; end if;
  insert into public.task_comentarios (tenant_id, task_id, autor_id, texto, sistema)
  values (new.tenant_id, new.id, auth.uid(), coalesce(v_quem, 'Sistema') || ' mudou ' || array_to_string(v_txt, '; '), true);
  return null;
end;
$$;
drop trigger if exists trg_atividade_historico on public.tasks;
create trigger trg_atividade_historico after update on public.tasks
  for each row execute function public.atividade_historico();

-- Setor chamado: a referência entra na equipe; referência e gestores do setor são avisados.
create or replace function public.projeto_setor_chamado()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_proj record;
begin
  select name, e_modelo into v_proj from public.projects where id = new.project_id;
  if v_proj.e_modelo then return null; end if;
  if new.referencia_id is not null then
    insert into public.project_members (tenant_id, project_id, user_id)
    values (new.tenant_id, new.project_id, new.referencia_id) on conflict (project_id, user_id) do nothing;
  end if;
  -- Trocar a referência avisa só a nova; marcar o setor avisa referência e gestores.
  if tg_op = 'UPDATE' then
    perform public.notify_users(new.tenant_id, array[new.referencia_id], 'projeto_setor_chamado', 'project',
      new.project_id, 'Você é a referência do setor no projeto ' || v_proj.name,
      'Leia o briefing e planeje as atividades do setor.', auth.uid());
    return null;
  end if;
  perform public.notify_users(new.tenant_id,
    array(select distinct x from unnest(
      array[new.referencia_id] ||
      coalesce((select array_agg(uap.user_id) from public.user_access_profiles uap
                 where uap.tenant_id = new.tenant_id and uap.department = new.setor
                   and public.gestor_do_setor(uap.user_id, new.setor)), '{}')) x where x is not null),
    'projeto_setor_chamado', 'project', new.project_id,
    'Seu setor foi chamado para o projeto ' || v_proj.name,
    'Leia o briefing e planeje as atividades do setor.',
    auth.uid());
  return null;
end;
$$;
drop trigger if exists trg_projeto_setor_chamado on public.project_setores;
create trigger trg_projeto_setor_chamado after insert or update of referencia_id on public.project_setores
  for each row execute function public.projeto_setor_chamado();

revoke all on function public.atividade_guarda() from public, anon;
revoke all on function public.atividade_sincroniza() from public, anon;
revoke all on function public.atividade_atribuida() from public, anon, authenticated;
revoke all on function public.atividade_libera_dependentes() from public, anon, authenticated;
revoke all on function public.atividade_historico() from public, anon, authenticated;
revoke all on function public.projeto_setor_chamado() from public, anon, authenticated;

-- ─── 5. Avisos de prazo (cron diário, 8h de Brasília) ─────────────────────────────────────────
create or replace function public.avisar_prazos_de_projeto()
returns integer language plpgsql security definer set search_path = public as $$
declare t record; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date; v_n int := 0; v_msg text;
begin
  for t in
    select a.*, p.name as projeto from public.tasks a join public.projects p on p.id = a.project_id
     where a.project_id is not null and not p.e_modelo and a.user_id is not null
       and a.status in ('pending', 'in_progress') and a.termino is not null
       and (a.termino = v_hoje + 2 or a.termino < v_hoje)
  loop
    v_msg := case when t.termino < v_hoje then 'atrasada desde ' || to_char(t.termino, 'DD/MM')
                  else 'termina em 2 dias (' || to_char(t.termino, 'DD/MM') || ')' end;
    -- Uma vez por atividade e por motivo: "atrasada" avisa uma vez só; "2 dias", uma vez.
    if not exists (select 1 from public.notifications n
                    where n.user_id = t.user_id and n.type = 'projeto_prazo' and n.reference_id = t.project_id
                      and n.message like '"' || t.title || '" ' || split_part(v_msg, ' ', 1) || '%') then
      perform public.notify_users(t.tenant_id, array[t.user_id], 'projeto_prazo', 'project', t.project_id,
        'Projeto ' || t.projeto || ': prazo', '"' || t.title || '" ' || v_msg);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.avisar_prazos_de_projeto() from public, anon, authenticated;
select cron.unschedule('projetos-prazos') where exists (select 1 from cron.job where jobname = 'projetos-prazos');
select cron.schedule('projetos-prazos', '0 11 * * *', $cron$select public.avisar_prazos_de_projeto()$cron$);

-- ─── 6. Modelos ───────────────────────────────────────────────────────────────────────────────
-- Copia fases, atividades (título, descrição, setor, fase, dependência) e setores de um projeto para outro.
-- Sem datas, pessoas e % — vale nos dois sentidos (salvar como modelo / criar a partir de modelo).
create or replace function public.projeto_copiar_estrutura(p_de uuid, p_para uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.projects where id = p_para;
  create temporary table if not exists _mapa_fase (velho uuid, novo uuid) on commit drop;
  create temporary table if not exists _mapa_tarefa (velho uuid, novo uuid) on commit drop;
  delete from _mapa_fase; delete from _mapa_tarefa;
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
revoke all on function public.projeto_copiar_estrutura(uuid, uuid) from public, anon, authenticated;

create or replace function public.salvar_como_modelo(p_project uuid, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_novo uuid; v_tenant uuid := public.get_user_tenant_id();
begin
  if not public.pode_editar_projeto(p_project) then
    raise exception 'Só quem responde pelo projeto o salva como modelo.' using errcode = '42501';
  end if;
  insert into public.projects (tenant_id, name, description, status, owner_id, created_by, e_modelo)
  select v_tenant, btrim(p_nome), description, 'planned', auth.uid(), auth.uid(), true
    from public.projects where id = p_project
  returning id into v_novo;
  perform public.projeto_copiar_estrutura(p_project, v_novo);
  return v_novo;
end;
$$;

create or replace function public.criar_projeto_do_modelo(p_modelo uuid, p_nome text, p_objetivo text, p_entrega date, p_setores text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_novo uuid; v_tenant uuid := public.get_user_tenant_id();
begin
  if not exists (select 1 from public.projects where id = p_modelo and tenant_id = v_tenant and e_modelo) then
    raise exception 'Modelo não encontrado.' using errcode = '22023';
  end if;
  insert into public.projects (tenant_id, name, description, status, owner_id, created_by, due_date)
  values (v_tenant, btrim(p_nome), p_objetivo, 'active', auth.uid(), auth.uid(), p_entrega)
  returning id into v_novo;
  perform public.projeto_copiar_estrutura(p_modelo, v_novo);
  -- Setores marcados a mais na tela; os do modelo já entraram (e avisaram) na cópia.
  insert into public.project_setores (tenant_id, project_id, setor)
  select v_tenant, v_novo, s from unnest(coalesce(p_setores, '{}')) s
  on conflict (project_id, setor) do nothing;
  return v_novo;
end;
$$;
revoke all on function public.salvar_como_modelo(uuid, text) from public, anon;
revoke all on function public.criar_projeto_do_modelo(uuid, text, text, date, text[]) from public, anon;
grant execute on function public.salvar_como_modelo(uuid, text) to authenticated;
grant execute on function public.criar_projeto_do_modelo(uuid, text, text, date, text[]) to authenticated;

-- ─── 7. Arquivos: balde privado `projetos`, pasta <empresa>/<projeto>/… ───────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('projetos', 'projetos', false, 10485760)
on conflict (id) do nothing;
create policy projetos_arquivo_le on storage.objects for select to authenticated
  using (bucket_id = 'projetos'
     and exists (select 1 from public.project_anexos a
                  where a.caminho = storage.objects.name
                    and a.tenant_id = public.get_user_tenant_id()
                    and public.project_visivel(a.project_id)));
create policy projetos_arquivo_grava on storage.objects for insert to authenticated
  with check (bucket_id = 'projetos'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and public.project_visivel(((storage.foldername(name))[2])::uuid));
create policy projetos_arquivo_apaga on storage.objects for delete to authenticated
  using (bucket_id = 'projetos'
     and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
     and exists (select 1 from public.project_anexos a
                  where a.caminho = storage.objects.name
                    and (a.enviado_por = auth.uid() or public.pode_editar_projeto(a.project_id))));
