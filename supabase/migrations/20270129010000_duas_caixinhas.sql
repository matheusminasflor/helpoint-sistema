-- DUAS CAIXINHAS: INBRAS E MF (dono, 2026-10-20). "A caixinha atual é da MF, porém precisamos ter 2 caixinhas;
-- quem cuida da caixinha INBRAS é o Rondinelly (Gestor da Expedição e Produção)." Decisões (múltipla escolha):
--   1. cada Caixinha tem um RESPONSÁVEL, trocável em Compras › Configurações ("hoje é o Rondinelly, amanhã pode ser
--      outro"). Ele vê só a dele, lança entradas e saídas com o recibo; apagar continua com o Financeiro. O Financeiro
--      (seção Caixinha do perfil) vê e confere as duas — sem dar a ninguém o módulo Financeiro inteiro;
--   2. o pedido da categoria Caixinha em Compras é decidido e comprado pelo responsável da Caixinha escolhida;
--   3. quem pede escolhe INBRAS ou MF;
--   4. cada Caixinha tem o seu valor semanal, o seu saldo e a sua reposição (que vai ao Financeiro com a filial).
-- O que existia (uma Caixinha por empresa, com "quem aprova a Caixinha" em `compras_config`) vira a Caixinha MF:
-- o aprovador de hoje é o responsável dela e os lançamentos e pedidos de hoje são dela.
-- As funções longas que só trocam a pergunta "quem é o aprovador da Caixinha" pela "quem é o responsável DESTA
-- Caixinha" são reescritas por substituição de texto sobre a versão no ar (seção 6), e a migration falha se o trecho
-- não estiver lá — assim o corpo delas continua o mesmo, sem copiar 150 linhas.

-- ─── 1. As Caixinhas ────────────────────────────────────────────────────────────────────────────────
create table if not exists public.caixinhas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  filial text not null check (filial in ('INBRAS', 'MF')),
  responsavel_id uuid references public.profiles(id) on delete set null,
  valor_semanal numeric(14,2) check (valor_semanal is null or valor_semanal >= 0),
  updated_at timestamptz not null default now(),
  unique (tenant_id, filial)
);
alter table public.caixinhas enable row level security;
create policy caixinhas_le on public.caixinhas for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()));
create policy caixinhas_altera on public.caixinhas for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'comprador'))
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_alterar_aba('compras', 'comprador'));

-- Toda empresa tem as duas; a MF herda o aprovador e o valor semanal de hoje.
insert into public.caixinhas (tenant_id, filial, responsavel_id, valor_semanal)
select t.id, f.filial, case when f.filial = 'MF' then c.caixinha_aprovador_id end,
       case when f.filial = 'MF' then c.caixinha_valor_semanal end
  from public.tenants t
  cross join (values ('MF'), ('INBRAS')) f(filial)
  left join public.compras_config c on c.tenant_id = t.id
on conflict (tenant_id, filial) do nothing;

-- Na Minasflor, a INBRAS é do Rondinelly (em outro banco o perfil não existe e nada muda).
update public.caixinhas k set responsavel_id = p.id
  from public.profiles p
 where p.id = 'aef5c9d2-7137-4abd-b6e7-41f180235e29' and p.tenant_id = k.tenant_id
   and k.filial = 'INBRAS' and k.responsavel_id is null;

create or replace function public.caixinhas_da_empresa_nova()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.caixinhas (tenant_id, filial) values (new.id, 'MF'), (new.id, 'INBRAS')
  on conflict (tenant_id, filial) do nothing;
  return null;
end;
$$;
revoke all on function public.caixinhas_da_empresa_nova() from public, anon, authenticated;
drop trigger if exists trg_caixinhas_da_empresa_nova on public.tenants;
create trigger trg_caixinhas_da_empresa_nova after insert on public.tenants
  for each row execute function public.caixinhas_da_empresa_nova();

-- ─── 2. Lançamento e pedido sabem de qual Caixinha são ─────────────────────────────────────────────
alter table public.caixinha_movimentos add column if not exists caixinha_id uuid references public.caixinhas(id);
update public.caixinha_movimentos m set caixinha_id = k.id
  from public.caixinhas k where k.tenant_id = m.tenant_id and k.filial = 'MF' and m.caixinha_id is null;
alter table public.caixinha_movimentos alter column caixinha_id set not null;
create index if not exists caixinha_movimentos_caixinha on public.caixinha_movimentos (caixinha_id, data desc);

alter table public.compras_solicitacoes add column if not exists caixinha_id uuid references public.caixinhas(id);
update public.compras_solicitacoes s set caixinha_id = k.id
  from public.caixinhas k where k.tenant_id = s.tenant_id and k.filial = 'MF' and s.caixinha and s.caixinha_id is null;

