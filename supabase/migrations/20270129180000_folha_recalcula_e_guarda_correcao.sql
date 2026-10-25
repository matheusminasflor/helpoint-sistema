-- RH › FOLHA: O LÍQUIDO SE RECALCULA E A CORREÇÃO À MÃO FICA (proposta "Helpoint no dia a dia", aprovada em
-- 2026-10-24, defeito 3).
--
-- 1. Editar uma célula (INSS, adiantamento, plano…) não recalculava o total de descontos nem o líquido: só
--    `rh_generate_payroll` fazia a conta. Agora um gatilho refaz os dois a cada gravação, com a MESMA fórmula:
--    descontos = adiantamento + plano + coparticipação + empréstimo + INSS + IRPF + outros descontos;
--    líquido = bruto + salário-família − descontos.
--    O desconto de VA do mês (`rh_monthly_deductions.meal_voucher_discount`) entrava na conta e não ficava gravado em
--    coluna nenhuma; agora entra em "outros descontos", para a fórmula do gatilho ser a mesma da geração.
-- 2. Gerar de novo apagava as correções: o `ON CONFLICT … DO UPDATE` sobrescrevia tudo. Agora a linha corrigida à
--    mão fica marcada (`ajustado_a_mao`) e a geração não mexe nela; "voltar ao calculado" é desmarcar e gerar.
-- 3. De carona: gerando para "todas as empresas", o lançamento nascia sem empresa (`company_id = _company`, nulo).
--    Agora vem da ficha do colaborador.

alter table public.rh_payroll_entries add column if not exists ajustado_a_mao boolean not null default false;

create or replace function public.rh_folha_recalcula()
returns trigger language plpgsql set search_path = public as $$
begin
  new.total_deductions := coalesce(new.advance, 0) + coalesce(new.health_plan, 0) + coalesce(new.health_coparticipation, 0)
    + coalesce(new.payroll_loan, 0) + coalesce(new.inss, 0) + coalesce(new.irpf, 0) + coalesce(new.other_deductions, 0);
  new.net_salary := coalesce(new.gross_salary, 0) + coalesce(new.family_allowance, 0) - new.total_deductions;
  return new;
end;
$$;
revoke all on function public.rh_folha_recalcula() from public, anon;

drop trigger if exists rh_folha_recalcula on public.rh_payroll_entries;
create trigger rh_folha_recalcula before insert or update on public.rh_payroll_entries
  for each row execute function public.rh_folha_recalcula();

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

    -- O total e o líquido são do gatilho `rh_folha_recalcula`; os valores abaixo só preenchem a linha.
    _total_ded := 0; _net := 0;

    INSERT INTO public.rh_payroll_entries (
      tenant_id, company_id, employee_id, reference_month, gross_salary, family_allowance,
      advance, meal_voucher, transport_voucher, health_plan, health_coparticipation,
      payroll_loan, mobility, inss, irpf, other_deductions, total_deductions, net_salary,
      thirteenth_vacation, irpf_thirteenth
    ) VALUES (
      _tenant, _emp.company_id, _emp.id, _month, _gross, COALESCE(_ded.family_allowance, 0),
      _adv, _va, _vt, COALESCE(_ded.health_plan, 0), COALESCE(_ded.health_coparticipation, 0),
      COALESCE(_ded.payroll_loan, 0), _fuel, _inss, _irpf, COALESCE(_ded.meal_voucher_discount, 0), _total_ded, _net,
      ROUND(_gross * 1.333, 2), public.rh_calc_irpf((_gross * 1.333) - public.rh_calc_inss(_gross * 1.333, _tenant, _company), _tenant, _company)
    )
    ON CONFLICT (tenant_id, employee_id, reference_month) DO UPDATE SET
      company_id = EXCLUDED.company_id,
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
      other_deductions = EXCLUDED.other_deductions,
      thirteenth_vacation = EXCLUDED.thirteenth_vacation,
      irpf_thirteenth = EXCLUDED.irpf_thirteenth,
      updated_at = now()
    WHERE NOT public.rh_payroll_entries.ajustado_a_mao;
    _count := _count + 1;
  END LOOP;
  RETURN _count;
END $function$;

-- As linhas que já existem passam pela conta nova (o gatilho roda no update).
update public.rh_payroll_entries set updated_at = updated_at;
