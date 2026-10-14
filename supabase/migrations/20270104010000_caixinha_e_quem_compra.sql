-- CAIXINHA E QUEM COMPRA (dono, 2026-10-14). Pedido: "no Financeiro um caixa que recebe valor X semanal do
-- diretor para comprar suprimentos (café, adoçante, coisas do dia a dia), com entrada e saída, mostrando tudo
-- o que foi comprado e os recibos; pedido em Compras na categoria Caixinha, com o Matheus Freitas aprovando.
-- E no Compras em geral sou eu que faço as compras." Decisões (múltipla escolha, as recomendadas):
--   1. a entrada é registrada pelo Financeiro a cada repasse (o valor semanal vem sugerido);
--   2. no pedido da Caixinha, quem aprova (o "aprovador da Caixinha") também compra e anexa o recibo; a saída
--      entra no Caixinha e NÃO vira conta a pagar;
--   3. gasto sem pedido entra direto no Caixinha, com recibo obrigatório;
--   4. compra aprovada (fora da Caixinha) vai para "quem faz as compras" — configurável, para quando for outra
--      pessoa.
-- A Caixinha não pede três orçamentos, não conta no teto do setor nem pede forma de pagamento e filial:
-- é dinheiro do caixa, para o miúdo do dia a dia.

-- ─── 1. Configuração: quem compra, quem aprova a Caixinha, o valor semanal ────────────────────────
create table if not exists public.compras_config (
  tenant_id uuid primary key default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  comprador_id uuid references public.profiles(id) on delete set null,
  caixinha_aprovador_id uuid references public.profiles(id) on delete set null,
  caixinha_valor_semanal numeric(14,2) check (caixinha_valor_semanal is null or caixinha_valor_semanal >= 0),
  updated_at timestamptz not null default now()
);
alter table public.compras_config enable row level security;
create policy compras_config_le on public.compras_config for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy compras_config_cria on public.compras_config for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'comprador'));
create policy compras_config_altera on public.compras_config for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'comprador'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'comprador'));

