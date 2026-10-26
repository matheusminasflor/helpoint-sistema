-- RH: UMA LISTA SÓ DE PESSOAS (rodada 2, R4; decisão 5 do dono e as quatro de 2026-10-25).
--
-- Até aqui o RH tinha duas listas. Folha, Faltas e Vales liam o COLABORADOR (`rh_employee_profiles`); Holerites,
-- Documentos, Benefícios, Férias e Atestados liam o LOGIN (`profiles`, por `user_id`). Quem trabalha na Minasflor e não
-- tem login no Helpoint (produção, expedição) não recebia holerite, documento nem benefício, e não tinha férias. Agora a
-- pessoa do RH é o colaborador; o login é um detalhe dele (`rh_employee_profiles.user_id`, ligado pelo e-mail).
--
-- As cinco tabelas do login ganham `employee_id` (o colaborador). O `user_id` delas fica, ESPELHO do login do
-- colaborador mantido por gatilho: é por ele que o colaborador se vê no Meu RH (as policies `user_id = auth.uid()`) e que
-- os avisos chegam. ponytail: duas colunas para a mesma pessoa, de propósito — reescrever as 21 policies e as 9 funções
-- que perguntam `user_id` por uma consulta ao colaborador custaria mais e acrescentaria lição 13 em cada uma; o espelho
-- não diverge porque só o gatilho o escreve (o que a tela mandar é sobrescrito).
--
-- Decisões do dono (2026-10-25): a lista começa com as pessoas que têm login (copiadas aqui); a planilha identifica pelo
-- CPF, obrigatório (e, quando não acha o CPF, pelo e-mail — as copiadas não têm CPF ainda); empresa que a planilha traz
-- e o RH não tem é criada pelo nome; "férias vencendo" acende 60 dias antes do fim do prazo de tirar.
-- Todas as tabelas do RH estavam vazias na produção (0 linhas), por isso as colunas novas já nascem NOT NULL.

-- ─── 1. A lista começa com quem tem login ──────────────────────────────────────────────────────────────────
insert into public.rh_employee_profiles (tenant_id, user_id, full_name, access_email, department, status)
select p.tenant_id, p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), lower(p.email), p.department, 'ativo'
  from public.profiles p
 where p.tenant_id is not null and coalesce(p.is_active, true)
   and not exists (select 1 from public.rh_employee_profiles e where e.user_id = p.id);

-- CPF identifica (a planilha atualiza em vez de duplicar). Só os dígitos contam: "123.456.789-09" = "12345678909".
create unique index if not exists rh_colaborador_cpf_unico on public.rh_employee_profiles
  (tenant_id, regexp_replace(cpf, '\D', '', 'g'))
  where nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '') is not null;

-- ─── 2. As cinco tabelas do login passam a ser do colaborador ──────────────────────────────────────────────
alter table public.rh_payslips             add column if not exists employee_id uuid not null references public.rh_employee_profiles(id) on delete cascade;
alter table public.rh_documents            add column if not exists employee_id uuid not null references public.rh_employee_profiles(id) on delete cascade;
alter table public.rh_employee_benefits    add column if not exists employee_id uuid not null references public.rh_employee_profiles(id) on delete cascade;
alter table public.rh_vacation_requests    add column if not exists employee_id uuid not null references public.rh_employee_profiles(id) on delete cascade;
alter table public.rh_medical_certificates add column if not exists employee_id uuid not null references public.rh_employee_profiles(id) on delete cascade;
alter table public.rh_payslips             alter column user_id drop not null;
alter table public.rh_documents            alter column user_id drop not null;
alter table public.rh_employee_benefits    alter column user_id drop not null;
alter table public.rh_vacation_requests    alter column user_id drop not null;
alter table public.rh_medical_certificates alter column user_id drop not null;
create index if not exists rh_payslips_do_colaborador             on public.rh_payslips (employee_id);
create index if not exists rh_documents_do_colaborador            on public.rh_documents (employee_id);
create index if not exists rh_employee_benefits_do_colaborador    on public.rh_employee_benefits (employee_id);
create index if not exists rh_vacation_requests_do_colaborador    on public.rh_vacation_requests (employee_id);
create index if not exists rh_medical_certificates_do_colaborador on public.rh_medical_certificates (employee_id);

