-- CANCELAR O CHECKLIST (dono, 2026-10-29): "no Financeiro, a opção de cancelamento de pedidos/checklists com
-- obrigatoriedade de justificativa, garantindo que o Comercial receba esse feedback. O cancelamento deve ser uma ação
-- definitiva e irreversível."
--
-- Decisões do dono (2026-10-29, todas as recomendadas):
--   * quem cancela: caixinha própria no perfil ("Cancelar checklist", `conferencia.cancelar`), ligada só no Gestor do
--     Financeiro — ação sem volta fica com menos gente;
--   * em qualquer situação, menos já cancelado; o motivo é obrigatório e a vendedora é avisada;
--   * o lançamento fica registrado (com "pedido cancelado" e o motivo); pedido novo é lançamento novo. E "esse
--     indicador não sobe para os indicadores comerciais dela": o lançamento do pedido cancelado sai das contas do
--     Comercial e da Diretoria (`com_interacoes.pedido_cancelado` + a view `com_interacoes_que_contam`);
--   * nos indicadores da Conferência, o cancelado sai das somas e aparece à parte ("Cancelados").
--
-- Sem volta, no banco: `ped_cancelamentos` é só-inserção (sem policy de update/delete; a chave é o checklist, então
-- não se cancela duas vezes) e, cancelado, nada mais entra no checklist — decisão, pagamento, finalização, reajuste,
-- edição pela vendedora ou nota.

-- ─── 1. Quem cancela ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ped_pode_cancelar()
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_admin_or_higher(auth.uid())
      or coalesce(public.tem_permissao(auth.uid(), 'financeiro', 'conferencia', 'cancelar'), false);
$$;
revoke all on function public.ped_pode_cancelar() from public, anon;
grant execute on function public.ped_pode_cancelar() to authenticated;

-- Ligada só no Gestor do Financeiro (onde a conferência já existe). Quem configura muda no perfil.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{conferencia,cancelar}', 'true'::jsonb)
 where department = 'financeiro' and name = 'Gestor' and permissions ? 'conferencia';

-- ─── 2. O cancelamento ───────────────────────────────────────────────────────────────────────────
create table public.ped_cancelamentos (
  checklist_id uuid primary key references public.ped_checklists(id) on delete cascade,
  tenant_id uuid not null default public.get_user_tenant_id() references public.tenants(id) on delete cascade,
  motivo text not null check (char_length(btrim(motivo)) >= 10),
  registrado_por uuid references public.profiles(id) on delete set null,
  registrado_em timestamptz not null default now()
);
alter table public.ped_cancelamentos enable row level security;
create policy ped_cancelamentos_select on public.ped_cancelamentos for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_cancelamentos.checklist_id));
create policy ped_cancelamentos_insert on public.ped_cancelamentos for insert to authenticated
  with check (tenant_id = (select public.get_user_tenant_id()) and (select public.ped_pode_cancelar()));
create trigger trg_ped_a_carimbo before insert on public.ped_cancelamentos
  for each row execute function public.ped_carimbar();

create function public.ped_cancelado(p_checklist uuid)
returns boolean language sql stable set search_path = public as $$
  select exists (select 1 from public.ped_cancelamentos x where x.checklist_id = p_checklist);
$$;
revoke all on function public.ped_cancelado(uuid) from public, anon;
grant execute on function public.ped_cancelado(uuid) to authenticated;

-- ─── 3. Cancelado, nada mais entra ───────────────────────────────────────────────────────────────
-- `trg_ped_0_…`: roda antes do carimbo e das regras (triggers BEFORE disparam em ordem alfabética).
create function public.ped_nao_mexe_em_cancelado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.ped_cancelamentos x where x.checklist_id = new.checklist_id) then
    raise exception 'Este checklist foi cancelado pelo Financeiro e não muda mais. Pedido novo é um lançamento novo.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.ped_nao_mexe_em_cancelado() from public, anon, authenticated;
create trigger trg_ped_0_cancelado before insert on public.ped_decisoes
  for each row execute function public.ped_nao_mexe_em_cancelado();
create trigger trg_ped_0_cancelado before insert on public.ped_pagamentos
  for each row execute function public.ped_nao_mexe_em_cancelado();
create trigger trg_ped_0_cancelado before insert on public.ped_finalizacoes
  for each row execute function public.ped_nao_mexe_em_cancelado();
create trigger trg_ped_0_cancelado before insert on public.ped_reajustes
  for each row execute function public.ped_nao_mexe_em_cancelado();
-- E não se cancela duas vezes (a chave já barraria; aqui com a frase certa).
create trigger trg_ped_0_cancelado before insert on public.ped_cancelamentos
  for each row execute function public.ped_nao_mexe_em_cancelado();

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