-- A aba nova da configuração de Compras (espelho em src/config/abas-de-configuracao.ts).
create or replace function public.abas_de_configuracao(p_setor text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  select case p_setor
    when 'ti'          then array['chamados', 'cadastros', 'checklists', 'alertas']
    when 'qualidade'   then array['chamados', 'sac_link', 'sac_produtos', 'sac_categorias', 'sac_campos']
    when 'rh'          then array['chamados', 'empresas', 'departamentos', 'folha', 'feriados']
    when 'marketing'   then array['chamados']
    when 'financeiro'  then array['chamados', 'importacoes', 'conferencia']
    when 'compras'     then array['chamados', 'teto', 'comprador']
    when 'comercial'   then array['chamados', 'equipe', 'indicadores', 'cashback', 'familias', 'diretrizes']
    when 'educacional' then array['chamados']
    when 'expedicao'   then array['chamados']
    when 'producao'    then array['chamados']
    else array[]::text[]
  end;
$$;

-- A Minasflor: o dono compra, o Matheus Freitas (Financeiro) aprova a Caixinha. O valor semanal o dono preenche.
insert into public.compras_config (tenant_id, comprador_id, caixinha_aprovador_id)
select c.tenant_id, c.id, (select f.id from public.profiles f where f.tenant_id = c.tenant_id and f.email = 'financeiro@minasflor.com.br')
  from public.profiles c
 where c.email = 'ti@minasflor.com.br'
on conflict (tenant_id) do nothing;

-- ─── 2. A categoria Caixinha e a compra que nasce dela ───────────────────────────────────────────
alter table public.ti_categories add column if not exists caixinha boolean not null default false;
alter table public.compras_solicitacoes add column if not exists caixinha boolean not null default false;

insert into public.ti_categories (tenant_id, module, name, is_purchase, caixinha, sort_order)
select t.id, 'compras', 'Caixinha', true, true, 50
  from public.tenants t
 where not exists (select 1 from public.ti_categories c
                    where c.tenant_id = t.id and c.module = 'compras' and c.parent_id is null and lower(c.name) = 'caixinha');

/** A compra é da Caixinha quando a categoria do chamado (ou uma acima dela) é. */
create or replace function public.compras_marca_caixinha()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  select coalesce(c.caixinha or p.caixinha or g.caixinha, false) into new.caixinha
    from public.tickets t
    left join public.ti_categories c on c.id = t.category_id
    left join public.ti_categories p on p.id = c.parent_id
    left join public.ti_categories g on g.id = p.parent_id
   where t.id = new.ticket_id;
  new.caixinha := coalesce(new.caixinha, false);
  return new;
end;
$$;
revoke all on function public.compras_marca_caixinha() from public, anon, authenticated;
drop trigger if exists trg_compras_marca_caixinha on public.compras_solicitacoes;
create trigger trg_compras_marca_caixinha before insert on public.compras_solicitacoes
  for each row execute function public.compras_marca_caixinha();

-- ─── 3. Quem decide: a Caixinha é do aprovador dela (e do administrador) ─────────────────────────
create or replace function public.aprovador_da_caixinha(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select caixinha_aprovador_id from public.compras_config where tenant_id = p_tenant;
$$;
revoke all on function public.aprovador_da_caixinha(uuid) from public, anon;
grant execute on function public.aprovador_da_caixinha(uuid) to authenticated;

create or replace function public.pode_decidir_compra(p_caixinha boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_caixinha
              then public.is_admin_or_higher(auth.uid())
                or auth.uid() = public.aprovador_da_caixinha(public.get_user_tenant_id())
              else public.pode_no_setor('compras', 'solicitacoes', 'approve') end;
$$;
revoke all on function public.pode_decidir_compra(boolean) from public, anon;
grant execute on function public.pode_decidir_compra(boolean) to authenticated;

-- O aprovador da Caixinha pode não ter perfil de Compras: vê e decide os pedidos da Caixinha por esta porta
-- (o `with check` repete o `using`, regra 15).
create policy compras_solicitacoes_caixinha_le on public.compras_solicitacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and caixinha
         and auth.uid() = public.aprovador_da_caixinha(tenant_id));
create policy compras_solicitacoes_caixinha_decide on public.compras_solicitacoes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and caixinha
         and auth.uid() = public.aprovador_da_caixinha(tenant_id))
  with check (tenant_id = (select public.get_user_tenant_id()) and caixinha
              and auth.uid() = public.aprovador_da_caixinha(tenant_id));

create policy compras_orcamentos_caixinha_le on public.compras_orcamentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and auth.uid() = public.aprovador_da_caixinha(tenant_id)
         and exists (select 1 from public.compras_solicitacoes r where r.id = request_id and r.caixinha));
create policy compras_decisoes_caixinha_le on public.compras_decisoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and auth.uid() = public.aprovador_da_caixinha(tenant_id)
         and exists (select 1 from public.compras_solicitacoes r where r.id = request_id and r.caixinha));

/** Quem recebe o "Compra para aprovar": da Caixinha, o aprovador dela (sem ele, os administradores). */
create or replace function public.aprovadores_da_compra(p_tenant uuid, p_caixinha boolean)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when not p_caixinha then public.aprovadores_de_compra(p_tenant)
    when public.aprovador_da_caixinha(p_tenant) is not null then array[public.aprovador_da_caixinha(p_tenant)]
    else (select coalesce(array_agg(p.id), '{}') from public.profiles p
           where p.tenant_id = p_tenant and coalesce(p.is_active, true) and public.is_admin_or_higher(p.id))
  end;
$$;
revoke all on function public.aprovadores_da_compra(uuid, boolean) from public, anon, authenticated;

