-- Projetos por setor (docs/plano-projetos.md), dois acertos da etapa das telas:
--
-- 1. Reabrir: a atividade finalizada cujo % volta para baixo de 100 continuava "completed" — o farol
--    ficava "Finalizado" com 60%. Agora o % manda nos dois sentidos (0 → pending, 1..99 → in_progress).
-- 2. @menção na atualização da atividade: o mesmo desenho do chat (20261013020000) — a tela resolve
--    "@Nome" para o uuid e grava em `mencionados`; o banco avisa quem foi citado, se essa pessoa
--    enxerga o projeto. Citar quem não enxerga NÃO dá acesso (decisão: o acesso entra por setor ou equipe).

-- ─── 1. O % manda no status ────────────────────────────────────────────────────────────────────
create or replace function public.atividade_sincroniza()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.project_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status = 'completed' then
    new.percentual := 100;
  elsif new.percentual = 100 and new.status in ('pending', 'in_progress') then
    new.status := 'completed';
  elsif new.percentual < 100 and new.status = 'completed' then
    new.status := case when new.percentual > 0 then 'in_progress' else 'pending' end;
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

-- ─── 2. @menção ─────────────────────────────────────────────────────────────────────────────────
alter table public.task_comentarios add column if not exists mencionados uuid[] not null default '{}';

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

  -- `distinct`: o array vem do cliente e pode repetir.
  foreach v_pessoa in array array(select distinct unnest(new.mencionados)) loop
    continue when v_pessoa = new.autor_id;
    -- Enxerga do lado do MENCIONADO (aqui `auth.uid()` é o autor): ativo, da empresa, e na equipe,
    -- ou vê todos, ou é referência/gestor de setor envolvido — o mesmo `project_visivel`, para outra pessoa.
    continue when not coalesce((
      select exists (select 1 from public.profiles p where p.id = v_pessoa and p.tenant_id = v_proj.tenant_id and p.is_active)
         and (exists (select 1 from public.project_members m where m.project_id = v_proj.id and m.user_id = v_pessoa)
              or v_proj.owner_id = v_pessoa
              or public.ve_todos_os_projetos(v_pessoa)
              or exists (select 1 from public.project_setores s
                          where s.project_id = v_proj.id
                            and (s.referencia_id = v_pessoa or public.gestor_do_setor(v_pessoa, s.setor))))
    ), false);

    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    values (v_proj.tenant_id, v_pessoa, 'mention', 'project', v_proj.id,
            v_proj.name || ' · ' || v_task.title, left(new.texto, 140));
  end loop;
  return new;
end;
$$;

revoke all on function public.atividade_avisa_mencao() from public, anon;

drop trigger if exists trg_atividade_avisa_mencao on public.task_comentarios;
create trigger trg_atividade_avisa_mencao after insert on public.task_comentarios
  for each row execute function public.atividade_avisa_mencao();
