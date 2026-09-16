-- L3b: Educacional — treinamentos, turmas e participantes. 2026-09-16.
--
-- Do Educacional existia só a casca que a receita de módulo (L3a) entrega: fila
-- de chamados, indicadores e configurações. O domínio é isto aqui.
--
-- Quatro decisões do dono, e elas explicam quase todo o desenho:
--
--   1. **O aluno externo é o cliente do SAC.** Não um cadastro novo: ele já tem
--      login, portal, CNPJ e endereço, e é quem a Minasflor treina — salão,
--      distribuidor. Cadastrar a mesma pessoa duas vezes é de onde vem quase
--      todo dado errado em sistema.
--   2. **Treinamento tem turma com data e local.** O treinamento é o assunto
--      ("Aplicação de coloração"); a turma é quando ele acontece. Presença se
--      marca por turma, não por treinamento.
--   3. **Só a equipe lança.** Nada disto abre porta para fora nesta leva — o
--      portal do cliente fica para quando houver treinamento lançado de verdade.
--   4. **Concluir registra, não emite certificado.** PDF é degrau à parte.
--
-- ───────────────────────────────────────────────────────────────────────────
-- 0. Quem tem o Educacional
-- ───────────────────────────────────────────────────────────────────────────
-- Cópia literal de `has_crm_access`, trocando o módulo. É o padrão da casa
-- desde o RH: a concessão explícita, ou o cargo de supervisor para cima.
create or replace function public.has_educacional_access(_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_module_access
    where user_id = _user_id and module = 'educacional'
  ) or public.is_supervisor_or_higher(_user_id);
$$;

-- A chave composta que faltava no cliente do SAC. `(id, tenant_id)` é como esta
-- casa impede uma linha de apontar para outra de empresa diferente, e é para cá
-- que o participante externo aponta.
-- `add constraint` não tem `if not exists`: o bloco é o que deixa a migration
-- rodar duas vezes sem quebrar o `db push` (lição da auditoria da CRM-4c).
do $chave$
begin
  alter table public.customer_profiles
    add constraint customer_profiles_id_tenant_key unique (id, tenant_id);
exception when duplicate_table or duplicate_object then null;
end $chave$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. O treinamento — o assunto
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.trainings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  title       text not null,
  description text,
  -- Para quem é. Um treinamento de segurança é interno; um de aplicação de
  -- produto é externo; integração de novo distribuidor pode ser os dois.
  audience    text not null default 'interno',
  -- Carga horária fica no treinamento e não na turma: é o assunto que tem
  -- duração, e é ela que aparece no histórico de quem fez.
  -- ponytail: teto conhecido — turma que fugir da carga padrão não tem onde
  -- registrar isso. Saída: coluna `hours` na turma, quando alguém precisar.
  hours       numeric(6,2),
  is_active   boolean not null default true,
  created_by  uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint trainings_title_check check (length(trim(title)) between 1 and 160),
  constraint trainings_audience_check check (audience in ('interno', 'externo', 'ambos')),
  constraint trainings_hours_check check (hours is null or (hours > 0 and hours <= 999)),
  constraint trainings_id_tenant_key unique (id, tenant_id)
);

drop trigger if exists inject_tenant_id_trainings on public.trainings;
create trigger inject_tenant_id_trainings before insert on public.trainings
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_trainings_updated_at on public.trainings;
create trigger handle_trainings_updated_at before update on public.trainings
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 2. A turma — quando o treinamento acontece
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.training_sessions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  training_id   uuid not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz,
  modality      text not null default 'presencial',
  -- Sala e endereço quando é presencial; link quando é online. Um campo só,
  -- porque a pergunta que o participante faz é a mesma: "onde eu vou?".
  location      text,
  -- Nulo = sem limite. Zero não existe: turma sem vaga é turma cancelada.
  capacity      integer,
  instructor_id uuid,
  status        text not null default 'agendada',
  notes         text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint training_sessions_modality_check check (modality in ('presencial', 'online')),
  constraint training_sessions_status_check check (status in ('agendada', 'realizada', 'cancelada')),
  constraint training_sessions_capacity_check check (capacity is null or capacity > 0),
  constraint training_sessions_periodo_check check (ends_at is null or ends_at >= starts_at),
  constraint training_sessions_id_tenant_key unique (id, tenant_id),
  constraint training_sessions_training_fkey foreign key (training_id, tenant_id)
    references public.trainings (id, tenant_id) on delete cascade,
  constraint training_sessions_instructor_fkey foreign key (instructor_id, tenant_id)
    references public.profiles (id, tenant_id) on delete set null (instructor_id)
);

create index if not exists training_sessions_agenda_idx
  on public.training_sessions (tenant_id, starts_at desc);

drop trigger if exists inject_tenant_id_training_sessions on public.training_sessions;
create trigger inject_tenant_id_training_sessions before insert on public.training_sessions
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_training_sessions_updated_at on public.training_sessions;
create trigger handle_training_sessions_updated_at before update on public.training_sessions
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. O participante — funcionário **ou** cliente, nunca os dois
-- ───────────────────────────────────────────────────────────────────────────
-- Duas colunas e não uma coluna com "tipo": assim cada uma tem chave
-- estrangeira de verdade, e o banco impede inscrição apontando para gente que
-- não existe. O CHECK abaixo é quem garante que só uma delas está preenchida.
create table if not exists public.training_enrollments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  session_id          uuid not null,
  profile_id          uuid,
  customer_profile_id uuid,
  status              text not null default 'inscrito',
  completed_at        timestamptz,
  notes               text,
  created_by          uuid,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint training_enrollments_status_check
    check (status in ('inscrito', 'presente', 'concluido', 'faltou', 'cancelado')),
  constraint training_enrollments_quem_check
    check ((profile_id is not null) <> (customer_profile_id is not null)),
  constraint training_enrollments_session_fkey foreign key (session_id, tenant_id)
    references public.training_sessions (id, tenant_id) on delete cascade,
  constraint training_enrollments_profile_fkey foreign key (profile_id, tenant_id)
    references public.profiles (id, tenant_id) on delete restrict,
  constraint training_enrollments_customer_fkey foreign key (customer_profile_id, tenant_id)
    references public.customer_profiles (id, tenant_id) on delete restrict
);