-- A guarda do status (20261130010000) com a porta da Caixinha: decidir é de `pode_decidir_compra`, e quem
-- aprova a Caixinha também registra a compra dela.
create or replace function public.compras_guarda_o_status()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_decide boolean;
begin
  if pg_trigger_depth() > 1 or current_user <> 'authenticated' then
    return new;
  end if;
  v_decide := public.pode_decidir_compra(old.caixinha);

  if new.status is not distinct from old.status then
    if old.status = 'adjustment_requested' and not v_decide
       and (new.product_name, new.product_id, new.department) is distinct from (old.product_name, old.product_id, old.department) then
      raise exception 'No ajuste o pedido muda só os orçamentos: produto e setor ficam (se mudou o item, abra outro pedido).'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Quem pediu reenvia depois do ajuste.
  if old.status = 'adjustment_requested' and new.status = 'pending_approval' and old.created_by = auth.uid() then
    if (new.product_name, new.product_id, new.department) is distinct from (old.product_name, old.product_id, old.department) then
      raise exception 'No ajuste o pedido muda só os orçamentos: produto e setor ficam (se mudou o item, abra outro pedido).'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.status = 'completed' then
    if not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_no_financeiro('payable', 'settle')
            or (old.caixinha and v_decide)) then
      raise exception 'Executar compra pede a permissão "Executar compra" de Compras.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not v_decide then
    raise exception '%', case when old.caixinha
      then 'Compra da Caixinha é decidida por quem aprova a Caixinha (Configurações de Compras).'
      else 'Aprovar, recusar ou pedir ajuste de compra pede a permissão "Aprovar / reprovar compra" de Compras.' end
      using errcode = '42501';
  end if;
  if new.status = 'rejected' and coalesce(trim(new.rejection_reason), '') = '' then
    raise exception 'Para recusar, escreva o motivo.' using errcode = '23514';
  end if;
  if new.status = 'adjustment_requested' and coalesce(trim(new.adjustment_reason), '') = '' then
    raise exception 'Para pedir ajuste, escreva o que precisa ser ajustado.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ─── 4. O que a Caixinha dispensa: três orçamentos, teto, forma de pagamento e filial ─────────────
create or replace function public.compras_exige_tres_orcamentos()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_quantos integer;
  v_antes   text := case when tg_op = 'UPDATE' then old.status::text else null end;
begin
  if tg_op = 'INSERT' and new.status::text = 'completed' then
    raise exception 'compra não nasce concluída: ela é aberta para análise e passa pela aprovação'
      using errcode = '23514';
  end if;
  if new.status::text in ('pending_approval', 'rejected') then
    new.few_quotes_reason := null;
    return new;
  end if;
  if new.status::text <> 'approved' or v_antes = 'approved' or new.caixinha then
    return new;
  end if;
  select count(*) into v_quantos from public.compras_orcamentos q
   where q.request_id = new.id and q.tenant_id = new.tenant_id;
  if v_quantos >= 3 then
    new.few_quotes_reason := null;
    return new;
  end if;
  if coalesce(trim(new.few_quotes_reason), '') = '' then
    raise exception
      'esta compra tem % orçamento(s): para aprovar com menos de três, escreva o motivo (fornecedor exclusivo, urgência…)',
      v_quantos using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.compras_respeita_teto()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_antes  text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_modo   text;
  v_teto   numeric(14,2);
  v_gasto  numeric(14,2);
  v_mes    date;
  v_valor  numeric(14,2) := coalesce(new.estimated_amount, 0);
begin
  if new.status::text in ('pending_approval', 'rejected') then
    new.over_budget_reason := null;
    return new;
  end if;
  if new.status::text <> 'approved' or v_antes = 'approved' then
    return new;
  end if;
  if new.department is null or new.caixinha then
    new.over_budget_reason := null;
    return new;
  end if;
  select mode into v_modo from public.fin_budget_settings where tenant_id = new.tenant_id;
  if coalesce(v_modo, '') <> 'per_department' then
    new.over_budget_reason := null;
    return new;
  end if;
  select monthly_limit into v_teto
    from public.fin_department_budgets
   where tenant_id = new.tenant_id and department = new.department;
  if coalesce(v_teto, 0) <= 0 then
    new.over_budget_reason := null;
    return new;
  end if;
  v_mes := date_trunc('month', (now() at time zone 'America/Sao_Paulo')::date)::date;
  -- A Caixinha não entra na conta do teto.
  select coalesce(sum(r.estimated_amount), 0) into v_gasto
    from public.compras_solicitacoes r
   where r.tenant_id = new.tenant_id
     and r.department = new.department
     and r.status::text in ('approved', 'completed')
     and not r.caixinha
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

create or replace function public.compras_aprovar_exige_pagamento_e_filial()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.status::text = 'pending_approval' then
    new.forma_pagamento := null;
    new.filial := null;
  elsif new.status::text = 'approved' and old.status::text <> 'approved' and not new.caixinha
        and (new.forma_pagamento is null or new.filial is null) then
    raise exception 'Para aprovar, escolha a forma de pagamento (cartão, boleto ou pix) e a filial (INBRAS ou MF).'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ─── 5. Os avisos de "para aprovar" vão para quem decide aquela compra ───────────────────────────
