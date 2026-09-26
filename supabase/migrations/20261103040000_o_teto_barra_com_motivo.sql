-- O teto de gasto avisava e não segurava nada — e ninguém chegava nem ao aviso
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: **barra, e libera com motivo
-- escrito** — a mesma forma da regra dos três orçamentos, que já funciona assim.
--
-- ══ POR QUE O AVISO NÃO BASTAVA ═════════════════════════════════════════════
--
-- Dois motivos, e o primeiro é pior:
--
-- 1. até a migration `20261103010000` desta mesma leva, a compra nascia SEM
--    SETOR (o formulário lia um campo que nada escrevia). Sem setor, o teto
--    lido era zero e `overBudget` era sempre falso: o aviso amarelo existia e
--    era inalcançável;
-- 2. mesmo alcançável, ele era só tela. Quem chamasse o PostgREST direto
--    aprovava sem ver aviso nenhum, e ninguém ficava com a obrigação de
--    explicar o estouro. No fim do mês o teto estava furado e não havia onde
--    ler por quê.
--
-- Este arquivo põe a regra no banco, que é onde ela vale para as duas portas.
--
-- ══ A FORMA, COPIADA DA REGRA QUE JÁ FUNCIONA ═══════════════════════════════
--
-- `fin_compra_exige_tres_orcamentos` já resolve o mesmo formato de problema:
-- barra na aprovação, libera com motivo escrito, e **apaga o motivo quando a
-- decisão é desfeita**. Esse último ponto é lição da auditoria da L8: campo que
-- justifica uma decisão precisa morrer com ela, senão a regra vale uma vez e
-- depois é de graça — a segunda aprovação passaria com o texto da primeira.
--
-- ══ O QUE CONTA COMO GASTO DO MÊS ═══════════════════════════════════════════
--
-- A mesma conta que a tela faz: soma de `estimated_amount` das compras do mesmo
-- setor, com status `approved` ou `completed`, aprovadas no mês corrente. A
-- própria linha sai da soma (`id <> new.id`), senão a compra que está sendo
-- aprovada se somaria a si mesma.
--
-- O mês é o do **Brasil**, não o do servidor: `current_date` em UTC depois das
-- 21h já é amanhã, e no dia 1º isso mudaria o mês inteiro da conta. É a regra 4
-- das cinco, do lado do banco (regra 10 do pgTAP).
--
-- ══ E O ESCOPO `purchases:manage_budget`, QUE NINGUÉM LIA ═══════════════════
--
-- Ele existia no catálogo de permissões e não mudava nada: a RLS do teto era
-- `is_manager_or_higher and has_fin_access`, e `can()` no front devolve `true`
-- para gestor antes de olhar perfil — então marcar ou desmarcar a permissão
-- dava no mesmo. Agora o escopo é um **caminho alternativo** na policy: quem não
-- é gestor mas tem a permissão marcada define teto. O front espelha com
-- `can('purchases','manage_budget')`, que é exatamente esta expressão.

begin;

alter table public.fin_purchase_requests
  add column if not exists over_budget_reason text;

comment on column public.fin_purchase_requests.over_budget_reason is
  'Por que esta compra foi aprovada acima do teto mensal do setor. Obrigatório '
  'quando estoura; apagado pelo trigger quando a aprovação é desfeita ou quando '
  'a compra passa a caber no teto.';

create or replace function public.fin_compra_respeita_teto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_antes  text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_modo   text;
  v_teto   numeric(14,2);
  v_gasto  numeric(14,2);
  v_mes    date;
  v_valor  numeric(14,2) := coalesce(new.estimated_amount, 0);
begin
  -- O motivo vive enquanto a aprovação que ele explica vive.
  if new.status::text in ('pending_approval', 'rejected') then
    new.over_budget_reason := null;
    return new;
  end if;

  if new.status::text <> 'approved' or v_antes = 'approved' then
    return new;
  end if;

  -- Sem setor não há teto a respeitar. Não é caso de barrar: compra antiga,
  -- anterior à migration do setor, não tem culpa — e inventar setor para
  -- aplicar um teto seria pior.
  if new.department is null then
    new.over_budget_reason := null;
    return new;
  end if;

  select mode into v_modo
    from public.fin_budget_settings
   where tenant_id = new.tenant_id;
  if coalesce(v_modo, '') <> 'per_department' then
    new.over_budget_reason := null;
    return new;
  end if;

  select monthly_limit into v_teto
    from public.fin_department_budgets
   where tenant_id = new.tenant_id and department = new.department;
  -- Setor sem teto definido não tem teto. Zero aqui é "não definido", e não
  -- "não pode gastar nada" — é como a tela sempre leu.
  if coalesce(v_teto, 0) <= 0 then
    new.over_budget_reason := null;
    return new;
  end if;

  v_mes := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;

  select coalesce(sum(r.estimated_amount), 0) into v_gasto
    from public.fin_purchase_requests r
   where r.tenant_id = new.tenant_id
     and r.department = new.department
     and r.status::text in ('approved', 'completed')
     and r.id <> new.id
     and r.approved_at is not null
     and (r.approved_at at time zone 'America/Sao_Paulo')::date >= v_mes;

  if v_gasto + v_valor <= v_teto then
    new.over_budget_reason := null;
    return new;
  end if;

  if coalesce(trim(new.over_budget_reason), '') = '' then
    raise exception
      'esta compra passa o teto mensal do setor %: o teto é R$ %, já foram aprovados R$ % no mês e esta soma R$ %. Para aprovar, escreva o motivo.',
      new.department,
      to_char(v_teto,  'FM999G999G990D00'),
      to_char(v_gasto, 'FM999G999G990D00'),
      to_char(v_valor, 'FM999G999G990D00')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fin_compra_respeita_teto on public.fin_purchase_requests;
create trigger trg_fin_compra_respeita_teto
  before insert or update of status on public.fin_purchase_requests
  for each row execute function public.fin_compra_respeita_teto();

-- ── O escopo que ninguém lia passa a ser um caminho ─────────────────────────
alter policy "managers write department budgets" on public.fin_department_budgets
  using (
    tenant_id = get_user_tenant_id()
    and has_fin_access(auth.uid())
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_budget')
    )
  )
  with check (
    tenant_id = get_user_tenant_id()
    and has_fin_access(auth.uid())
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_budget')
    )
  );

-- Ligar e desligar o teto é a mesma decisão que definir o valor dele.
alter policy "managers write budget settings" on public.fin_budget_settings
  using (
    tenant_id = get_user_tenant_id()
    and has_fin_access(auth.uid())
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_budget')
    )
  )
  with check (
    tenant_id = get_user_tenant_id()
    and has_fin_access(auth.uid())
    and (
      is_manager_or_higher(auth.uid())
      or tem_permissao(auth.uid(), 'financeiro', 'purchases', 'manage_budget')
    )
  );

commit;
