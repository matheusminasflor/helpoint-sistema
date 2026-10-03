-- A DIRETORIA DECIDE AS COMPRAS (decisões do dono, 2026-10-03).
--
-- "Diretoria para aprovar compras — área específica: aprovar, recusar e solicitar ajustes. Exibir
-- fornecedor, valor, solicitante, justificativas e anexos. Registrar decisão, usuário, data e
-- observações; contador de pendências no menu." Decisões (múltipla escolha):
--   * ver: quem tem o módulo Diretoria passa a ler as solicitações e os orçamentos;
--   * decidir: continua SÓ com a caixinha "Aprovar / reprovar compra" de Compras (e administrador);
--   * "Solicitar ajustes" devolve ao solicitante — ele mexe só nos ORÇAMENTOS e responde o que ajustou;
--     produto e setor ficam (se mudou o item, é outro pedido);
--   * observação obrigatória para recusar e para pedir ajuste; opcional para aprovar;
--   * toda decisão fica registrada: qual, quem, quando, observação (`compras_decisoes`).

-- ─── Ver ─────────────────────────────────────────────────────────────────────
create or replace function public.compras_ve_as_solicitacoes()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.pode_no_setor('compras', 'solicitacoes', 'view')
      or public.pode_no_setor('compras', 'solicitacoes', 'approve')
      or public.pode_no_setor('compras', 'solicitacoes', 'execute')
      or public.pode_no_financeiro('payable', 'settle')
      or exists (select 1 from public.user_module_access m
                  where m.user_id = auth.uid() and m.module = 'diretoria');
$$;

-- ─── O ajuste ────────────────────────────────────────────────────────────────
alter table public.compras_solicitacoes drop constraint if exists compras_solicitacoes_status_check;
alter table public.compras_solicitacoes add constraint compras_solicitacoes_status_check
  check (status = any (array['pending_approval', 'adjustment_requested', 'approved', 'rejected', 'completed']));
alter table public.compras_solicitacoes
  add column if not exists adjustment_reason text,     -- o que quem decide pediu para ajustar
  add column if not exists adjustment_response text,   -- o que o solicitante respondeu ao reenviar
  add column if not exists approval_notes text;        -- observação opcional de quem aprovou

-- O guarda passa a olhar toda alteração (não só o status): no ajuste, quem pediu mexe só nos
-- orçamentos e na resposta — nunca no produto nem no setor.
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
  v_decide := public.pode_no_setor('compras', 'solicitacoes', 'approve');

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
    if not (public.pode_no_setor('compras', 'solicitacoes', 'execute') or public.pode_no_financeiro('payable', 'settle')) then
      raise exception 'Executar compra pede a permissão "Executar compra" de Compras.' using errcode = '42501';
    end if;
    return new;
  end if;

  if not v_decide then
    raise exception 'Aprovar, recusar ou pedir ajuste de compra pede a permissão "Aprovar / reprovar compra" de Compras.'
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
drop trigger if exists trg_compras_guarda_o_status on public.compras_solicitacoes;
create trigger trg_compras_guarda_o_status before update on public.compras_solicitacoes
  for each row execute function public.compras_guarda_o_status();

-- No ajuste, quem pediu põe, corrige e tira orçamentos da própria solicitação.
drop policy if exists compras_orcamentos_quem_pediu_insere on public.compras_orcamentos;
create policy compras_orcamentos_quem_pediu_insere on public.compras_orcamentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id())
              and exists (select 1 from public.compras_solicitacoes r
                           where r.id = compras_orcamentos.request_id and r.tenant_id = compras_orcamentos.tenant_id
                             and r.created_by = auth.uid() and r.status in ('pending_approval', 'adjustment_requested')));
create policy compras_orcamentos_quem_pediu_ajusta on public.compras_orcamentos for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_solicitacoes r
                      where r.id = compras_orcamentos.request_id and r.created_by = auth.uid()
                        and r.status = 'adjustment_requested'))
  with check (tenant_id = (select public.get_user_tenant_id())
              and exists (select 1 from public.compras_solicitacoes r
                           where r.id = compras_orcamentos.request_id and r.created_by = auth.uid()
                             and r.status = 'adjustment_requested'));
create policy compras_orcamentos_quem_pediu_tira on public.compras_orcamentos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_solicitacoes r
                      where r.id = compras_orcamentos.request_id and r.created_by = auth.uid()
                        and r.status = 'adjustment_requested'));

-- ─── O registro das decisões ─────────────────────────────────────────────────
create table public.compras_decisoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  request_id uuid not null references public.compras_solicitacoes(id) on delete cascade,
  decisao text not null check (decisao in ('aprovada', 'recusada', 'ajuste', 'reenviada', 'concluida')),
  user_id uuid references public.profiles(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now()
);
create index compras_decisoes_request_idx on public.compras_decisoes (request_id, created_at);
alter table public.compras_decisoes enable row level security;
-- Lê quem vê as compras, e quem pediu (a própria). Ninguém escreve à mão: só o trigger abaixo.
create policy compras_decisoes_select on public.compras_decisoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and ((select public.compras_ve_as_solicitacoes())
              or exists (select 1 from public.compras_solicitacoes r
                          where r.id = compras_decisoes.request_id and r.created_by = auth.uid())));

create or replace function public.compras_registra_decisao()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_decisao text;
  v_obs text;
  v_quem uuid;
  v_aprovadores uuid[];
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

  -- Os dois avisos que o ajuste cria: o pedido volta para quem pediu, e o reenvio volta para quem decide.
  if v_decisao = 'ajuste' and new.created_by is not null then
    perform public.notify_users(new.tenant_id, array[new.created_by], 'purchase_decided', 'ticket', new.ticket_id,
      'Ajuste pedido na compra — ' || coalesce(new.product_name, ''),
      'Corrija os orçamentos e reenvie: ' || coalesce(new.adjustment_reason, ''), v_quem);
  elsif v_decisao = 'reenviada' then
    v_aprovadores := public.notification_team(new.tenant_id, 'compras');
    perform public.notify_users(new.tenant_id, v_aprovadores, 'purchase_requested', 'ticket', new.ticket_id,
      'Compra reenviada após ajuste — ' || coalesce(new.product_name, ''),
      coalesce(nullif(trim(new.adjustment_response), ''), 'O solicitante ajustou os orçamentos.'), v_quem);
  end if;
  return new;
end;
$$;
revoke all on function public.compras_registra_decisao() from public, anon;
create trigger trg_compras_registra_decisao after update of status on public.compras_solicitacoes
  for each row execute function public.compras_registra_decisao();
