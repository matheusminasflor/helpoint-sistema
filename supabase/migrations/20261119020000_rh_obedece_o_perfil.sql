-- O RH OBEDECE O PERFIL DE ACESSO. 2026-10-01.
--
-- Antes: quem tinha o módulo RH (`has_rh_access`) fazia tudo em Colaboradores, Benefícios, Férias,
-- Atestados, Holerites e Documentos; Folha e Faltas eram só de gestor para cima. Nenhuma caixinha
-- do perfil do RH era lida — e a semente nem usava as mesmas chaves da tela (`absences`,
-- `documents`, `payroll.approve` não existiam no editor).
--
-- DECISÕES DO DONO (2026-10-01): cada tela do menu = uma seção, com Ver / Criar e editar /
-- Excluir valendo na tela e no banco, mais as ações especiais onde existem (aprovar, rodar folha,
-- ver salário). Padrão: Gestor tudo; Operador ver + criar e editar, sem excluir e sem ação
-- especial; Somente leitura só ver. Dono e admin sempre.
--
-- O "Meu RH" de cada funcionário (o próprio holerite, as próprias férias e atestados) NÃO muda:
-- as policies de "o próprio" ficam como estão. Muda só o lado da equipe do RH.

-- ── 1. A conta ──────────────────────────────────────────────────────────────────────────────────
create or replace function public.pode_no_rh(p_secao text, p_acao text)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select public.is_admin_or_higher(auth.uid())
      or public.tem_permissao(auth.uid(), 'rh', p_secao, p_acao);
$$;

comment on function public.pode_no_rh(text, text) is
  'A pessoa logada pode <acao> na seção <secao> do RH? Dono/admin sempre; o resto pelo perfil do RH. Espelho na tela: usePodeNoRH.';

revoke all on function public.pode_no_rh(text, text) from public, anon;
grant execute on function public.pode_no_rh(text, text) to authenticated;

-- ── 2. As policies da equipe do RH ──────────────────────────────────────────────────────────────
-- Um gabarito por tabela: ler = <secao>.view; criar e alterar = <secao>.edit; excluir =
-- <secao>.delete. As policies de "o próprio funcionário" seguem intactas ao lado.
--
-- TODO `with check` de UPDATE repete a permissão, nunca só o tenant. O Postgres junta com OR os
-- `with check` de TODAS as policies de UPDATE da tabela, não só da que deixou entrar: com um
-- `with check (tenant)` frouxo aqui, o funcionário entrava pela policy "cancela a própria férias"
-- e saía pela do RH — aprovando as próprias férias. Foi o que o CI #188 pegou
-- (`rls_policies_da_revisao`, asserção 1).

-- Colaboradores
drop policy if exists "RH gerencia perfis RH do tenant" on public.rh_employee_profiles;
drop policy if exists "Colaborador lê o próprio perfil RH" on public.rh_employee_profiles;
create policy "Colaborador lê o próprio perfil RH" on public.rh_employee_profiles for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('employees', 'view')));
create policy rh_colaboradores_cria on public.rh_employee_profiles for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('employees', 'edit'));
create policy rh_colaboradores_altera on public.rh_employee_profiles for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('employees', 'edit'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('employees', 'edit'));
create policy rh_colaboradores_exclui on public.rh_employee_profiles for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('employees', 'delete'));

-- Folha (antes: só gestor para cima)
drop policy if exists rh_payroll_entries_all on public.rh_payroll_entries;
create policy rh_folha_le on public.rh_payroll_entries for select
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('payroll', 'view'));
create policy rh_folha_cria on public.rh_payroll_entries for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('payroll', 'edit'));
create policy rh_folha_altera on public.rh_payroll_entries for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('payroll', 'edit'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('payroll', 'edit'));
create policy rh_folha_exclui on public.rh_payroll_entries for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('payroll', 'delete'));

-- Benefícios: o plano continua legível pela empresa toda (o "Meu RH" lê o plano do benefício).
drop policy if exists "RH plans manage by RH" on public.rh_benefit_plans;
create policy rh_planos_cria on public.rh_benefit_plans for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'));
create policy rh_planos_altera on public.rh_benefit_plans for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'));
create policy rh_planos_exclui on public.rh_benefit_plans for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'delete'));