-- A vendedora não edita o checklist cancelado, nem troca a nota dele.
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
  'if public.ped_finalizado(v_checklist.id) then',
  'if public.ped_cancelado(v_checklist.id) then
      raise exception ''Este checklist foi cancelado pelo Financeiro e não muda mais. Pedido novo é um lançamento novo.'' using errcode = ''P0001'';
    end if;
    if public.ped_finalizado(v_checklist.id) then');
select pg_temp.troca('public.ped_informar_nota(uuid, text)'::regprocedure,
  'if public.ped_finalizado(v_ck.id) then',
  'if public.ped_cancelado(v_ck.id) then
    raise exception ''Checklist cancelado: a nota não muda mais.'' using errcode = ''P0001'';
  end if;
  if public.ped_finalizado(v_ck.id) then');

-- ─── 4. O lançamento do pedido cancelado sai das contas do Comercial ─────────────────────────────
alter table public.com_interacoes add column pedido_cancelado boolean not null default false;

-- Só o banco marca (no cancelamento, de dentro de um trigger): ninguém tira nem põe pela tela.
create function public.com_pedido_cancelado_so_pelo_banco()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pedido_cancelado := false;
  elsif new.pedido_cancelado is distinct from old.pedido_cancelado then
    raise exception 'O "pedido cancelado" do lançamento só muda pelo cancelamento do checklist.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.com_pedido_cancelado_so_pelo_banco() from public, anon, authenticated;
create trigger trg_com_pedido_cancelado_so_pelo_banco before insert or update on public.com_interacoes
  for each row execute function public.com_pedido_cancelado_so_pelo_banco();

-- Os lançamentos que contam. `security_invoker`: quem chama continua sob o RLS de `com_interacoes`.
create view public.com_interacoes_que_contam with (security_invoker = on) as
select i.* from public.com_interacoes i where not i.pedido_cancelado;
revoke all on public.com_interacoes_que_contam from anon;
grant select on public.com_interacoes_que_contam to authenticated;

-- As contas do Comercial e da Diretoria passam a ler só os que contam (mesma consulta, outra origem).
select pg_temp.troca(p.oid::regprocedure, 'public.com_interacoes i', 'public.com_interacoes_que_contam i')
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('com_acompanhamento_da_carteira', 'com_carteira_mes_a_mes', 'com_farol_de_acoes', 'com_painel_do_gestor',
                     'com_resumo_da_carteira', 'com_situacao_120_dias', 'com_venda_atribuida', 'com_vendas_unificadas',
                     'dir_realizado_carteiras', 'dir_realizado_total');
select pg_temp.troca(p.oid::regprocedure, 'public.com_interacoes x', 'public.com_interacoes_que_contam x')
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'com_ritmo_do_mes';

-- ─── 5. Ao cancelar: marca o lançamento, fecha o reajuste aberto e avisa o Comercial ─────────────
create function public.ped_ao_cancelar()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
begin
  select * into v_ck from public.ped_checklists where id = new.checklist_id;
  update public.com_interacoes set pedido_cancelado = true where id = v_ck.interacao_id;
  update public.ped_reajustes
     set status = 'recusado', resposta = 'Checklist cancelado pelo Financeiro: ' || new.motivo,
         respondido_por = new.registrado_por, respondido_em = now()
   where checklist_id = new.checklist_id and status = 'pendente';
  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_ck.tenant_id, u, 'reminder', 'ped_cancelado', v_ck.id,
         'Checklist cancelado: ' || v_ck.protocolo,
         'O Financeiro cancelou o checklist de ' || v_ck.cliente_nome || '. Motivo: ' || new.motivo
           || '. O cancelamento não se desfaz; pedido novo é um lançamento novo.'
    from (select distinct x as u from unnest(array[v_ck.vendedor_id, v_ck.criado_por]) x) d
   where u is not null and u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  return null;
end;
$$;
revoke all on function public.ped_ao_cancelar() from public, anon, authenticated;
create trigger trg_ped_ao_cancelar after insert on public.ped_cancelamentos
  for each row execute function public.ped_ao_cancelar();

-- ─── 6. A view: "Cancelado" vence tudo, com quem, quando e por quê ───────────────────────────────
create or replace view public.ped_checklists_situacao with (security_invoker = on) as
select
  c.id, c.tenant_id, c.interacao_id, c.protocolo, c.versao, c.criado_por, c.criado_em, c.enviado_em,
  c.editado_em, c.contato, c.rota, c.observacao,
  c.vendedor_id, vp.full_name as vendedor_nome, c.cliente_codigo, c.cliente_nome, c.tabela_preco,
  (select count(*) from public.ped_pedidos p where p.checklist_id = c.id)::int as qtd_pedidos,
  (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor_total,
  (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado'
      and not exists (select 1 from public.ped_reajustes r where r.decisao_id = d.id))::int as recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('tentativa', d.versao, 'em', d.registrado_em, 'por', dp.full_name,
                                                'motivos', d.motivos, 'observacao', d.observacao,
                                                'depois_de_aprovado', d.depois_de_aprovado) order by d.seq), '[]'::jsonb)
     from public.ped_decisoes d left join public.profiles dp on dp.id = d.registrado_por
    where d.checklist_id = c.id and d.status = 'Recusado'
      and not exists (select 1 from public.ped_reajustes r where r.decisao_id = d.id)) as historico_recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'data', p.data_pagamento, 'em', p.registrado_em,
                                                'por', pp.full_name, 'observacao', p.observacao) order by p.seq), '[]'::jsonb)
     from public.ped_pagamentos p left join public.profiles pp on pp.id = p.registrado_por
    where p.checklist_id = c.id) as historico_pagamentos,
  vig.status as retorno_status, vig.motivos as retorno_motivos, vig.observacao as retorno_observacao,
  vig.registrado_em as retorno_em, vigp.full_name as retorno_por,
  case when x.checklist_id is not null then 'Cancelado'
       when f.checklist_id is not null and vig.status = 'Aprovado' then 'Finalizado'
       else coalesce(vig.status, 'Em análise') end as situacao,
  case when x.checklist_id is null and vig.status = 'Aprovado' then coalesce(pg.status, 'Em negociação') end as pagamento_status,
  case when x.checklist_id is null and vig.status = 'Aprovado' then pg.data_pagamento end as pagamento_data,
  f.registrado_em as finalizado_em, fp.full_name as finalizado_por, f.observacao as finalizado_observacao,
  cp.full_name as criado_por_nome,
  (select count(*) from public.ped_reajustes r where r.checklist_id = c.id and r.status = 'aceito')::int as reajustes,
  (select jsonb_build_object('id', r.id, 'motivo', r.motivo, 'em', r.pedido_em, 'por', rp.full_name)
     from public.ped_reajustes r left join public.profiles rp on rp.id = r.pedido_por
    where r.checklist_id = c.id and r.status = 'pendente') as reajuste_pendente,
  (select coalesce(jsonb_agg(jsonb_build_object('tentativa', r.versao, 'motivo', r.motivo, 'em', r.pedido_em, 'por', rp.full_name,
                                                'status', r.status, 'resposta', r.resposta, 'respondido_em', r.respondido_em,
                                                'respondido_por', rr.full_name) order by r.seq), '[]'::jsonb)
     from public.ped_reajustes r
     left join public.profiles rp on rp.id = r.pedido_por
     left join public.profiles rr on rr.id = r.respondido_por
    where r.checklist_id = c.id) as historico_reajustes,
  x.registrado_em as cancelado_em, xp.full_name as cancelado_por, x.motivo as cancelamento_motivo
