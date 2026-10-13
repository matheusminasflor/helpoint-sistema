-- PROJETOS COM OS NOMES DO DIA A DIA (dono, 2026-10-13: "está muito técnico, parece um Excel").
-- Decisão (múltipla escolha, a recomendada): Atividade → Tarefa, Farol → Situação, Término → Prazo,
-- Fator externo → Esperando algo de fora, e o andamento em três passos: A fazer / Fazendo / Pronto.
-- Só muda o TEXTO do histórico da tarefa (comentário de sistema); regra nenhuma muda.

create or replace function public.rotulo_do_farol(p_status text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_status
    when 'pending' then 'A fazer'
    when 'in_progress' then 'Fazendo'
    when 'completed' then 'Pronto'
    when 'cancelled' then 'Cancelada'
    else p_status
  end;
$$;

create or replace function public.atividade_historico()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_quem text; v_txt text[] := '{}'; v_novo text;
begin
  if new.project_id is null or exists (select 1 from public.projects where id = new.project_id and e_modelo) then
    return null;
  end if;
  select coalesce(full_name, email) into v_quem from public.profiles where id = auth.uid();
  -- A situação diz tudo; o % só aparece quando mudou sozinho (dentro de "Fazendo").
  if new.status is distinct from old.status then
    v_txt := v_txt || ('a situação: ' || public.rotulo_do_farol(old.status::text) || ' → ' || public.rotulo_do_farol(new.status::text));
  elsif new.percentual is distinct from old.percentual then
    v_txt := v_txt || ('o andamento: ' || old.percentual || '% → ' || new.percentual || '%');
  end if;
  if new.user_id is distinct from old.user_id then
    select coalesce(full_name, email) into v_novo from public.profiles where id = new.user_id;
    v_txt := v_txt || ('quem faz → ' || coalesce(v_novo, 'ninguém'));
  end if;
  if new.termino is distinct from old.termino then
    v_txt := v_txt || ('o prazo → ' || coalesce(to_char(new.termino, 'DD/MM'), 'sem prazo'));
  end if;
  if new.inicio is distinct from old.inicio then
    v_txt := v_txt || ('o início → ' || coalesce(to_char(new.inicio, 'DD/MM'), 'sem data'));
  end if;
  if new.fator_externo is distinct from old.fator_externo then
    v_txt := v_txt || ('esperando algo de fora: ' || coalesce(new.fator_externo, 'nada'));
  end if;
  if array_length(v_txt, 1) is null then return null; end if;
  insert into public.task_comentarios (tenant_id, task_id, autor_id, texto, sistema)
  values (new.tenant_id, new.id, auth.uid(), coalesce(v_quem, 'Sistema') || ' mudou ' || array_to_string(v_txt, '; '), true);
  return null;
end;
$$;

-- A mesma guarda, com as mensagens nos nomes novos.
create or replace function public.atividade_guarda()
returns trigger
language plpgsql
set search_path to 'public'
as $$
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
      raise exception 'Como quem faz a tarefa, você muda a situação (A fazer, Fazendo, Pronto). O resto da tarefa é do setor.'
        using errcode = '42501';
    end if;
  elsif new.setor is distinct from old.setor and not public.pode_planejar_setor(new.project_id, new.setor) then
    raise exception 'Você não planeja o setor para onde quer levar esta tarefa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
