-- DEVOLVER AO COMERCIAL DEPOIS DE APROVADO (dono, 2026-10-29). "Hoje quando eles aprovam um checklist feito pelo
-- comercial e colocam como pago, não conseguem reverter depois. Ter como opção o Financeiro conseguir, mesmo depois
-- de aprovado, retornar para o Comercial, e por motivo. Importante que quando retornar é como se tivesse que fazer
-- novamente a correção."
--
-- O que muda:
--   1. A devolução é uma decisão "Recusado" com motivo, aceita também quando a decisão vigente é "Aprovado" — pago e
--      finalizado inclusive. Ela entra no contador de recusas (é retrabalho, como a recusa) e fica marcada
--      `depois_de_aprovado` no histórico.
--   2. "Como se tivesse que fazer de novo": pagamento e finalização passam a valer só para a VERSÃO do checklist em
--      que foram registrados, como a decisão já valia (manual §3.4). A vendedora corrige → a versão sobe → volta a
--      "Em análise", sem pagamento nem finalização; o Financeiro aprova, registra o pagamento e finaliza de novo.
--      Nada se apaga: o histórico de pagamentos e finalizações das versões anteriores continua lá.
--   3. Finalizado = finalização na versão atual E decisão vigente "Aprovado" (`ped_finalizado`): devolvido, sai de
--      Finalizado na hora, antes mesmo de a vendedora corrigir.

-- ─── 1. A versão em pagamentos e finalizações ────────────────────────────────────────────────────
alter table public.ped_pagamentos add column versao int;
alter table public.ped_finalizacoes add column versao int;
-- Até hoje checklist aprovado não se editava: todo pagamento e toda finalização são da versão atual.
update public.ped_pagamentos p set versao = c.versao from public.ped_checklists c where c.id = p.checklist_id;
update public.ped_finalizacoes f set versao = c.versao from public.ped_checklists c where c.id = f.checklist_id;
alter table public.ped_pagamentos alter column versao set not null;
alter table public.ped_finalizacoes alter column versao set not null;
-- Uma finalização por versão (era uma por checklist).
alter table public.ped_finalizacoes drop constraint ped_finalizacoes_pkey;
alter table public.ped_finalizacoes add primary key (checklist_id, versao);

alter table public.ped_decisoes add column depois_de_aprovado boolean not null default false;

-- Pagamento e finalização são sempre da versão atual — o banco carimba, a tela não manda.
create function public.ped_carimbar_versao()
returns trigger language plpgsql set search_path = public as $$
begin
  new.versao := (select c.versao from public.ped_checklists c where c.id = new.checklist_id);
  return new;
end;
$$;
revoke all on function public.ped_carimbar_versao() from public, anon;
-- `trg_ped_a_versao`: depois do carimbo e antes das regras (triggers BEFORE disparam em ordem alfabética).
create trigger trg_ped_a_versao before insert on public.ped_pagamentos
  for each row execute function public.ped_carimbar_versao();
create trigger trg_ped_a_versao before insert on public.ped_finalizacoes
  for each row execute function public.ped_carimbar_versao();

-- ─── 2. O que vale é o da versão atual ───────────────────────────────────────────────────────────
-- E só enquanto aprovado: devolvido, o pagamento deixa de contar na hora (indicadores inclusive).
create or replace function public.ped_ultimo_pagamento(p_checklist uuid)
returns text language sql stable set search_path = public as $$
  select p.status
    from public.ped_pagamentos p
    join public.ped_checklists c on c.id = p.checklist_id and p.versao = c.versao
   where p.checklist_id = p_checklist
     and public.ped_decisao_vigente(p_checklist) = 'Aprovado'
   order by p.seq desc
   limit 1;
$$;

create function public.ped_finalizado(p_checklist uuid)
returns boolean language sql stable set search_path = public as $$
  select coalesce(public.ped_decisao_vigente(p_checklist), '') = 'Aprovado'
     and exists (select 1 from public.ped_finalizacoes f
                   join public.ped_checklists c on c.id = f.checklist_id and f.versao = c.versao
                  where f.checklist_id = p_checklist);
$$;
revoke all on function public.ped_finalizado(uuid) from public, anon;
grant execute on function public.ped_finalizado(uuid) to authenticated;

-- ─── 3. A decisão: devolver o aprovado passa ─────────────────────────────────────────────────────
create or replace function public.ped_decisoes_antes_inserir()
returns trigger language plpgsql set search_path = public as $$
declare
  v_vigente text := public.ped_decisao_vigente(new.checklist_id);
