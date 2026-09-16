-- L3b, correções da auditoria. 2026-09-16.

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Reduzir as vagas travava a turma inteira
-- ───────────────────────────────────────────────────────────────────────────
-- Achado grave, e o caminho é curto: o gestor baixa "Vagas" para menos do que
-- já está inscrito — nada impedia —, e a partir daí **qualquer** mudança de
-- situação de participante batia na conferência de vaga. O operador que só
-- queria marcar "Faltou" recebia "a turma já está com as 1 vagas preenchidas",
-- uma frase que não explica nada — e, como ele não é gestor, não consegue nem
-- editar a turma para desfazer.
--
-- Duas coisas estavam erradas, e as duas se consertam aqui:
--
--   a) **A conferência corria em mudança que não ocupa lugar.** Marcar
--      `presente`, `concluido` ou `faltou` em quem já estava inscrito não muda
--      a contagem. Vaga só se confere quando a linha **passa a ocupar**: ao
--      nascer, ao voltar de cancelado, ou ao mudar de turma.
--   b) **Nada guardava a capacidade contra a ocupação.** Quem estoura a vaga
--      agora é barrado onde o erro é legível: na hora de reduzir.
create or replace function public.training_confere_vaga()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_ocupadas integer;
  v_titulo   text;
  v_passa_a_ocupar boolean;
begin
  -- Quem sai da turma nunca precisa de vaga.
  if new.status = 'cancelado' then
    return new;
  end if;

  -- **A pergunta certa**: esta linha passou a ocupar um lugar agora?
  v_passa_a_ocupar := tg_op = 'INSERT'
    or old.status = 'cancelado'
    or old.session_id is distinct from new.session_id;
  if not v_passa_a_ocupar then
    return new;
  end if;

  select s.capacity, t.title into v_capacity, v_titulo
    from public.training_sessions s
    join public.trainings t on t.id = s.training_id
   where s.id = new.session_id;
  if v_capacity is null then
    return new;  -- turma sem limite
  end if;

  -- A trava é pela turma, e vale até o fim da transação: é ela que faz duas
  -- inscrições simultâneas virarem uma fila em vez de duas vagas iguais.
  perform pg_advisory_xact_lock(hashtextextended(new.session_id::text, 0));

  -- `e.id <> new.id` sozinho basta: num INSERT o `new.id` já veio do default e
  -- não pode igualar linha nenhuma que exista.
  select count(*) into v_ocupadas
    from public.training_enrollments e
   where e.session_id = new.session_id
     and e.status <> 'cancelado'
     and e.id <> new.id;

  if v_ocupadas >= v_capacity then
    raise exception 'a turma de "%" já está com as % vagas preenchidas', v_titulo, v_capacity
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A guarda que faltava, do lado da turma. A mensagem diz o número, porque é o
-- que quem está na tela precisa saber para decidir.
create or replace function public.training_vaga_cabe_no_inscrito()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ocupadas integer;
begin
  if new.capacity is null then
    return new;  -- tirar o limite nunca é problema
  end if;
  select count(*) into v_ocupadas
    from public.training_enrollments e
   where e.session_id = new.id and e.status <> 'cancelado';
  if v_ocupadas > new.capacity then
    raise exception 'esta turma já tem % inscritos; não dá para deixar % vagas', v_ocupadas, new.capacity
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_training_vaga_cabe_no_inscrito on public.training_sessions;
create trigger trg_training_vaga_cabe_no_inscrito
  before update of capacity on public.training_sessions
  for each row execute function public.training_vaga_cabe_no_inscrito();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A policy dizia uma coisa e a migration dizia outra