-- ─── 3. Quem responde por cada Caixinha ────────────────────────────────────────────────────────────
create or replace function public.responsavel_da_caixinha(p_caixinha uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select responsavel_id from public.caixinhas where id = p_caixinha;
$$;
revoke all on function public.responsavel_da_caixinha(uuid) from public, anon;
grant execute on function public.responsavel_da_caixinha(uuid) to authenticated;

create or replace function public.e_responsavel_de_caixinha()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.caixinhas
                  where tenant_id = public.get_user_tenant_id() and responsavel_id = auth.uid());
$$;
revoke all on function public.e_responsavel_de_caixinha() from public, anon;
grant execute on function public.e_responsavel_de_caixinha() to authenticated;

/** A Caixinha de quem não escolheu (os pedidos e lançamentos de antes eram todos da MF). */
create or replace function public.caixinha_padrao(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.caixinhas where tenant_id = p_tenant order by (filial = 'MF') desc, filial limit 1;
$$;
revoke all on function public.caixinha_padrao(uuid) from public, anon, authenticated;

-- O nome antigo continua respondendo (a Caixinha MF), para nada que ainda pergunte por ele ficar sem resposta.
create or replace function public.aprovador_da_caixinha(p_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select public.responsavel_da_caixinha(public.caixinha_padrao(p_tenant));
$$;

create or replace function public.pode_decidir_compra(p_caixinha boolean, p_caixinha_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_caixinha
              then public.is_admin_or_higher(auth.uid())
                or auth.uid() = public.responsavel_da_caixinha(coalesce(p_caixinha_id, public.caixinha_padrao(public.get_user_tenant_id())))
              else public.pode_no_setor('compras', 'solicitacoes', 'approve') end;
$$;
revoke all on function public.pode_decidir_compra(boolean, uuid) from public, anon;
grant execute on function public.pode_decidir_compra(boolean, uuid) to authenticated;

-- Sem saber a Caixinha: o responsável de qualquer uma (quem pergunta assim é a tela, não a regra).
create or replace function public.pode_decidir_compra(p_caixinha boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select case when p_caixinha
              then public.is_admin_or_higher(auth.uid()) or public.e_responsavel_de_caixinha()
              else public.pode_no_setor('compras', 'solicitacoes', 'approve') end;
$$;

create or replace function public.aprovadores_da_compra(p_tenant uuid, p_caixinha boolean, p_caixinha_id uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select case
    when not p_caixinha then public.aprovadores_de_compra(p_tenant)
    when public.responsavel_da_caixinha(coalesce(p_caixinha_id, public.caixinha_padrao(p_tenant))) is not null
      then array[public.responsavel_da_caixinha(coalesce(p_caixinha_id, public.caixinha_padrao(p_tenant)))]
    else (select coalesce(array_agg(p.id), '{}') from public.profiles p
           where p.tenant_id = p_tenant and coalesce(p.is_active, true) and public.is_admin_or_higher(p.id))
  end;
$$;
revoke all on function public.aprovadores_da_compra(uuid, boolean, uuid) from public, anon, authenticated;

create or replace function public.pode_na_caixinha(p_acao text, p_caixinha uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'caixinha', p_acao), false)
      or (p_acao in ('view', 'create') and auth.uid() = public.responsavel_da_caixinha(p_caixinha));
$$;
revoke all on function public.pode_na_caixinha(text, uuid) from public, anon;
grant execute on function public.pode_na_caixinha(text, uuid) to authenticated;

create or replace function public.pode_na_caixinha(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'caixinha', p_acao), false)
      or (p_acao in ('view', 'create') and public.e_responsavel_de_caixinha());
$$;

-- O responsável de uma Caixinha vê e lança no Estoque de Compras (o suprimento comprado entra lá).
create or replace function public.pode_no_estoque(p_acao text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'compras', 'estoque', p_acao), false)
      or (p_acao in ('view', 'create') and public.e_responsavel_de_caixinha());
$$;

-- ─── 4. Saldo, reposição e o pedido, por Caixinha ──────────────────────────────────────────────────
create or replace function public.caixinha_saldo(p_caixinha uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(case when tipo = 'entrada' then valor else -valor end), 0)
    from public.caixinha_movimentos where caixinha_id = p_caixinha;
$$;
revoke all on function public.caixinha_saldo(uuid) from public, anon;
grant execute on function public.caixinha_saldo(uuid) to authenticated;

-- O lançamento sem Caixinha: o da compra vai para a Caixinha do pedido; o resto, para a padrão.
create or replace function public.caixinha_do_movimento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.caixinha_id is null then
    select s.caixinha_id into new.caixinha_id from public.compras_solicitacoes s where s.id = new.purchase_request_id;
    new.caixinha_id := coalesce(new.caixinha_id, public.caixinha_padrao(new.tenant_id));
  end if;
  if not exists (select 1 from public.caixinhas where id = new.caixinha_id and tenant_id = new.tenant_id) then
    raise exception 'Caixinha de outra empresa.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.caixinha_do_movimento() from public, anon, authenticated;
-- Antes de `trg_caixinha_nao_fica_negativo` (a ordem dos BEFORE é a alfabética).
drop trigger if exists trg_caixinha_a_qual on public.caixinha_movimentos;
create trigger trg_caixinha_a_qual before insert on public.caixinha_movimentos
  for each row execute function public.caixinha_do_movimento();

create or replace function public.caixinha_nao_fica_negativo()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_saldo numeric := public.caixinha_saldo(new.caixinha_id);
begin
  if new.tipo = 'saida' and v_saldo - new.valor < 0 then
    raise exception 'A Caixinha % tem R$ % e esta saída é de R$ %: registre a entrada antes.',
      (select filial from public.caixinhas where id = new.caixinha_id),
      to_char(v_saldo, 'FM999G999G990D00'), to_char(new.valor, 'FM999G999G990D00') using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.caixinha_reposicao_no_financeiro()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_conta uuid;
  v_filial text;
begin
  if tg_op = 'DELETE' then
    if old.fin_entry_id is not null then
      delete from public.fin_entries where id = old.fin_entry_id;
    end if;
    return old;
  end if;
  if new.tipo <> 'entrada' then
    return new;
  end if;
  select filial into v_filial from public.caixinhas where id = new.caixinha_id;
  insert into public.fin_entries (
    tenant_id, kind, description, category, amount, due_date, settled_at, status, payment_method,
    competence, source, notes, filial, created_by
  ) values (
    new.tenant_id, 'payable', 'Reposição da Caixinha ' || coalesce(v_filial, ''), 'caixinha', new.valor, new.data, new.data,
    'paid', 'Dinheiro', date_trunc('month', new.data)::date, 'caixinha', nullif(btrim(new.descricao), ''), v_filial,
    new.created_by
  ) returning id into v_conta;
  update public.caixinha_movimentos set fin_entry_id = v_conta where id = new.id;
  return new;
end;
$$;

-- O pedido da categoria Caixinha guarda a Caixinha escolhida (sem escolha, a padrão); o que não é Caixinha, nenhuma.
create or replace function public.compras_marca_caixinha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  select coalesce(c.caixinha or p.caixinha or g.caixinha, false) into new.caixinha
    from public.tickets t
    left join public.ti_categories c on c.id = t.category_id
    left join public.ti_categories p on p.id = c.parent_id
    left join public.ti_categories g on g.id = p.parent_id
   where t.id = new.ticket_id;
  new.caixinha := coalesce(new.caixinha, false);
  if not new.caixinha then
    new.caixinha_id := null;
  else
    new.caixinha_id := coalesce(new.caixinha_id, public.caixinha_padrao(new.tenant_id));
    if not exists (select 1 from public.caixinhas where id = new.caixinha_id and tenant_id = new.tenant_id) then
      raise exception 'Caixinha de outra empresa.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- O pedido da Caixinha nasce no nome do responsável dela: é ele quem decide e compra, e sem ser o atendente ele
-- não enxergaria o chamado (nem receberia o aviso: `notify_ticket` pula quem não vê). Antes de
-- `trg_notify_on_purchase_requested` (a ordem dos AFTER também é a alfabética).
create or replace function public.compras_caixinha_vai_ao_responsavel()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_quem uuid := public.responsavel_da_caixinha(new.caixinha_id);
begin
  if new.caixinha and v_quem is not null and new.ticket_id is not null then
    update public.tickets set assigned_to = v_quem where id = new.ticket_id and assigned_to is null;
  end if;
  return null;
end;
$$;
revoke all on function public.compras_caixinha_vai_ao_responsavel() from public, anon, authenticated;
drop trigger if exists trg_compras_caixinha_vai_ao_responsavel on public.compras_solicitacoes;
create trigger trg_compras_caixinha_vai_ao_responsavel after insert on public.compras_solicitacoes
  for each row execute function public.compras_caixinha_vai_ao_responsavel();

-- ─── 5. As portas: cada responsável na sua Caixinha ────────────────────────────────────────────────
drop policy if exists caixinha_le on public.caixinha_movimentos;
create policy caixinha_le on public.caixinha_movimentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('view', caixinha_id));
drop policy if exists caixinha_lanca on public.caixinha_movimentos;
create policy caixinha_lanca on public.caixinha_movimentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('create', caixinha_id)
              and purchase_request_id is null and created_by = auth.uid());
