-- OKR-2, correções da auditoria. 2026-09-13.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Funcionário comum não conseguia criar projeto nenhum
-- ───────────────────────────────────────────────────────────────────────────
-- `.insert(...).select('id')` — o que todo hook deste sistema faz, por causa da
-- regra 2 das cinco — vira `INSERT ... RETURNING`. E o PostgreSQL, quando há
-- RETURNING, aplica a **policy de SELECT** já no insert, antes de qualquer
-- trigger `AFTER`. Como quem torna o projeto visível era justamente um trigger
-- AFTER INSERT (o que põe o autor em `project_members`), a linha ainda não
-- existia: 42501, e o projeto inteiro voltava atrás.
--
-- Não apareceu na navegação real porque o único usuário da empresa de teste é
-- o dono, e `project_visivel` tem o ramo do administrador. Qualquer outra
-- pessoa levava "peça a quem responde por ele para te incluir" — numa tela de
-- **criar** projeto.
--
-- Agora quem responde pelo projeto e quem o criou enxergam por direito próprio,
-- sem depender de linha nenhuma ter sido escrita antes.
drop policy if exists "Participante ou admin ve o projeto" on public.projects;
create policy "Participante ou admin ve o projeto" on public.projects
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id()
    and (owner_id = auth.uid()
         or created_by = auth.uid()
         or public.project_visivel(id)));

-- ───────────────────────────────────────────────────────────────────────────
-- 2. `project_visivel` era cega à empresa
-- ───────────────────────────────────────────────────────────────────────────
-- `is_admin_or_higher(auth.uid())` sozinho respondia **true para qualquer uuid
-- de qualquer empresa**. Estava contido só porque todo chamador acrescentava
-- `and tenant_id = get_user_tenant_id()` — a primeira policy futura que
-- esquecesse disso abriria cruzamento entre empresas. A função passa a se
-- defender sozinha.
create or replace function public.project_visivel(p_project uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.project_participa(p_project)
      or exists (
        select 1 from public.projects p
         where p.id = p_project
           and p.tenant_id = public.get_user_tenant_id()
           and public.is_admin_or_higher(auth.uid()));
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Quem vê o quadro, mexe no quadro
-- ───────────────────────────────────────────────────────────────────────────
-- As policies de escrita de `tasks` pediam `project_participa`, e a de leitura,
-- `project_visivel`. O dono da empresa, que vê todos os projetos, abria um
-- quadro de que não participa, arrastava um cartão e levava "a tarefa não
-- afetou nenhuma linha". A exceção do administrador tinha ficado pela metade:
-- ou ele não vê, ou ele mexe. Ele vê — então mexe.
--
-- As quatro policies também voltam a ter `to authenticated`, que as originais
-- de `tasks` tinham e a reescrita perdeu (sem a cláusula, o PostgreSQL usa
-- `public`, que inclui o visitante anônimo).
drop policy if exists "Ve a propria tarefa ou a do projeto em que esta"    on public.tasks;
drop policy if exists "Cria tarefa para si ou no projeto em que esta"      on public.tasks;
drop policy if exists "Edita a propria tarefa ou a do projeto em que esta" on public.tasks;
drop policy if exists "Apaga a propria tarefa ou a do projeto em que esta" on public.tasks;

create policy "Ve a propria tarefa ou a do projeto em que esta" on public.tasks
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid() or public.is_supervisor_or_higher(auth.uid())
              else public.project_visivel(project_id) end));
create policy "Cria tarefa para si ou no projeto em que esta" on public.tasks
  for insert to authenticated with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_visivel(project_id) end));
create policy "Edita a propria tarefa ou a do projeto em que esta" on public.tasks
  for update to authenticated using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_visivel(project_id) end))
  with check (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_visivel(project_id) end));
create policy "Apaga a propria tarefa ou a do projeto em que esta" on public.tasks
  for delete to authenticated using (
    tenant_id = public.get_user_tenant_id()
    and (case when project_id is null
              then user_id = auth.uid()
              else public.project_visivel(project_id) end));

-- `tasks` nunca teve este revoke — era o `to authenticated` das policies
-- antigas que segurava, e ele tinha acabado de sair. Armadilha nº 6.
revoke all on public.tasks from anon;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Passar o projeto para outra pessoa deixava o projeto sem dono presente
-- ───────────────────────────────────────────────────────────────────────────
-- O trigger só existia no INSERT. Ao trocar "quem responde", o novo dono não
-- entrava em `project_members`: não via o quadro pelo caminho de participante,
-- e o antigo perdia editar e apagar no mesmo instante.
create or replace function public.project_dono_participa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (tenant_id, project_id, user_id)
  values (new.tenant_id, new.id, new.owner_id)
  on conflict (project_id, user_id) do nothing;
  return null;
end;
$$;
create trigger trg_project_dono_participa after update of owner_id on public.projects
  for each row when (new.owner_id is not null and new.owner_id is distinct from old.owner_id)
  execute function public.project_dono_participa();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Tarefa de projeto podia ser atribuída a gente de outra empresa
-- ───────────────────────────────────────────────────────────────────────────
-- Enquanto a tarefa era só pessoal, `user_id = auth.uid()` fechava isso
-- sozinho. Com o ramo de projeto, a policy pede participação e não olha o
-- responsável — e a chave estrangeira de `tasks.user_id` é de uma coluna só.
-- Passa a ser composta, como o resto desta leva e como manda a casa.
-- (`user_id` nulo não é verificado: é o comportamento normal de chave composta,
-- e é o que deixa o cartão esperar por um dono.)
alter table public.tasks drop constraint if exists tasks_user_id_fkey;
alter table public.tasks
  add constraint tasks_user_id_tenant_fkey foreign key (user_id, tenant_id)
    references public.profiles (id, tenant_id) on delete cascade;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Miudezas
-- ───────────────────────────────────────────────────────────────────────────
-- O trigger que limpa as tarefas sem dono não filtrava a empresa. Não havia
-- furo (o `project_id` já é único), mas todo delete desta casa filtra.
create or replace function public.project_apagado_sem_orfao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.tasks
   where project_id = old.id and tenant_id = old.tenant_id and user_id is null;
  return old;
end;
$$;

-- `tasks` tinha **dois** gatilhos de auditoria idênticos, chamando a mesma
-- função: toda escrita gravava duas linhas em `audit_logs`. Passou despercebido
-- enquanto tarefa era coisa rara; o quadro escreve a cada arraste.
drop trigger if exists audit_tasks_trigger on public.tasks;