create or replace function public.notify_on_purchase_requested()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_who text;
begin
  select full_name into v_who from public.profiles where id = new.created_by;
  perform public.notify_ticket(new.ticket_id, 'purchase_requested', public.aprovadores_da_compra(new.tenant_id, new.caixinha),
    case when new.caixinha then 'Caixinha: compra para aprovar — ' else 'Compra para aprovar — ' end || coalesce(new.product_name, ''),
    coalesce(v_who, 'Alguém') || ' pediu aprovação' ||
      case when new.estimated_amount is not null
           then ' (estimado R$ ' || to_char(new.estimated_amount, 'FM999G999G990D00') || ').'
           else '.' end,
    true, new.created_by);
  return new;
end;
$$;

create or replace function public.compras_registra_decisao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_decisao text;
  v_obs text;
  v_quem uuid;
  v_compras uuid[];
  v_produto text := coalesce(new.product_name, '');
  v_qtd text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;
  v_quem := coalesce(auth.uid(), new.approved_by, new.rejected_by, new.executed_by);
  case new.status
    when 'approved' then v_decisao := 'aprovada'; v_obs := new.approval_notes;
    when 'rejected' then v_decisao := 'recusada'; v_obs := new.rejection_reason;
    when 'adjustment_requested' then v_decisao := 'ajuste'; v_obs := new.adjustment_reason;
    when 'completed' then v_decisao := 'concluida'; v_obs := new.purchase_report;
    when 'pending_approval' then
      if old.status <> 'adjustment_requested' then return new; end if;
      v_decisao := 'reenviada'; v_obs := new.adjustment_response;
    else return new;
  end case;
  insert into public.compras_decisoes (tenant_id, request_id, decisao, user_id, observacao)
  values (new.tenant_id, new.id, v_decisao, v_quem, nullif(trim(v_obs), ''));

  -- Quem compra: o atendente do chamado (na aprovação, `compras_vai_para_quem_compra` já pôs quem compra);
  -- sem ele, a equipe de Compras.
  select case when t.assigned_to is not null then array[t.assigned_to]
              else public.notification_team(new.tenant_id, 'compras') end
    into v_compras from public.tickets t where t.id = new.ticket_id;

  if v_decisao = 'aprovada' then
    v_qtd := case when new.quantidade_aprovada is distinct from new.quantidade
                  then 'Aprovadas ' || replace(trim_scale(new.quantidade_aprovada)::text, '.', ',') || ' de '
                       || replace(trim_scale(new.quantidade)::text, '.', ',') || ' pedidas. '
                  else '' end;
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra aprovada — ' || v_produto,
      v_qtd || coalesce(nullif(btrim(new.approval_notes), ''), 'Aguardando a compra pelo setor de Compras.'), true);
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', v_compras,
      'Compra aprovada, pode comprar — ' || v_produto,
      v_qtd || coalesce(nullif(btrim(new.approval_notes), ''), 'Registre a compra feita no chamado.'), true,
      new.created_by);
  elsif v_decisao = 'recusada' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra recusada — ' || v_produto, coalesce(new.rejection_reason, ''), true);
  elsif v_decisao = 'ajuste' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Ajuste pedido na compra — ' || v_produto, 'Corrija os orçamentos e reenvie: ' || coalesce(new.adjustment_reason, ''), true);
  elsif v_decisao = 'reenviada' then
    perform public.notify_ticket(new.ticket_id, 'purchase_requested', public.aprovadores_da_compra(new.tenant_id, new.caixinha),
      'Compra reenviada após ajuste — ' || v_produto,
      coalesce(nullif(trim(new.adjustment_response), ''), 'O solicitante ajustou os orçamentos.'), true);
  elsif v_decisao = 'concluida' then
    perform public.notify_ticket(new.ticket_id, 'purchase_decided', array[new.created_by],
      'Compra realizada — ' || v_produto, coalesce(nullif(btrim(new.purchase_report), ''), 'O chamado foi resolvido.'), true);
  end if;
  return new;
end;
$$;