drop policy if exists caixinha_apaga on public.caixinha_movimentos;
create policy caixinha_apaga on public.caixinha_movimentos for delete to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and public.pode_na_caixinha('delete', caixinha_id)
         and purchase_request_id is null);

drop policy if exists compras_solicitacoes_caixinha_le on public.compras_solicitacoes;
create policy compras_solicitacoes_caixinha_le on public.compras_solicitacoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and caixinha
         and auth.uid() = public.responsavel_da_caixinha(caixinha_id));
drop policy if exists compras_solicitacoes_caixinha_decide on public.compras_solicitacoes;
create policy compras_solicitacoes_caixinha_decide on public.compras_solicitacoes for update to authenticated
  using (tenant_id = (select public.get_user_tenant_id()) and caixinha
         and auth.uid() = public.responsavel_da_caixinha(caixinha_id))
  with check (tenant_id = (select public.get_user_tenant_id()) and caixinha
              and auth.uid() = public.responsavel_da_caixinha(caixinha_id));
drop policy if exists compras_orcamentos_caixinha_le on public.compras_orcamentos;
create policy compras_orcamentos_caixinha_le on public.compras_orcamentos for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_solicitacoes r
                      where r.id = request_id and r.caixinha and auth.uid() = public.responsavel_da_caixinha(r.caixinha_id)));