begin
  if v_vigente = 'Recusado' then
    raise exception 'Este checklist já foi recusado. O Comercial precisa corrigir e reenviar.' using errcode = 'P0001';
  end if;
  if v_vigente = 'Aprovado' and new.status = 'Aprovado' then
    raise exception 'Este checklist já foi aprovado.' using errcode = 'P0001';
  end if;
  -- Devolver depois de aprovado (dono, 2026-10-29): o banco marca, a tela não escolhe.
  -- `is not distinct from`: na primeira decisão não há vigente, e `null = 'Aprovado'` daria nulo.
  new.depois_de_aprovado := v_vigente is not distinct from 'Aprovado';
  if not public.ped_em_carga() then
    new.versao := (select c.versao from public.ped_checklists c where c.id = new.checklist_id);
  end if;
  new.snapshot := coalesce(new.snapshot, (
    select jsonb_agg(jsonb_build_object(
             'ordem', p.ordem, 'tipo', p.tipo, 'filial', p.filial, 'numero', p.numero,
             'valor', p.valor, 'desconto', p.desconto,
             'respostas', (select jsonb_object_agg(i.rotulo, r.resposta)
                             from public.ped_respostas r join public.ped_itens i on i.id = r.item_id
                            where r.pedido_id = p.id))
           order by p.ordem)
      from public.ped_pedidos p where p.checklist_id = new.checklist_id));
  return new;
end;
$$;

-- ─── 4. Quem perguntava "tem finalização?" passa a perguntar "está finalizado?" ──────────────────
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

-- A vendedora corrige o devolvido (a finalização da versão antiga não trava mais).
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
  'if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = v_checklist.id) then',
  'if public.ped_finalizado(v_checklist.id) then');
-- E pode trocar a nota do pedido devolvido.
select pg_temp.troca('public.ped_informar_nota(uuid, text)'::regprocedure,
  'if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = v_ck.id) then',
  'if public.ped_finalizado(v_ck.id) then');
select pg_temp.troca('public.ped_indicadores(date, date)'::regprocedure,
  'case when exists (select 1 from public.ped_finalizacoes f where f.checklist_id = c.id) then ''Finalizado''',
  'case when public.ped_finalizado(c.id) then ''Finalizado''');

-- ─── 5. A view: pagamento e finalização da versão atual; a devolução marcada no histórico ───────
create or replace view public.ped_checklists_situacao with (security_invoker = on) as
select
  c.id, c.tenant_id, c.interacao_id, c.protocolo, c.versao, c.criado_por, c.criado_em, c.enviado_em,
  c.editado_em, c.contato, c.rota, c.observacao,
  c.vendedor_id, vp.full_name as vendedor_nome, c.cliente_codigo, c.cliente_nome, c.tabela_preco,
  (select count(*) from public.ped_pedidos p where p.checklist_id = c.id)::int as qtd_pedidos,
  (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor_total,
  (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado')::int as recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('tentativa', d.versao, 'em', d.registrado_em, 'por', dp.full_name,
                                                'motivos', d.motivos, 'observacao', d.observacao,
                                                'depois_de_aprovado', d.depois_de_aprovado) order by d.seq), '[]'::jsonb)
     from public.ped_decisoes d left join public.profiles dp on dp.id = d.registrado_por
    where d.checklist_id = c.id and d.status = 'Recusado') as historico_recusas,
  (select coalesce(jsonb_agg(jsonb_build_object('status', p.status, 'data', p.data_pagamento, 'em', p.registrado_em,
                                                'por', pp.full_name, 'observacao', p.observacao) order by p.seq), '[]'::jsonb)
     from public.ped_pagamentos p left join public.profiles pp on pp.id = p.registrado_por
    where p.checklist_id = c.id) as historico_pagamentos,
  vig.status as retorno_status, vig.motivos as retorno_motivos, vig.observacao as retorno_observacao,
  vig.registrado_em as retorno_em, vigp.full_name as retorno_por,
  case when f.checklist_id is not null and vig.status = 'Aprovado' then 'Finalizado' else coalesce(vig.status, 'Em análise') end as situacao,
  -- Devolvido, o pagamento da versão deixa de valer na hora (antes só aprovado tinha pagamento).
  case when vig.status = 'Aprovado' then coalesce(pg.status, 'Em negociação') end as pagamento_status,
  case when vig.status = 'Aprovado' then pg.data_pagamento end as pagamento_data,
  f.registrado_em as finalizado_em, fp.full_name as finalizado_por, f.observacao as finalizado_observacao,
  cp.full_name as criado_por_nome
from public.ped_checklists c
left join public.profiles vp on vp.id = c.vendedor_id
left join lateral (select d.* from public.ped_decisoes d
                    where d.checklist_id = c.id and d.versao = c.versao order by d.seq desc limit 1) vig on true
left join public.profiles vigp on vigp.id = vig.registrado_por
left join lateral (select p.* from public.ped_pagamentos p
                    where p.checklist_id = c.id and p.versao = c.versao order by p.seq desc limit 1) pg on true
left join public.ped_finalizacoes f on f.checklist_id = c.id and f.versao = c.versao
left join public.profiles fp on fp.id = f.registrado_por
left join public.profiles cp on cp.id = c.criado_por;