from public.ped_checklists c
left join public.profiles vp on vp.id = c.vendedor_id
left join lateral (select d.* from public.ped_decisoes d
                    where d.checklist_id = c.id and d.versao = c.versao order by d.seq desc limit 1) vig on true
left join public.profiles vigp on vigp.id = vig.registrado_por
left join lateral (select p.* from public.ped_pagamentos p
                    where p.checklist_id = c.id and p.versao = c.versao order by p.seq desc limit 1) pg on true
left join public.ped_finalizacoes f on f.checklist_id = c.id and f.versao = c.versao
left join public.profiles fp on fp.id = f.registrado_por
left join public.profiles cp on cp.id = c.criado_por
left join public.ped_cancelamentos x on x.checklist_id = c.id
left join public.profiles xp on xp.id = x.registrado_por;

-- ─── 7. Indicadores da Conferência: cancelado fora das somas, contado à parte ────────────────────
select pg_temp.troca('public.ped_indicadores(date, date)'::regprocedure,
  $$     where c.tenant_id = v_tenant
       and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),$$,
  $$     where c.tenant_id = v_tenant
       and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
       and not exists (select 1 from public.ped_cancelamentos x where x.checklist_id = c.id)
  ),
  cancelados as (
    select (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor
      from public.ped_checklists c join public.ped_cancelamentos x on x.checklist_id = c.id
     where c.tenant_id = v_tenant
       and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),$$);
select pg_temp.troca('public.ped_indicadores(date, date)'::regprocedure,
  $$'reajustado', (select$$,
  $$'cancelado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from cancelados),
    'reajustado', (select$$);