drop policy if exists "RH benefits manage by RH" on public.rh_employee_benefits;
drop policy if exists "RH benefits owner read" on public.rh_employee_benefits;
create policy "RH benefits owner read" on public.rh_employee_benefits for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('benefits', 'view')));
create policy rh_beneficios_cria on public.rh_employee_benefits for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'));
create policy rh_beneficios_altera on public.rh_employee_benefits for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'edit'));
create policy rh_beneficios_exclui on public.rh_employee_benefits for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('benefits', 'delete'));

-- Férias: a equipe do RH lê e decide (aprovar/recusar). Quem pede e cancela é o próprio.
drop policy if exists "RH gerencia solicitações de férias do tenant" on public.rh_vacation_requests;
drop policy if exists "Colaborador vê suas solicitações de férias" on public.rh_vacation_requests;
create policy "Colaborador vê suas solicitações de férias" on public.rh_vacation_requests for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('vacations', 'view')));
create policy rh_ferias_decide on public.rh_vacation_requests for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('vacations', 'approve'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('vacations', 'approve'));

-- Atestados: o mesmo desenho das férias.
drop policy if exists "RH gerencia atestados do tenant" on public.rh_medical_certificates;
drop policy if exists "Colaborador vê seus atestados" on public.rh_medical_certificates;
create policy "Colaborador vê seus atestados" on public.rh_medical_certificates for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('certificates', 'view')));
create policy rh_atestados_decide on public.rh_medical_certificates for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('certificates', 'approve'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('certificates', 'approve'));

-- Faltas (antes: só gestor para cima)
drop policy if exists rh_absences_all on public.rh_absences;
create policy rh_faltas_le on public.rh_absences for select
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('absences', 'view'));
create policy rh_faltas_cria on public.rh_absences for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('absences', 'edit'));
create policy rh_faltas_altera on public.rh_absences for update
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('absences', 'edit'))
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('absences', 'edit'));
create policy rh_faltas_exclui on public.rh_absences for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('absences', 'delete'));

-- Holerites: a equipe lê e envia. O funcionário lê o seu e marca como visto (policies próprias).
drop policy if exists "RH gerencia holerites do tenant" on public.rh_payslips;
drop policy if exists "Colaborador vê seus holerites" on public.rh_payslips;
create policy "Colaborador vê seus holerites" on public.rh_payslips for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('payslips', 'view')));
create policy rh_holerites_envia on public.rh_payslips for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('payslips', 'edit'));

-- Documentos
drop policy if exists "RH documents manage by RH" on public.rh_documents;
drop policy if exists "RH documents owner read" on public.rh_documents;
create policy "RH documents owner read" on public.rh_documents for select
  using (tenant_id = get_user_tenant_id() and (user_id = auth.uid() or public.pode_no_rh('documents', 'view')));
create policy rh_documentos_cria on public.rh_documents for insert
  with check (tenant_id = get_user_tenant_id() and public.pode_no_rh('documents', 'edit'));
create policy rh_documentos_exclui on public.rh_documents for delete
  using (tenant_id = get_user_tenant_id() and public.pode_no_rh('documents', 'delete'));

-- ponytail: os ARQUIVOS no balde `rh-documents` continuam pela concessão do módulo
-- (`has_rh_access`), não pela caixinha: a linha do documento/holerite é o que a tela lista, e
-- sem a linha ninguém acha o caminho do arquivo. Teto: quem tem o módulo e sabe o caminho baixa o
-- arquivo. Saída: as policies do balde perguntarem `pode_no_rh('documents'|'payslips', …)`
-- pelo segundo segmento do caminho.

-- ── 3. Rodar a folha ────────────────────────────────────────────────────────────────────────────
-- Antes: só "gestor para cima", e sem conferir que a empresa pedida era a da pessoa — um gestor
-- podia gerar a folha de outra empresa passando o id dela. Agora: a caixinha "Rodar folha" e a
-- empresa da pessoa. O corpo é o de `pg_get_functiondef`, com a primeira checagem trocada.
create or replace function public.rh_generate_payroll(_tenant uuid, _company uuid, _month date)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE _emp record; _count int := 0; _settings record; _va numeric; _vt numeric; _fuel numeric;
  _ded record; _inss numeric; _irpf numeric; _gross numeric; _adv numeric;
  _total_ded numeric; _net numeric;