drop policy if exists compras_decisoes_caixinha_le on public.compras_decisoes;
create policy compras_decisoes_caixinha_le on public.compras_decisoes for select to authenticated
  using (tenant_id = (select public.get_user_tenant_id())
         and exists (select 1 from public.compras_solicitacoes r
                      where r.id = request_id and r.caixinha and auth.uid() = public.responsavel_da_caixinha(r.caixinha_id)));

-- ─── 6. As regras de Compras perguntam pela Caixinha DO PEDIDO ─────────────────────────────────────
do $$
declare
  r record;
  v_def text;
  v_novo text;
begin
  for r in select * from (values
    ('notify_on_purchase_requested', 'aprovadores_da_compra(new.tenant_id, new.caixinha)', 'aprovadores_da_compra(new.tenant_id, new.caixinha, new.caixinha_id)'),
    ('compras_registra_decisao',     'aprovadores_da_compra(new.tenant_id, new.caixinha)', 'aprovadores_da_compra(new.tenant_id, new.caixinha, new.caixinha_id)'),
    ('compras_reajustar',            'aprovadores_da_compra(s.tenant_id, s.caixinha)',     'aprovadores_da_compra(s.tenant_id, s.caixinha, s.caixinha_id)'),
    ('compras_vai_para_quem_compra', 'then c.caixinha_aprovador_id else',                  'then public.responsavel_da_caixinha(new.caixinha_id) else'),
    ('compras_pagamento_confere',    'pode_decidir_compra(old.caixinha)',                  'pode_decidir_compra(old.caixinha, old.caixinha_id)'),
    ('compras_guarda_o_status',      'pode_decidir_compra(old.caixinha)',                  'pode_decidir_compra(old.caixinha, old.caixinha_id)'),
    ('compras_troca_a_forma',        'pode_decidir_compra(old.caixinha)',                  'pode_decidir_compra(old.caixinha, old.caixinha_id)'),
    ('compras_decidir_reajuste',     'pode_decidir_compra(s.caixinha)',                    'pode_decidir_compra(s.caixinha, s.caixinha_id)'),
    ('pode_comentar_no_chamado',     'pode_decidir_compra(true)',                          'pode_decidir_compra(true, s.caixinha_id)'),
    -- A Caixinha que quem pede escolheu (`compras_marca_caixinha` descarta se a categoria não for Caixinha).
    ('compras_abrir_pedido',         'motivo_recomendacao, estimated_amount, created_by
  ) values (',                                                                                 'motivo_recomendacao, estimated_amount, created_by, caixinha_id
  ) values ('),
    ('compras_abrir_pedido',         'v_estimado, v_eu
  )',                                                                                          'v_estimado, v_eu, nullif(p_pedido ->> ''caixinha_id'', '''')::uuid
  )')
  ) x(funcao, de, para) loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = r.funcao;
    if v_def is null or position(r.de in v_def) = 0 then
      raise exception 'duas_caixinhas: % não tem o trecho "%"', r.funcao, r.de;
    end if;
    v_novo := replace(v_def, r.de, r.para);
    execute v_novo;  -- CREATE OR REPLACE: a permissão de cada função fica como estava.
  end loop;
end;
$$;