-- O colaborador e o login andam juntos. O RH grava pelo colaborador (`employee_id`), e o login vem dele. O colaborador
-- no Meu RH grava pelo login (`user_id`, o que a tela dele sabe), e o colaborador é achado por ele — sem cadastro no RH,
-- o pedido é recusado com a frase de o que fazer. Mandar o colaborador de outra pessoa não passa: o login vira o dela, e
-- a policy (`user_id = auth.uid()`) recusa.
create or replace function public.rh_colaborador_e_login()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  if new.employee_id is null then
    select e.id into new.employee_id from public.rh_employee_profiles e
     where e.user_id = new.user_id and e.tenant_id = new.tenant_id;
    if new.employee_id is null then
      raise exception 'O RH ainda não cadastrou você na lista de colaboradores. Fale com o RH.' using errcode = '23514';
    end if;
  end if;
  select e.tenant_id, e.user_id into v_tenant, new.user_id from public.rh_employee_profiles e where e.id = new.employee_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'Colaborador de outra empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.rh_colaborador_e_login() from public, anon, authenticated;
do $$
declare t text;
begin
  foreach t in array array['rh_payslips', 'rh_documents', 'rh_employee_benefits', 'rh_vacation_requests', 'rh_medical_certificates'] loop
    execute format('drop trigger if exists aa_rh_colaborador_e_login on public.%I', t);
    -- "aa_": antes dos outros gatilhos da tabela (ordem alfabética), que já encontram o colaborador e o login.
    execute format('create trigger aa_rh_colaborador_e_login before insert or update of employee_id, user_id on public.%I
                      for each row execute function public.rh_colaborador_e_login()', t);
  end loop;
end;
$$;

-- O colaborador ganhou (ou trocou) o login: o espelho acompanha nas cinco tabelas.
create or replace function public.rh_login_do_colaborador_acompanha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.rh_payslips             set user_id = new.user_id where employee_id = new.id and user_id is distinct from new.user_id;
  update public.rh_documents            set user_id = new.user_id where employee_id = new.id and user_id is distinct from new.user_id;
  update public.rh_employee_benefits    set user_id = new.user_id where employee_id = new.id and user_id is distinct from new.user_id;
  update public.rh_vacation_requests    set user_id = new.user_id where employee_id = new.id and user_id is distinct from new.user_id;
  update public.rh_medical_certificates set user_id = new.user_id where employee_id = new.id and user_id is distinct from new.user_id;
  return null;
end;
$$;
revoke all on function public.rh_login_do_colaborador_acompanha() from public, anon, authenticated;
drop trigger if exists trg_rh_login_do_colaborador_acompanha on public.rh_employee_profiles;
create trigger trg_rh_login_do_colaborador_acompanha after update of user_id on public.rh_employee_profiles
  for each row when (new.user_id is distinct from old.user_id)
  execute function public.rh_login_do_colaborador_acompanha();

create or replace function pg_temp.troca(p_funcao regprocedure, p_de text, p_para text)
returns void language plpgsql as $$
declare
  v_def text := pg_get_functiondef(p_funcao);
begin
  if position(p_de in v_def) = 0 then
    raise exception 'trecho não encontrado em %: %', p_funcao, left(p_de, 80);
  end if;
  execute replace(v_def, p_de, p_para);
end;
$$;

-- O espelho é escrito por gatilho (o login chega depois do holerite): a trava do colaborador não o barra (lição 8 —
-- escrita de gatilho é do sistema). Sem isto, criar o login de quem já tem holerite falhava com 42501.
select pg_temp.troca('public.rh_payslips_guard_colaborador()'::regprocedure,
  '  if public.has_rh_access(auth.uid()) then',
  '  if pg_trigger_depth() > 1 or public.has_rh_access(auth.uid()) then');

-- Holerite e documento de quem não tem login: não há a quem avisar (o RH entrega por fora).
select pg_temp.troca('public.notify_on_rh_document()'::regprocedure,
  $$begin
  if tg_table_name = 'rh_payslips' then$$,
  $$begin
  if new.user_id is null then return new; end if;
  if tg_table_name = 'rh_payslips' then$$);

-- Os arquivos (holerite, cofre) ficam na pasta do COLABORADOR (`<empresa>/<id do colaborador>/...`): quem não tem login
-- também recebe, e quem ganha o login depois continua abrindo os de antes. O colaborador lê a pasta do seu cadastro.
create or replace function public.meu_colaborador_id()
returns uuid language sql stable security definer set search_path = public as $$
  select e.id from public.rh_employee_profiles e
   where e.user_id = auth.uid() and e.tenant_id = public.get_user_tenant_id()
$$;
revoke all on function public.meu_colaborador_id() from public, anon;
grant execute on function public.meu_colaborador_id() to authenticated;
drop policy if exists "Colaborador lê a pasta do seu cadastro no RH" on storage.objects;
create policy "Colaborador lê a pasta do seu cadastro no RH" on storage.objects for select to authenticated
  using (bucket_id = 'rh-documents'
         and (storage.foldername(name))[1] = public.get_user_tenant_id()::text
         and (storage.foldername(name))[2] = public.meu_colaborador_id()::text);

-- ─── 3. Férias aprovadas atualizam o último período ────────────────────────────────────────────────────────
-- Até aqui nada escrevia `last_vacation_end`; é ele que diz se as férias do ano já foram tiradas (indicador abaixo).
create or replace function public.rh_ferias_aprovadas_marcam_o_periodo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.type = 'ferias' and new.status = 'aprovada' and (tg_op = 'INSERT' or old.status is distinct from 'aprovada') then
    update public.rh_employee_profiles
       set last_vacation_end = greatest(coalesce(last_vacation_end, new.end_date), new.end_date), updated_at = now()
     where id = new.employee_id;
  end if;
  return null;
end;
$$;
revoke all on function public.rh_ferias_aprovadas_marcam_o_periodo() from public, anon, authenticated;
drop trigger if exists trg_rh_ferias_aprovadas_marcam_o_periodo on public.rh_vacation_requests;
create trigger trg_rh_ferias_aprovadas_marcam_o_periodo after insert or update of status on public.rh_vacation_requests
  for each row execute function public.rh_ferias_aprovadas_marcam_o_periodo();

-- ─── 4. Importar colaboradores por planilha ────────────────────────────────────────────────────────────────
-- `p_linhas`: [{linha, nome, cpf, admissao, empresa, setor, cargo, email?, salario?, contrato?, gestor_email?,
-- nascimento?, matricula?, centro_custo?, ultimas_ferias_fim?}] (datas em AAAA-MM-DD; a tela lê o modelo e converte).
-- Com `p_confirmar` falso só confere e conta (a prévia); verdadeiro grava. Acha a pessoa pelo CPF; sem CPF igual, pelo
-- e-mail (as pessoas copiadas do login ainda não têm CPF — a planilha completa). O salário só entra para quem tem "Ver
-- salário" no perfil do RH (é a mesma regra do cadastro na tela); sem ela, a coluna é ignorada e a prévia avisa.
create or replace function public.rh_importar_colaboradores(p_linhas jsonb, p_confirmar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_salario boolean := public.pode_no_rh('employees', 'view_salary');
  l jsonb;
  n int;
  v_cpf text;
  v_email text;
  v_adm date;
  v_nasc date;
  v_ferias date;
  v_sal numeric;
  v_empresa text;
  v_empresa_id uuid;
  v_id uuid;
  v_user uuid;
  v_gestor uuid;
  v_gestor_nome text;
  v_motivo text;
  v_criar int := 0;
  v_atualizar int := 0;
  v_recusadas jsonb := '[]'::jsonb;
  v_empresas_novas text[] := '{}';
  v_cpfs text[] := '{}';
  v_sal_ignorado boolean := false;
begin
  if v_tenant is null or not public.pode_no_rh('employees', 'edit') then
    raise exception 'Importar colaboradores pede "Editar" em Colaboradores no perfil do RH.' using errcode = '42501';
  end if;

  for l in select * from jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) loop
    n := coalesce((l ->> 'linha')::int, 0);
    v_motivo := null;
    v_cpf := regexp_replace(coalesce(l ->> 'cpf', ''), '\D', '', 'g');
    v_email := nullif(lower(btrim(coalesce(l ->> 'email', ''))), '');
    begin
      v_adm := nullif(btrim(coalesce(l ->> 'admissao', '')), '')::date;
      v_nasc := nullif(btrim(coalesce(l ->> 'nascimento', '')), '')::date;
      v_ferias := nullif(btrim(coalesce(l ->> 'ultimas_ferias_fim', '')), '')::date;
      v_sal := nullif(btrim(coalesce(l ->> 'salario', '')), '')::numeric;
    exception when others then
      v_motivo := 'data ou salário que não é número';
    end;

    if v_motivo is null then
      v_motivo := case
        when btrim(coalesce(l ->> 'nome', '')) = '' then 'falta o nome'
        when length(v_cpf) <> 11 then 'CPF precisa de 11 dígitos'
        when v_cpf = any (v_cpfs) then 'CPF repetido na planilha'
        when v_adm is null then 'falta a data de admissão'
        when btrim(coalesce(l ->> 'empresa', '')) = '' then 'falta a empresa'
        when btrim(coalesce(l ->> 'setor', '')) = '' then 'falta o setor'
        when btrim(coalesce(l ->> 'cargo', '')) = '' then 'falta o cargo'
        when v_sal is not null and v_sal < 0 then 'salário negativo'
      end;
    end if;
    if v_motivo is not null then
      v_recusadas := v_recusadas || jsonb_build_object('linha', n, 'motivo', v_motivo);
      continue;
    end if;
    v_cpfs := v_cpfs || v_cpf;

    -- A pessoa: pelo CPF; sem ele, pelo e-mail (do cadastro do RH ou do login).
    select e.id into v_id from public.rh_employee_profiles e
     where e.tenant_id = v_tenant and regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g') = v_cpf;
    if v_id is null and v_email is not null then
      select e.id into v_id from public.rh_employee_profiles e
        left join public.profiles p on p.id = e.user_id
       where e.tenant_id = v_tenant and nullif(regexp_replace(coalesce(e.cpf, ''), '\D', '', 'g'), '') is null
         and (lower(e.access_email) = v_email or lower(p.email) = v_email)
       limit 1;
    end if;
    -- O login de quem tem: pelo e-mail; já ligado a OUTRO colaborador, a linha é recusada.
    select p.id into v_user from public.profiles p where p.tenant_id = v_tenant and lower(p.email) = v_email limit 1;
    if v_user is not null and exists (select 1 from public.rh_employee_profiles e
                                       where e.user_id = v_user and e.id is distinct from v_id) then
      v_recusadas := v_recusadas || jsonb_build_object('linha', n, 'motivo', 'o login ' || v_email || ' já está ligado a outro colaborador');
      v_id := null; v_user := null;
      continue;
    end if;

    v_empresa := btrim(l ->> 'empresa');
    select c.id into v_empresa_id from public.rh_companies c
     where c.tenant_id = v_tenant and (lower(c.name) = lower(v_empresa) or lower(c.code) = lower(v_empresa));
    if v_empresa_id is null and not (lower(v_empresa) = any (select lower(x) from unnest(v_empresas_novas) x)) then
      v_empresas_novas := v_empresas_novas || v_empresa;
    end if;
    if v_sal is not null and not v_salario then v_sal_ignorado := true; end if;

    if v_id is null then v_criar := v_criar + 1; else v_atualizar := v_atualizar + 1; end if;

    if p_confirmar then
      if v_empresa_id is null then
        -- O código é o começo do nome; se já é de outra empresa, fica com ela (nunca renomeia o que existe).
        insert into public.rh_companies (tenant_id, code, name, is_active)
        values (v_tenant, upper(left(v_empresa, 20)), v_empresa, true)
        on conflict (tenant_id, code) do nothing
        returning id into v_empresa_id;
        if v_empresa_id is null then
          select c.id into v_empresa_id from public.rh_companies c
           where c.tenant_id = v_tenant and c.code = upper(left(v_empresa, 20));
        end if;
      end if;
      select p.id, coalesce(p.full_name, p.email) into v_gestor, v_gestor_nome from public.profiles p
       where p.tenant_id = v_tenant and lower(p.email) = nullif(lower(btrim(coalesce(l ->> 'gestor_email', ''))), '') limit 1;

      if v_id is null then
        insert into public.rh_employee_profiles (tenant_id, full_name, cpf, admission_date, company_id, department, job_title,
          position, access_email, user_id, contract_type, manager_user_id, manager_name, birth_date, matricula, cost_center,
          last_vacation_end, base_salary, probation_45, probation_90, status)
        values (v_tenant, btrim(l ->> 'nome'), v_cpf, v_adm, v_empresa_id, btrim(l ->> 'setor'), btrim(l ->> 'cargo'),
          btrim(l ->> 'cargo'), v_email, v_user, nullif(btrim(coalesce(l ->> 'contrato', '')), ''), v_gestor, v_gestor_nome,
          v_nasc, nullif(btrim(coalesce(l ->> 'matricula', '')), ''), nullif(btrim(coalesce(l ->> 'centro_custo', '')), ''),
          v_ferias, case when v_salario then v_sal end, v_adm + 45, v_adm + 90, 'ativo');
      else
        -- Atualiza o que a planilha traz; o que veio em branco fica como estava.
        update public.rh_employee_profiles e set
          full_name = btrim(l ->> 'nome'), cpf = v_cpf, admission_date = v_adm, company_id = v_empresa_id,
          department = btrim(l ->> 'setor'), job_title = btrim(l ->> 'cargo'), position = btrim(l ->> 'cargo'),
          access_email = coalesce(v_email, e.access_email), user_id = coalesce(e.user_id, v_user),
          contract_type = coalesce(nullif(btrim(coalesce(l ->> 'contrato', '')), ''), e.contract_type),
          manager_user_id = coalesce(v_gestor, e.manager_user_id), manager_name = coalesce(v_gestor_nome, e.manager_name),
          birth_date = coalesce(v_nasc, e.birth_date),
          matricula = coalesce(nullif(btrim(coalesce(l ->> 'matricula', '')), ''), e.matricula),
          cost_center = coalesce(nullif(btrim(coalesce(l ->> 'centro_custo', '')), ''), e.cost_center),
          last_vacation_end = coalesce(v_ferias, e.last_vacation_end),
          base_salary = case when v_salario and v_sal is not null then v_sal else e.base_salary end,
          probation_45 = coalesce(e.probation_45, v_adm + 45), probation_90 = coalesce(e.probation_90, v_adm + 90),
          updated_at = now()
         where e.id = v_id;
      end if;
    end if;
    v_id := null; v_user := null; v_empresa_id := null; v_gestor := null; v_gestor_nome := null;
  end loop;

  return jsonb_build_object('criar', v_criar, 'atualizar', v_atualizar, 'empresas_novas', to_jsonb(v_empresas_novas),
                            'recusadas', v_recusadas, 'salario_ignorado', v_sal_ignorado, 'gravou', p_confirmar);
end;
$$;
revoke all on function public.rh_importar_colaboradores(jsonb, boolean) from public, anon;
grant execute on function public.rh_importar_colaboradores(jsonb, boolean) to authenticated;

-- Quem tem login e não está na lista do RH (quem entrar no Helpoint depois da cópia), e incluir com um toque.
create or replace function public.rh_logins_fora_da_lista()
returns table (user_id uuid, nome text, email text, setor text)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), p.email, p.department
    from public.profiles p
   where p.tenant_id = public.get_user_tenant_id() and coalesce(p.is_active, true)
     and public.pode_no_rh('employees', 'view')
     and not exists (select 1 from public.rh_employee_profiles e where e.user_id = p.id)
   order by 2;
