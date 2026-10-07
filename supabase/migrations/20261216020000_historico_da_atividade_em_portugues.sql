-- HISTÓRICO DA ATIVIDADE EM PORTUGUÊS (teste do dono na produção, 2026-10-07).
-- O histórico mostrava "farol pending → completed" — o valor interno do status, em inglês. A pessoa lê
-- "farol Não iniciado → Finalizado". Só muda o texto do comentário de sistema.

create or replace function public.rotulo_do_farol(p_status text)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select case p_status
    when 'pending' then 'Não iniciado'
    when 'in_progress' then 'Em andamento'
    when 'completed' then 'Finalizado'
    when 'cancelled' then 'Cancelado'
    else p_status
  end;
$$;

-- Só o banco usa (dentro do gatilho do histórico).
revoke all on function public.rotulo_do_farol(text) from public, anon, authenticated;

do $$
declare
  v_def text := pg_get_functiondef('public.atividade_historico()'::regprocedure);
  v_novo text;
begin
  v_novo := replace(v_def,
    $q$('farol ' || old.status || ' → ' || new.status)$q$,
    $q$('farol ' || public.rotulo_do_farol(old.status::text) || ' → ' || public.rotulo_do_farol(new.status::text))$q$);
  if v_novo = v_def then
    raise exception 'atividade_historico: trecho do farol não encontrado — a função mudou, revise esta migration';
  end if;
  execute v_novo;
end $$;

-- O que já foi escrito em inglês nos comentários de sistema.
update public.task_comentarios
   set texto = replace(replace(replace(replace(replace(replace(texto,
         'farol pending', 'farol Não iniciado'),
         'farol in_progress', 'farol Em andamento'),
         'farol completed', 'farol Finalizado'),
         '→ completed', '→ Finalizado'),
         '→ in_progress', '→ Em andamento'),
         '→ pending', '→ Não iniciado')
 where sistema and texto like '%farol %';
