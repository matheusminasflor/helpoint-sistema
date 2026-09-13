-- OKR-2: Projetos — o que liga a estratégia ao trabalho do dia. 2026-09-13.
--
-- Decisões do dono (2026-09-13), todas com consequência aqui:
--
--   • A tarefa do projeto **é a mesma tarefa** que já existe. `tasks` ganha
--     `project_id`: nulo = tarefa pessoal, como sempre foi; preenchido = tarefa
--     do projeto, que os participantes veem e mexem. Assim a tarefa nascida de
--     um chamado ou de um fluxo automatizado pode entrar num projeto sem virar
--     outra coisa, e a lista do dia continua mostrando tudo junto.
--   • Tarefa de projeto **pode nascer sem dono** — no quadro, "A fazer" começa
--     cheio de coisa que ninguém pegou. `tasks.user_id` passa a ser nulável.
--   • As colunas do quadro são **os quatro estados que a tarefa já tem**
--     (pending, in_progress, completed, cancelled). Nenhuma tabela de coluna,
--     nenhum segundo estado para se contradizer com o primeiro.
--   • **Só quem participa vê o projeto.** Dono e administrador da empresa veem
--     todos — sem isso quem responde pela empresa não enxergaria nada, e é o
--     padrão de toda tabela deste sistema. Gestor comum **não** vê: foi pedido
--     fechado, e está registrado em `docs/nao-funciona.md` como coisa a virar
--     num comando se o dono mudar de ideia.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O projeto
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.projects (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  name         text not null,
  description  text,
  status       text not null default 'active',
  -- Quem responde pelo projeto. Continua sendo participante como todo mundo:
  -- a coluna diz quem manda, a tabela de participantes diz quem entra.
  owner_id     uuid,
  start_date   date,
  due_date     date,
  -- O objetivo estratégico que este projeto serve. Nulo = projeto que existe
  -- por si, que é a maioria no começo.
  goal_id      uuid,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint projects_id_tenant_key unique (id, tenant_id),
  constraint projects_status_check check (status in ('planned', 'active', 'done', 'cancelled')),
  constraint projects_prazo_check check (due_date is null or start_date is null or due_date >= start_date),
  constraint projects_owner_fkey foreign key (owner_id, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (owner_id),
  constraint projects_goal_fkey foreign key (goal_id, tenant_id)
    references public.goals (id, tenant_id) on delete set null (goal_id)
);

create index if not exists projects_tenant_status_idx on public.projects (tenant_id, status);
create index if not exists projects_goal_idx on public.projects (goal_id);

create trigger inject_tenant_id_projects before insert on public.projects
  for each row execute function public.inject_tenant_id();
create trigger handle_projects_updated_at before update on public.projects
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Quem participa
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.project_members (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  project_id  uuid not null,
  user_id     uuid not null,
  created_at  timestamptz not null default now(),
  constraint project_members_project_fkey foreign key (project_id, tenant_id)
    references public.projects (id, tenant_id) on delete cascade,
  constraint project_members_user_fkey foreign key (user_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade,
  constraint project_members_uma_vez unique (project_id, user_id)
);

create index if not exists project_members_user_idx on public.project_members (user_id);

create trigger inject_tenant_id_project_members before insert on public.project_members
  for each row execute function public.inject_tenant_id();

-- Quem cria o projeto entra nele. Sem isto o autor precisaria se convidar, e
-- (pior) perderia de vista o projeto que acabou de criar no instante seguinte.
create or replace function public.project_autor_participa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (tenant_id, project_id, user_id)
  values (new.tenant_id, new.id, coalesce(new.owner_id, new.created_by))
  on conflict (project_id, user_id) do nothing;
  return null;
end;
$$;
create trigger trg_project_autor_participa after insert on public.projects
  for each row when (coalesce(new.owner_id, new.created_by) is not null)
  execute function public.project_autor_participa();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. As duas perguntas que a RLS faz o tempo todo
-- ───────────────────────────────────────────────────────────────────────────
-- `security definer` de propósito: elas são consultadas de dentro das policies
-- de `projects`, `project_members` e `tasks`, e uma leitura sujeita à RLS ali
-- dentro giraria em círculo.
create or replace function public.project_participa(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
     where m.project_id = p_project and m.user_id = auth.uid()
  );
$$;

create or replace function public.project_visivel(p_project uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.project_participa(p_project)
      or public.is_admin_or_higher(auth.uid());
$$;

revoke execute on function public.project_participa(uuid) from public, anon;
revoke execute on function public.project_visivel(uuid)  from public, anon;
grant execute on function public.project_participa(uuid) to authenticated;
grant execute on function public.project_visivel(uuid)  to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Quem vê e quem mexe no projeto
-- ───────────────────────────────────────────────────────────────────────────
alter table public.projects        enable row level security;
alter table public.project_members enable row level security;

create policy "Participante ou admin ve o projeto" on public.projects
  for select using (
    tenant_id = public.get_user_tenant_id() and public.project_visivel(id));
-- Qualquer pessoa da empresa abre um projeto: é ferramenta de trabalho, não
-- privilégio. Quem abre vira dono e participante pelo trigger acima.
create policy "Qualquer um da empresa cria projeto" on public.projects
  for insert with check (
    tenant_id = public.get_user_tenant_id() and created_by = auth.uid());
create policy "Dono do projeto ou admin edita" on public.projects
  for update using (
    tenant_id = public.get_user_tenant_id()
    and (owner_id = auth.uid() or public.is_admin_or_higher(auth.uid())))
  with check (tenant_id = public.get_user_tenant_id());
create policy "Dono do projeto ou admin apaga" on public.projects
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (owner_id = auth.uid() or public.is_admin_or_higher(auth.uid())));

create policy "Participante ve quem mais participa" on public.project_members
  for select using (
    tenant_id = public.get_user_tenant_id() and public.project_visivel(project_id));
create policy "Dono do projeto ou admin convida" on public.project_members
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and (public.is_admin_or_higher(auth.uid())
         or exists (select 1 from public.projects p
                     where p.id = project_id and p.owner_id = auth.uid())));
create policy "Dono do projeto ou admin tira" on public.project_members
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (public.is_admin_or_higher(auth.uid())
         or exists (select 1 from public.projects p
                     where p.id = project_id and p.owner_id = auth.uid())));