$$;
revoke all on function public.rh_logins_fora_da_lista() from public, anon;
grant execute on function public.rh_logins_fora_da_lista() to authenticated;

create or replace function public.rh_incluir_login_na_lista(p_user uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.pode_no_rh('employees', 'edit') then
    raise exception 'Incluir na lista pede "Editar" em Colaboradores no perfil do RH.' using errcode = '42501';
  end if;
  insert into public.rh_employee_profiles (tenant_id, user_id, full_name, access_email, department, status)
  select p.tenant_id, p.id, coalesce(nullif(btrim(p.full_name), ''), p.email), lower(p.email), p.department, 'ativo'
    from public.profiles p
   where p.id = p_user and p.tenant_id = public.get_user_tenant_id()
     and not exists (select 1 from public.rh_employee_profiles e where e.user_id = p.id)
  returning id into v_id;
  if v_id is null then raise exception 'Essa pessoa já está na lista do RH (ou não é desta empresa).' using errcode = '23505'; end if;
  return v_id;
end;
$$;
revoke all on function public.rh_incluir_login_na_lista(uuid) from public, anon;
grant execute on function public.rh_incluir_login_na_lista(uuid) to authenticated;

-- ─── 5. Os indicadores do RH ───────────────────────────────────────────────────────────────────────────────
-- Pessoas (no fim do período), entradas, saídas, faltas, custo da folha e férias vencendo. "Hoje" é o do Brasil (regra
-- 4, lado do banco).
--
-- Férias (CLT): cada ano de casa completo (período aquisitivo) dá direito a férias, que têm de ser tiradas nos 12 meses
-- seguintes (período concessivo). Vencendo: o período do último ano completo, sem férias tiradas desde que ele fechou,
-- com o prazo a 60 dias ou menos (decisão do dono). Vencida: o período ANTERIOR sem férias dentro dele — só para quem tem
-- histórico no sistema (férias registradas ou "últimas férias" informadas): sem histórico não se sabe, e acender todo
-- mundo admitido há mais de 2 anos seria mentira.
-- ponytail: férias divididas contam como tiradas no primeiro pedaço; o saldo em dias (`vacation_balance_days`) segue à
-- mão. Se o RH pedir o saldo por período, guardar os períodos numa tabela.
create or replace function public.rh_indicadores(p_de date, p_ate date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_resultado jsonb;
begin
  if not public.rel_pode('rh', 'reports') then
    raise exception 'Os indicadores do RH pedem "Indicadores" no perfil do RH.' using errcode = '42501';
  end if;

  with colab as (
    select e.* from public.rh_employee_profiles e where e.tenant_id = v_tenant
  ),
  ferias as (
    select c.id, c.full_name, c.admission_date as adm, c.last_vacation_end as ultima,
           extract(year from age(v_hoje, c.admission_date))::int as anos,
           exists (select 1 from public.rh_vacation_requests v where v.employee_id = c.id
                    and v.type = 'ferias' and v.status = 'aprovada') or c.last_vacation_end is not null as tem_historico
      from colab c
     where c.admission_date is not null and coalesce(c.status, 'ativo') <> 'desligado'
       and (c.termination_date is null or c.termination_date > v_hoje)
  ),
  avisos as (
    -- O período do último ano completo: o prazo vai até (admissão + anos + 1 ano).
    select f.id, f.full_name, (f.adm + make_interval(years => f.anos + 1))::date as vence_em, 'vencendo' as situacao
      from ferias f
     where f.anos >= 1
       and (f.adm + make_interval(years => f.anos + 1))::date <= v_hoje + 60
       and not (coalesce(f.ultima, '1900-01-01') >= (f.adm + make_interval(years => f.anos))::date
                or exists (select 1 from public.rh_vacation_requests v where v.employee_id = f.id and v.type = 'ferias'
                             and v.status = 'aprovada' and v.start_date >= (f.adm + make_interval(years => f.anos))::date))
    union all
    -- O período anterior, cujo prazo já passou.
    select f.id, f.full_name, (f.adm + make_interval(years => f.anos))::date, 'vencida'
      from ferias f
     where f.anos >= 2 and f.tem_historico
       and not (coalesce(f.ultima, '1900-01-01') >= (f.adm + make_interval(years => f.anos - 1))::date
                or exists (select 1 from public.rh_vacation_requests v where v.employee_id = f.id and v.type = 'ferias'
                             and v.status = 'aprovada' and v.start_date >= (f.adm + make_interval(years => f.anos - 1))::date))
  )
  select jsonb_build_object(
    'pessoas', (select count(*) from colab c
                 where coalesce(c.admission_date, p_ate) <= p_ate and (c.termination_date is null or c.termination_date > p_ate)
                   and (coalesce(c.status, 'ativo') <> 'desligado' or c.termination_date > p_ate)),
    'entradas', (select count(*) from colab c where c.admission_date between p_de and p_ate),
    'saidas', (select count(*) from colab c where c.termination_date between p_de and p_ate),
    'faltas', (select coalesce(jsonb_object_agg(k.kind, jsonb_build_object('vezes', k.vezes, 'dias', k.dias)), '{}'::jsonb)
                 from (select a.kind, count(*) as vezes, sum(a.days) as dias from public.rh_absences a
                        where a.tenant_id = v_tenant and a.date between p_de and p_ate group by a.kind) k),
    'folha', (select jsonb_build_object('bruto', coalesce(sum(pe.gross_salary), 0), 'liquido', coalesce(sum(pe.net_salary), 0),
                                        'meses', count(distinct pe.reference_month))
                from public.rh_payroll_entries pe
               where pe.tenant_id = v_tenant
                 and pe.reference_month between date_trunc('month', p_de)::date and p_ate),
    'ferias', (select coalesce(jsonb_agg(jsonb_build_object('colaborador_id', a.id, 'nome', a.full_name,
                                                             'vence_em', a.vence_em, 'situacao', a.situacao)
                                          order by a.vence_em), '[]'::jsonb) from avisos a)
  ) into v_resultado;
  return v_resultado;
end;
$$;
revoke all on function public.rh_indicadores(date, date) from public, anon;
grant execute on function public.rh_indicadores(date, date) to authenticated;