BEGIN
  IF _tenant IS DISTINCT FROM public.get_user_tenant_id() OR NOT public.pode_no_rh('payroll', 'run') THEN
    RAISE EXCEPTION 'Seu perfil de acesso não permite rodar a folha.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _settings FROM public.rh_payroll_settings
    WHERE tenant_id = _tenant AND (company_id = _company OR (_company IS NULL AND company_id IS NULL))
    ORDER BY company_id NULLS LAST LIMIT 1;
  IF _settings IS NULL THEN
    SELECT * INTO _settings FROM public.rh_payroll_settings WHERE tenant_id = _tenant LIMIT 1;
  END IF;

  FOR _emp IN
    SELECT * FROM public.rh_employee_profiles
    WHERE tenant_id = _tenant
      AND status = 'ativo'
      AND (_company IS NULL OR company_id = _company)
  LOOP
    _gross := COALESCE(_emp.base_salary, 0);
    _adv := ROUND(_gross * COALESCE(_settings.advance_pct, 0.20), 2);

    SELECT COALESCE(total, 0) - COALESCE(employee_share_20, 0) INTO _va FROM public.rh_meal_vouchers
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _va := COALESCE(_va, 0);

    SELECT COALESCE(to_deposit, 0) INTO _vt FROM public.rh_transport_vouchers
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _vt := COALESCE(_vt, 0);

    SELECT COALESCE(to_pay, 0) INTO _fuel FROM public.rh_fuel_reimbursements
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;
    _fuel := COALESCE(_fuel, 0);

    SELECT * INTO _ded FROM public.rh_monthly_deductions
      WHERE tenant_id = _tenant AND employee_id = _emp.id AND reference_month = _month;

    _inss := public.rh_calc_inss(_gross, _tenant, _company);
    _irpf := public.rh_calc_irpf(_gross - _inss, _tenant, _company);

    _total_ded := _adv + COALESCE(_ded.health_plan, 0) + COALESCE(_ded.health_coparticipation, 0)
      + COALESCE(_ded.payroll_loan, 0) + COALESCE(_ded.meal_voucher_discount, 0) + _inss + _irpf;
    _net := _gross + COALESCE(_ded.family_allowance, 0) - _total_ded;

    INSERT INTO public.rh_payroll_entries (
      tenant_id, company_id, employee_id, reference_month, gross_salary, family_allowance,
      advance, meal_voucher, transport_voucher, health_plan, health_coparticipation,
      payroll_loan, mobility, inss, irpf, other_deductions, total_deductions, net_salary,
      thirteenth_vacation, irpf_thirteenth
    ) VALUES (
      _tenant, _company, _emp.id, _month, _gross, COALESCE(_ded.family_allowance, 0),
      _adv, _va, _vt, COALESCE(_ded.health_plan, 0), COALESCE(_ded.health_coparticipation, 0),
      COALESCE(_ded.payroll_loan, 0), _fuel, _inss, _irpf, 0, _total_ded, _net,
      ROUND(_gross * 1.333, 2), public.rh_calc_irpf((_gross * 1.333) - public.rh_calc_inss(_gross * 1.333, _tenant, _company), _tenant, _company)
    )
    ON CONFLICT (tenant_id, employee_id, reference_month) DO UPDATE SET
      gross_salary = EXCLUDED.gross_salary,
      family_allowance = EXCLUDED.family_allowance,
      advance = EXCLUDED.advance,
      meal_voucher = EXCLUDED.meal_voucher,
      transport_voucher = EXCLUDED.transport_voucher,
      health_plan = EXCLUDED.health_plan,
      health_coparticipation = EXCLUDED.health_coparticipation,
      payroll_loan = EXCLUDED.payroll_loan,
      mobility = EXCLUDED.mobility,
      inss = EXCLUDED.inss,
      irpf = EXCLUDED.irpf,
      total_deductions = EXCLUDED.total_deductions,
      net_salary = EXCLUDED.net_salary,
      thirteenth_vacation = EXCLUDED.thirteenth_vacation,
      irpf_thirteenth = EXCLUDED.irpf_thirteenth,
      updated_at = now();
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $function$;

