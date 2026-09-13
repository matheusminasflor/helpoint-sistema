-- OKR-2, correção: apagar um projeto não podia travar nem largar órfão.
-- 2026-09-13.
--
-- A migration anterior deixou duas regras que se mordem: a tarefa do projeto
-- pode existir sem dono, e a tarefa **sem** projeto precisa ter dono. Ao apagar
-- um projeto, a chave estrangeira soltava as tarefas (`set null`) — e a que não
-- tinha dono virava tarefa pessoal de ninguém, violando o CHECK. Resultado:
-- projeto com qualquer item ainda não atribuído era **impossível de apagar**, e
-- o erro que chegava à tela falava de uma constraint, não de projeto.
--
-- A regra, dita de um jeito que cabe numa frase para quem usa: **o que ninguém
-- pegou some com o projeto; o que alguém estava tocando volta a ser tarefa
-- pessoal dessa pessoa.** Ninguém perde trabalho que era seu, e o quadro não
-- deixa lixo sem dono para trás.
create or replace function public.project_apagado_sem_orfao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.tasks where project_id = old.id and user_id is null;
  return old;
end;
$$;
create trigger trg_project_apagado_sem_orfao before delete on public.projects
  for each row execute function public.project_apagado_sem_orfao();