-- ─── 6. Aprovada, o chamado vai para quem compra ─────────────────────────────────────────────────
-- O nome ordena antes de `trg_compras_chamado_segue_a_compra` e de `trg_compras_registra_decisao` (gatilhos
-- AFTER disparam em ordem alfabética): o aviso "pode comprar" já encontra o chamado com quem compra.
create or replace function public.compras_vai_para_quem_compra()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_quem uuid;
begin
  if new.status::text <> 'approved' or old.status::text = 'approved' or new.ticket_id is null then
    return null;
  end if;
  select case when new.caixinha then c.caixinha_aprovador_id else c.comprador_id end into v_quem
    from public.compras_config c where c.tenant_id = new.tenant_id;
  if v_quem is not null then
    update public.tickets set assigned_to = v_quem where id = new.ticket_id and assigned_to is distinct from v_quem;
  end if;
  return null;
end;
$$;
revoke all on function public.compras_vai_para_quem_compra() from public, anon, authenticated;
drop trigger if exists trg_compras_atribui_a_quem_compra on public.compras_solicitacoes;
create trigger trg_compras_atribui_a_quem_compra after update of status on public.compras_solicitacoes
  for each row execute function public.compras_vai_para_quem_compra();

-- ─── 7. O Caixinha: entradas e saídas, com recibo ────────────────────────────────────────────────
create table if not exists public.caixinha_movimentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor numeric(14,2) not null check (valor > 0),
  descricao text not null check (btrim(descricao) <> ''),
  data date not null default (now() at time zone 'America/Sao_Paulo')::date,
  recibo_path text,
  purchase_request_id uuid unique references public.compras_solicitacoes(id) on delete set null,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Saída sem recibo não entra (dono: "mostra tudo que foi comprado e os recibos").
  constraint caixinha_saida_tem_recibo check (tipo = 'entrada' or nullif(btrim(recibo_path), '') is not null)
);
create index if not exists caixinha_movimentos_tenant_data on public.caixinha_movimentos (tenant_id, data desc);
alter table public.caixinha_movimentos enable row level security;

/** Ver, lançar ou apagar no Caixinha: o perfil do Financeiro (seção "Caixinha"), o aprovador dela e o administrador. */
create or replace function public.pode_na_caixinha(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'caixinha', p_acao), false)
      or (p_acao in ('view', 'create') and auth.uid() = public.aprovador_da_caixinha(public.get_user_tenant_id()));
$$;
revoke all on function public.pode_na_caixinha(text) from public, anon;
grant execute on function public.pode_na_caixinha(text) to authenticated;

create policy caixinha_le on public.caixinha_movimentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('view'));
-- A saída de uma compra entra pelo gatilho da compra; à mão, só o lançamento solto.
create policy caixinha_lanca on public.caixinha_movimentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('create')
              and purchase_request_id is null and created_by = auth.uid());
create policy caixinha_apaga on public.caixinha_movimentos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('delete')
         and purchase_request_id is null);