-- ── 4. Os perfis do RH no formato novo ──────────────────────────────────────────────────────────
create or replace function public.rh_secoes_do_perfil_padrao(p_nome text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select case
    when p_nome = 'Gestor' then '{
      "employees":    {"view":true,"edit":true,"delete":true,"view_salary":true},
      "payroll":      {"view":true,"edit":true,"delete":true,"run":true},
      "benefits":     {"view":true,"edit":true,"delete":true},
      "vacations":    {"view":true,"approve":true},
      "certificates": {"view":true,"approve":true},
      "absences":     {"view":true,"edit":true,"delete":true},
      "payslips":     {"view":true,"edit":true},
      "documents":    {"view":true,"edit":true,"delete":true},
      "reports":      {"view":true}}'::jsonb
    when p_nome = 'Somente leitura' then '{
      "employees":    {"view":true,"edit":false,"delete":false,"view_salary":false},
      "payroll":      {"view":true,"edit":false,"delete":false,"run":false},
      "benefits":     {"view":true,"edit":false,"delete":false},
      "vacations":    {"view":true,"approve":false},
      "certificates": {"view":true,"approve":false},
      "absences":     {"view":true,"edit":false,"delete":false},
      "payslips":     {"view":true,"edit":false},
      "documents":    {"view":true,"edit":false,"delete":false},
      "reports":      {"view":true}}'::jsonb
    else '{
      "employees":    {"view":true,"edit":true,"delete":false,"view_salary":false},
      "payroll":      {"view":true,"edit":true,"delete":false,"run":false},
      "benefits":     {"view":true,"edit":true,"delete":false},
      "vacations":    {"view":true,"approve":false},
      "certificates": {"view":true,"approve":false},
      "absences":     {"view":true,"edit":true,"delete":false},
      "payslips":     {"view":true,"edit":true},
      "documents":    {"view":true,"edit":true,"delete":false},
      "reports":      {"view":true}}'::jsonb
  end;
$$;

revoke all on function public.rh_secoes_do_perfil_padrao(text) from public, anon;
grant execute on function public.rh_secoes_do_perfil_padrao(text) to authenticated;

-- O que sai do perfil do RH: as seções antigas (`dashboard`, `profiles`) e as chaves que a semente
-- escrevia e a tela não conhecia. As seções do RH são substituídas pelo padrão do nome.
create or replace function public.rh_perfil_no_formato_novo(p_permissions jsonb, p_nome text)
returns jsonb
language sql
immutable
set search_path to 'public'
as $$
  select (p_permissions - array['employees', 'payroll', 'benefits', 'vacations', 'certificates',
                                'absences', 'payslips', 'documents', 'reports', 'dashboard',
                                'profiles'])
         || public.rh_secoes_do_perfil_padrao(p_nome);
$$;

revoke all on function public.rh_perfil_no_formato_novo(jsonb, text) from public, anon;

-- A semente de empresa nova escreve o RH sem `certificates` (e com as chaves antigas): o trigger
-- traduz. A tela grava sempre `certificates`, então perfil editado não passa por aqui.
create or replace function public.perfil_rh_no_formato_novo()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.department = 'rh' and not (new.permissions ? 'certificates') then
    new.permissions := public.rh_perfil_no_formato_novo(new.permissions, new.name);
  end if;
  return new;
end;
$$;

revoke all on function public.perfil_rh_no_formato_novo() from public, anon;

drop trigger if exists perfil_rh_no_formato_novo on public.access_profiles;
create trigger perfil_rh_no_formato_novo
  before insert or update of permissions on public.access_profiles
  for each row execute function public.perfil_rh_no_formato_novo();

update public.access_profiles
   set permissions = public.rh_perfil_no_formato_novo(permissions, name)
 where department = 'rh';