-- ───────────────────────────────────────────────────────────────────────────
-- O comentário da leva afirma que "cancelar é um estado, não o apagamento: é
-- isso que preserva o histórico de quem entrou e saiu". Mas a policy era
-- `for all`, e `for all` inclui DELETE — qualquer um com o módulo apagava a
-- linha e o histórico ia junto, sem rastro.
--
-- Apagar continua existindo para o engano de digitação, e passa a ser de
-- gestor: quem cancela é a operação do dia, quem apaga assume o que some.
drop policy if exists "Quem tem o Educacional inscreve e marca presenca" on public.training_enrollments;

create policy "Quem tem o Educacional inscreve na turma" on public.training_enrollments
  for insert to authenticated with check (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));
create policy "Quem tem o Educacional marca presenca" on public.training_enrollments
  for update to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));
create policy "Gestor apaga inscricao lancada por engano" on public.training_enrollments
  for delete to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()));

-- ───────────────────────────────────────────────────────────────────────────
-- 3. "Para quem é" era regra só da tela
-- ───────────────────────────────────────────────────────────────────────────
-- `trainings.audience` filtrava a lista de quem dá para inscrever — na tela. O
-- banco aceitava cliente em treinamento marcado como interno sem reclamar. É a
-- mesma família do defeito da CRM-4c, onde o validador conhecia quatro destinos
-- e o executor cumpria um: **regra que vive em um lugar só é regra que some**.
--
-- Vale na hora de inscrever. Trocar o `audience` depois não expulsa ninguém que
-- já está na turma — quem já foi convidado não se desconvida por uma edição de
-- cadastro; o que muda é quem pode entrar daqui para a frente.
create or replace function public.training_publico_confere()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_audience text;
  v_titulo   text;
begin
  select t.audience, t.title into v_audience, v_titulo
    from public.training_sessions s
    join public.trainings t on t.id = s.training_id
   where s.id = new.session_id;

  if new.customer_profile_id is not null and v_audience = 'interno' then
    raise exception '"%" é um treinamento só para funcionários', v_titulo
      using errcode = '23514';
  end if;
  if new.profile_id is not null and v_audience = 'externo' then
    raise exception '"%" é um treinamento só para clientes', v_titulo
      using errcode = '23514';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_training_publico_confere on public.training_enrollments;
create trigger trg_training_publico_confere
  before insert or update of profile_id, customer_profile_id, session_id
  on public.training_enrollments
  for each row execute function public.training_publico_confere();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. `search_path` nas duas que ficaram sem
-- ───────────────────────────────────────────────────────────────────────────
-- Inconsistência dentro da própria leva: `training_confere_vaga` levou, as
-- outras duas não. Função sem `search_path` fixo resolve nome por quem chama.
create or replace function public.training_conclusao_carimba_data()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'concluido' and new.completed_at is null then
    new.completed_at := now();
  elsif new.status <> 'concluido' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;

create or replace function public.training_inscrever(
  p_session  uuid,
  p_profile  uuid default null,
  p_customer uuid default null
)
returns uuid
language plpgsql
set search_path = public
as $$
declare
  v_tenant uuid;
  v_id     uuid;
begin
  if (p_profile is not null) = (p_customer is not null) then
    raise exception 'informe um funcionário ou um cliente, não os dois'
      using errcode = '23514';
  end if;

  select tenant_id into v_tenant from public.training_sessions where id = p_session;
  if v_tenant is null then
    raise exception 'turma não encontrada' using errcode = 'P0002';
  end if;

  select id into v_id from public.training_enrollments
   where session_id = p_session
     and ((p_profile is not null and profile_id = p_profile)
          or (p_customer is not null and customer_profile_id = p_customer));

  if found then
    update public.training_enrollments
       set status = case when status = 'cancelado' then 'inscrito' else status end
     where id = v_id;
    return v_id;
  end if;

  insert into public.training_enrollments
    (tenant_id, session_id, profile_id, customer_profile_id, created_by)
  values (v_tenant, p_session, p_profile, p_customer, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.training_inscrever(uuid, uuid, uuid) from public, anon;
grant execute on function public.training_inscrever(uuid, uuid, uuid) to authenticated;