create or replace function public.caixinha_saldo(p_tenant uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
    from public.caixinha_movimentos where tenant_id = p_tenant;
$$;
revoke all on function public.caixinha_saldo(uuid) from public, anon, authenticated;

/** Saída maior que o saldo não entra: o dinheiro do caixa não fica negativo. */
create or replace function public.caixinha_nao_fica_negativo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := public.caixinha_saldo(new.tenant_id);
begin
  if new.tipo = 'saida' and v_saldo - new.valor < 0 then
    raise exception 'O Caixinha tem R$ % e esta saída é de R$ %: registre a entrada antes.',
      to_char(v_saldo, 'FM999G999G990D00'), to_char(new.valor, 'FM999G999G990D00') using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.caixinha_nao_fica_negativo() from public, anon, authenticated;
drop trigger if exists trg_caixinha_nao_fica_negativo on public.caixinha_movimentos;
create trigger trg_caixinha_nao_fica_negativo before insert on public.caixinha_movimentos
  for each row execute function public.caixinha_nao_fica_negativo();

-- O Gestor do Financeiro ganha a seção Caixinha inteira.
update public.access_profiles
   set permissions = coalesce(permissions, '{}'::jsonb) || '{"caixinha": {"view": true, "create": true, "delete": true}}'::jsonb
 where department = 'financeiro' and name = 'Gestor';

-- ─── 8. A compra da Caixinha registrada vira saída do Caixinha, não conta a pagar ────────────────
create or replace function public.compras_vira_conta_a_pagar()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_valor numeric(14,2);
  v_fornecedor text;
  v_vencimento date;
  v_antes text := case when tg_op = 'UPDATE' then old.status::text else null end;
  v_conta public.fin_entries%rowtype;
  v_notas text := nullif(trim(both E'\n' from
    coalesce('Filial: ' || new.filial, '') || E'\n' || coalesce(trim(new.purchase_report), '')), '');
  v_ja_paga boolean := coalesce(new.forma_pagamento in ('pix', 'cartao'), false);
begin
  if v_antes = 'completed' and new.status::text <> 'completed' then
    if new.caixinha then
      delete from public.caixinha_movimentos where purchase_request_id = new.id;
      return new;
    end if;
    update public.fin_entries
       set status = 'cancelled',
           notes = trim(both E'\n' from coalesce(notes, '') || E'\n' || 'Cancelada: a compra deixou de estar concluída.')
     where purchase_request_id = new.id and status in ('pending', 'overdue');
    return new;
  end if;
  if new.status::text <> 'completed' or v_antes = 'completed' then
    return new;
  end if;
  select round(coalesce(q.valor_unitario, (q.amount - q.frete) / nullif(new.quantidade, 0))
               * coalesce(new.quantidade_aprovada, new.quantidade) + q.frete, 2),
         coalesce(nullif(trim(s.name), ''), nullif(trim(q.supplier), ''))
    into v_valor, v_fornecedor
    from public.compras_orcamentos q
    left join public.suppliers s on s.id = q.supplier_id and s.tenant_id = q.tenant_id
   where q.id = new.approved_quote_id and q.tenant_id = new.tenant_id;
  v_valor := coalesce(v_valor, new.estimated_amount);
  if v_valor is null or v_valor <= 0 then
    return new;
  end if;
  if new.caixinha then
    insert into public.caixinha_movimentos (tenant_id, tipo, valor, descricao, recibo_path, purchase_request_id, created_by)
    values (new.tenant_id, 'saida', v_valor,
            left('Compra: ' || coalesce(new.product_name, 'sem descrição') || coalesce(' (' || v_fornecedor || ')', ''), 200),
            new.purchase_file_path, new.id, new.executed_by)
    on conflict (purchase_request_id) do nothing;
    return new;
  end if;
  select * into v_conta from public.fin_entries where purchase_request_id = new.id and status = 'paid';
  if found then
    if v_conta.amount = v_valor then return new; end if;
    raise exception 'esta compra já tem conta paga de R$ % e agora vale R$ %: acerte a diferença no Financeiro antes de concluir de novo',
      to_char(v_conta.amount, 'FM999G999G990D00'), to_char(v_valor, 'FM999G999G990D00') using errcode = '23514';
  end if;
  v_vencimento := case when v_ja_paga then null else new.payment_due_date end;
  v_vencimento := coalesce(v_vencimento, (now() at time zone 'America/Sao_Paulo')::date);
  insert into public.fin_entries (
    tenant_id, kind, description, category, counterparty, amount, due_date, status, payment_method,
    cost_center, competence, source, notes, purchase_request_id, created_by
  ) values (
    new.tenant_id, 'payable', 'Compra: ' || left(coalesce(new.product_name, 'sem descrição'), 140),
    'compras', v_fornecedor, v_valor, v_vencimento,
    case when v_ja_paga then 'paid' else 'pending' end::public.fin_entry_status,
    case new.forma_pagamento when 'cartao' then 'Cartão' when 'boleto' then 'Boleto' when 'pix' then 'Pix' end,
    nullif(trim(new.department), ''), date_trunc('month', v_vencimento)::date, 'compra',
    v_notas, new.id, new.executed_by
  )
  on conflict (purchase_request_id) where purchase_request_id is not null do update
     set status = excluded.status, amount = excluded.amount, counterparty = excluded.counterparty,
         description = excluded.description, due_date = excluded.due_date, competence = excluded.competence,
         cost_center = excluded.cost_center, notes = excluded.notes, payment_method = excluded.payment_method
   where public.fin_entries.status = 'cancelled';
  return new;
end;
$$;