-- A mesma pessoa não se inscreve duas vezes na mesma turma. Índice parcial
-- porque uma das duas colunas é sempre nula, e NULL não conflita sozinho.
create unique index if not exists training_enrollments_funcionario_idx
  on public.training_enrollments (session_id, profile_id) where profile_id is not null;
create unique index if not exists training_enrollments_cliente_idx
  on public.training_enrollments (session_id, customer_profile_id) where customer_profile_id is not null;

create index if not exists training_enrollments_sessao_idx
  on public.training_enrollments (tenant_id, session_id);

drop trigger if exists inject_tenant_id_training_enrollments on public.training_enrollments;
create trigger inject_tenant_id_training_enrollments before insert on public.training_enrollments
  for each row execute function public.inject_tenant_id();
drop trigger if exists handle_training_enrollments_updated_at on public.training_enrollments;
create trigger handle_training_enrollments_updated_at before update on public.training_enrollments
  for each row execute function public.handle_updated_at();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Concluir carimba a data sozinho
-- ───────────────────────────────────────────────────────────────────────────
-- Quem marca "concluiu" está numa lista, clicando rápido em dez pessoas. Pedir
-- a data junto é pedir para ela ficar errada — e "concluído sem data" não
-- aparece em relatório nenhum. O contrário também vale: voltar de concluído
-- apaga a data, senão sobra um carimbo dizendo que aconteceu algo que não
-- aconteceu.
create or replace function public.training_conclusao_carimba_data()
returns trigger
language plpgsql
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
create trigger trg_training_conclusao_carimba_data
  before insert or update of status on public.training_enrollments
  for each row execute function public.training_conclusao_carimba_data();

-- ───────────────────────────────────────────────────────────────────────────
-- 5. A turma não estoura a vaga
-- ───────────────────────────────────────────────────────────────────────────
-- Vaga é promessa feita a quem já se inscreveu. Contar na tela não resolve:
-- duas pessoas inscrevendo ao mesmo tempo veem o mesmo número e as duas passam.
-- Quem conta é o banco, com trava na turma — e cancelado não ocupa vaga.
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
begin
  if new.status = 'cancelado' then
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

  select count(*) into v_ocupadas
    from public.training_enrollments e
   where e.session_id = new.session_id
     and e.status <> 'cancelado'
     and (tg_op = 'INSERT' or e.id <> new.id);

  if v_ocupadas >= v_capacity then
    raise exception 'a turma de "%" já está com as % vagas preenchidas', v_titulo, v_capacity
      using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger trg_training_confere_vaga
  before insert or update of status, session_id on public.training_enrollments
  for each row execute function public.training_confere_vaga();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Inscrever quem já esteve na turma
-- ───────────────────────────────────────────────────────────────────────────
-- Cair nisto ao exercitar o caminho: a pessoa cancela, muda de ideia, e a
-- inscrição de novo batia no índice único com um "duplicate key value violates
-- unique constraint" — erro do Postgres na cara de quem só queria clicar.
--
-- A saída não é afrouxar o índice. **Uma pessoa tem uma linha por turma**, e
-- cancelar é um estado dela, não o apagamento: é isso que preserva o histórico
-- de quem entrou e saiu. O que faltava era a porta certa para entrar.
--
-- `security invoker` de propósito: a RLS continua valendo dentro da função, e
-- é ela que garante que ninguém alcance turma de outra empresa. O `tenant_id`
-- sai da própria turma, e não de quem chama — quem chama não escolhe empresa.
create or replace function public.training_inscrever(
  p_session  uuid,
  p_profile  uuid default null,
  p_customer uuid default null
)
returns uuid
language plpgsql
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
    -- Quem cancelou volta para inscrito. Quem já está presente ou concluiu
    -- **não** volta: reinscrever alguém que já fez o treinamento apagaria o
    -- que aconteceu, e ninguém clica nisso querendo esse resultado.
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

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Quem vê e quem mexe
-- ───────────────────────────────────────────────────────────────────────────
-- Ver é de quem tem o módulo. Montar treinamento e turma é de gestor, como
-- criar categoria ou funil. **Inscrever e marcar presença não**: é operação do
-- dia, feita por quem está na sala.
alter table public.trainings enable row level security;
alter table public.training_sessions enable row level security;
alter table public.training_enrollments enable row level security;

create policy "Quem tem o Educacional ve os treinamentos" on public.trainings
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));
create policy "Gestor monta o treinamento" on public.trainings
  for all to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()));

create policy "Quem tem o Educacional ve as turmas" on public.training_sessions
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));
create policy "Gestor abre a turma" on public.training_sessions
  for all to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.is_supervisor_or_higher(auth.uid()));

create policy "Quem tem o Educacional ve os participantes" on public.training_enrollments
  for select to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));
create policy "Quem tem o Educacional inscreve e marca presenca" on public.training_enrollments
  for all to authenticated using (
    tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()))
  with check (tenant_id = public.get_user_tenant_id() and public.has_educacional_access(auth.uid()));

revoke all on public.trainings, public.training_sessions, public.training_enrollments from anon;