revoke all on public.projects        from anon;
revoke all on public.project_members from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. A tarefa passa a poder pertencer a um projeto
-- ───────────────────────────────────────────────────────────────────────────
alter table public.tasks
  add column if not exists project_id uuid,
  -- Ordem dentro da coluna do quadro. `numeric` e não `integer` para arrastar
  -- entre dois cartões ser uma conta de média, sem renumerar a coluna inteira.
  add column if not exists position numeric not null default 0;

alter table public.tasks
  add constraint tasks_project_fkey foreign key (project_id, tenant_id)
    references public.projects (id, tenant_id) on delete set null (project_id);

-- Tarefa de projeto pode esperar por um dono; tarefa pessoal, não — sem dono
-- ela não é de ninguém e não aparece na lista de ninguém.
alter table public.tasks alter column user_id drop not null;
alter table public.tasks
  add constraint tasks_pessoal_tem_dono_check
    check (project_id is not null or user_id is not null);

create index if not exists tasks_project_idx on public.tasks (project_id, status, position);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. E a RLS da tarefa passa a conhecer projeto
-- ───────────────────────────────────────────────────────────────────────────
-- As quatro policies antigas tratavam `tasks` como coisa estritamente pessoal.
-- As novas mantêm isso **igual** para tarefa sem projeto — o que muda é só o
-- ramo novo: tarefa de projeto pertence a quem participa dele.
drop policy if exists "Users can view their own tasks"   on public.tasks;
drop policy if exists "Users can create their own tasks" on public.tasks;
drop policy if exists "Users can update their own tasks" on public.tasks;
drop policy if exists "Users can delete their own tasks" on public.tasks;

create policy "Ve a propria tarefa ou a do projeto em que esta" on public.tasks
  for select using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid() or public.is_supervisor_or_higher(auth.uid())
              else public.project_visivel(project_id) end));
create policy "Cria tarefa para si ou no projeto em que esta" on public.tasks
  for insert with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_participa(project_id) end));
create policy "Edita a propria tarefa ou a do projeto em que esta" on public.tasks
  for update using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_participa(project_id) end))
  with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_participa(project_id) end));
create policy "Apaga a propria tarefa ou a do projeto em que esta" on public.tasks
  for delete using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_participa(project_id) end));
