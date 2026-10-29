-- O COMERCIAL PEDE REAJUSTE (dono, 2026-10-29): "uma opção na Conferência de pedidos onde o Comercial faz uma
-- solicitação de reajuste e informa o motivo, para o Financeiro devolver o pedido que foi finalizado para o Comercial
-- editar novamente — ou recusar e manter como está — porém com histórico desses reajustes e solicitações. Analise
-- para que não haja falha nas informações quando houver diversos reajustes."
--
-- Decisões do dono (2026-10-29, todas as recomendadas):
--   * pedem a vendedora do pedido e o gestor do Comercial (`com_pode_gerir_carteiras`);
--   * em checklist aprovado, pago ou finalizado (decisão vigente "Aprovado");
--   * o reajuste aceito conta SEPARADO da recusa do Financeiro nos indicadores ("Reajustes pedidos");
--   * o Financeiro tem aba própria na Conferência e recebe aviso; a vendedora é avisada da resposta.
--
-- Como não há falha com vários reajustes:
--   * um pedido por vez: no máximo um `pendente` por checklist (índice único parcial);
--   * aceitar = a mesma devolução de 20270212080000 (decisão "Recusado" na versão atual) — a vendedora corrige, a versão
--     sobe e aprovar, pagar e finalizar recomeçam. A decisão fica ligada ao pedido (`decisao_id`), e é essa ligação que
--     tira a devolução da conta de recusas e a põe na de reajustes;
--   * o pendente não fica órfão: qualquer devolução do checklist (pela resposta OU pelo botão "Devolver ao Comercial")
--     fecha o pedido aberto como aceito, no mesmo comando (trigger). Como pendente só existe com o checklist aprovado,
--     e a versão só sobe depois de uma devolução, o pedido nunca sobrevive a uma troca de versão;
--   * recusar exige o motivo do Financeiro; cada pedido, aceito ou recusado, fica no histórico com quem pediu, quando,
--     por quê, quem respondeu, quando e o quê. Nada se apaga (só admin apaga o checklist inteiro, pela FK).
--   * escrita só pelas duas funções: a tabela não tem policy de insert/update/delete.

create table public.ped_reajustes (
  seq bigint generated always as identity,
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  checklist_id uuid not null references public.ped_checklists(id) on delete cascade,
  -- A versão do checklist quando o reajuste foi pedido.
  versao int not null,
  motivo text not null check (btrim(motivo) <> ''),
  pedido_por uuid references public.profiles(id) on delete set null,
  pedido_em timestamptz not null default now(),
  status text not null default 'pendente' check (status in ('pendente', 'aceito', 'recusado')),
  resposta text,
  respondido_por uuid references public.profiles(id) on delete set null,
  respondido_em timestamptz,
  -- A devolução que atendeu o pedido (aceito).
  decisao_id uuid references public.ped_decisoes(id) on delete set null,
  check (status <> 'recusado' or btrim(coalesce(resposta, '')) <> ''),
  check ((status = 'pendente') = (respondido_em is null))
);
create unique index ped_reajustes_um_pendente on public.ped_reajustes (checklist_id) where status = 'pendente';
create index ped_reajustes_checklist on public.ped_reajustes (checklist_id, seq);
create index ped_reajustes_decisao on public.ped_reajustes (decisao_id) where decisao_id is not null;

alter table public.ped_reajustes enable row level security;
-- Ler: quem lê o checklist (a vendedora dele, ou quem vê todos). Escrever: só as funções abaixo.
create policy ped_reajustes_select on public.ped_reajustes for select to authenticated
  using (exists (select 1 from public.ped_checklists c where c.id = ped_reajustes.checklist_id));

-- Quem confere no Financeiro: quem tem "Aprovar e recusar" (conferencia.decidir) num perfil do Financeiro. Dono e admin
-- entram pelo acesso, não pelo aviso ([[avisos-so-dos-meus-setores]]).
create function public.ped_quem_confere(p_tenant uuid)
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct uap.user_id), '{}')
    from public.user_access_profiles uap
    join public.access_profiles ap on ap.id = uap.profile_id
    join public.user_module_access m on m.user_id = uap.user_id and m.module = ap.department
    join public.profiles p on p.id = uap.user_id and coalesce(p.is_active, true)
   where ap.tenant_id = p_tenant and ap.department = 'financeiro'
     and coalesce((ap.permissions -> 'conferencia' ->> 'decidir')::boolean, false);
$$;
revoke all on function public.ped_quem_confere(uuid) from public, anon, authenticated;

-- ─── Pedir ───────────────────────────────────────────────────────────────────────────────────────
create function public.ped_pedir_reajuste(p_checklist uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
  v_id uuid;
begin
  select * into v_ck from public.ped_checklists c
   where c.id = p_checklist and c.tenant_id = public.get_user_tenant_id() for update;
  if v_ck.id is null then
    raise exception 'Checklist não encontrado.' using errcode = 'P0002';
  end if;
  if not (v_ck.vendedor_id = auth.uid() or public.com_pode_gerir_carteiras()) then
    raise exception 'Só a vendedora do pedido ou o gestor do Comercial pedem reajuste.' using errcode = '42501';
  end if;
  if coalesce(public.ped_decisao_vigente(p_checklist), '') <> 'Aprovado' then
    raise exception 'Só dá para pedir reajuste de checklist aprovado, pago ou finalizado.' using errcode = 'P0001';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escreva o motivo do reajuste.' using errcode = '23514';
  end if;
  if exists (select 1 from public.ped_reajustes r where r.checklist_id = p_checklist and r.status = 'pendente') then
    raise exception 'Este checklist já tem um pedido de reajuste esperando o Financeiro.' using errcode = 'P0001';
  end if;

  insert into public.ped_reajustes (tenant_id, checklist_id, versao, motivo, pedido_por)
  values (v_ck.tenant_id, p_checklist, v_ck.versao, btrim(p_motivo), auth.uid())
  returning id into v_id;

  insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
  select v_ck.tenant_id, u, 'reminder', 'ped_reajuste', p_checklist,
         'Reajuste pedido: ' || v_ck.protocolo,
         coalesce((select p.full_name from public.profiles p where p.id = auth.uid()), 'O Comercial')
           || ' pede para reabrir o checklist de ' || v_ck.cliente_nome || '. Motivo: ' || btrim(p_motivo)
    from unnest(public.ped_quem_confere(v_ck.tenant_id)) u
   where u <> auth.uid();
  return v_id;
end;
$$;
revoke all on function public.ped_pedir_reajuste(uuid, text) from public, anon;
grant execute on function public.ped_pedir_reajuste(uuid, text) to authenticated;

-- ─── Toda devolução fecha o pedido aberto (aceito) e avisa quem pediu ────────────────────────────
-- security definer: quem devolve é o Financeiro, que não escreve em `ped_reajustes` (não há policy de escrita).
create function public.ped_devolucao_fecha_reajuste()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_r public.ped_reajustes%rowtype;
begin
  update public.ped_reajustes r
     set status = 'aceito', decisao_id = new.id,
         respondido_por = coalesce(new.registrado_por, auth.uid()), respondido_em = now()
   where r.checklist_id = new.checklist_id and r.status = 'pendente'
  returning * into v_r;
  if v_r.id is not null then
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select v_r.tenant_id, u, 'reminder', 'ped_reajuste_resposta', v_r.checklist_id,
           'Reajuste aceito: ' || c.protocolo,
           'O Financeiro devolveu o checklist de ' || c.cliente_nome || '. Corrija no lançamento e salve para reenviar.'
      from public.ped_checklists c,
           (select distinct x as u from unnest(array[v_r.pedido_por, (select vendedor_id from public.ped_checklists where id = v_r.checklist_id)]) x) d
     where c.id = v_r.checklist_id and u is not null and u <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
  end if;
  return null;
end;
$$;
revoke all on function public.ped_devolucao_fecha_reajuste() from public, anon, authenticated;
create trigger trg_ped_devolucao_fecha_reajuste after insert on public.ped_decisoes
  for each row when (new.status = 'Recusado') execute function public.ped_devolucao_fecha_reajuste();

-- ─── Responder ───────────────────────────────────────────────────────────────────────────────────
create function public.ped_responder_reajuste(p_reajuste uuid, p_aceitar boolean, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_r public.ped_reajustes%rowtype;
  v_ck public.ped_checklists%rowtype;
begin
  select * into v_r from public.ped_reajustes r
   where r.id = p_reajuste and r.tenant_id = public.get_user_tenant_id() for update;
  if v_r.id is null then
    raise exception 'Pedido de reajuste não encontrado.' using errcode = 'P0002';
  end if;
  if not public.ped_pode_decidir() then
    raise exception 'Só quem aprova e recusa na Conferência responde o reajuste.' using errcode = '42501';
  end if;
  if v_r.status <> 'pendente' then
    raise exception 'Este pedido de reajuste já foi respondido.' using errcode = 'P0001';
  end if;
  select * into v_ck from public.ped_checklists where id = v_r.checklist_id;

  if p_aceitar then
    -- A devolução de sempre; o trigger acima fecha este pedido como aceito e avisa.
    insert into public.ped_decisoes (checklist_id, status, motivos, observacao)
    values (v_r.checklist_id, 'Recusado', array['Reajuste pedido pelo Comercial'],
            'Reajuste: ' || v_r.motivo || coalesce(' — ' || nullif(btrim(p_resposta), ''), ''));
    update public.ped_reajustes set resposta = nullif(btrim(p_resposta), '') where id = p_reajuste;
  else
    if btrim(coalesce(p_resposta, '')) = '' then
      raise exception 'Escreva por que o reajuste foi recusado.' using errcode = '23514';
    end if;
    update public.ped_reajustes
       set status = 'recusado', resposta = btrim(p_resposta), respondido_por = auth.uid(), respondido_em = now()
     where id = p_reajuste;
    insert into public.notifications (tenant_id, user_id, type, reference_type, reference_id, title, message)
    select v_r.tenant_id, u, 'reminder', 'ped_reajuste_resposta', v_r.checklist_id,
           'Reajuste recusado: ' || v_ck.protocolo,
           'O Financeiro manteve o checklist de ' || v_ck.cliente_nome || ' como está. Motivo: ' || btrim(p_resposta)
      from (select distinct x as u from unnest(array[v_r.pedido_por, v_ck.vendedor_id]) x) d
     where u is not null and u <> auth.uid();
  end if;
end;
$$;
revoke all on function public.ped_responder_reajuste(uuid, boolean, text) from public, anon;
grant execute on function public.ped_responder_reajuste(uuid, boolean, text) to authenticated;

-- ─── A view: recusa do Financeiro e reajuste em contas separadas, e o histórico dos pedidos ───────
-- A devolução que atendeu um reajuste não é "recusa" (decisão do dono); fica em `reajustes`.
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
  case when f.checklist_id is not null and vig.status = 'Aprovado' then 'Finalizado' else coalesce(vig.status, 'Em análise') end as situacao,
  case when vig.status = 'Aprovado' then coalesce(pg.status, 'Em negociação') end as pagamento_status,
  case when vig.status = 'Aprovado' then pg.data_pagamento end as pagamento_data,
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
    where r.checklist_id = c.id) as historico_reajustes
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

-- ─── Os indicadores: recusas sem os reajustes, e os reajustes por vendedora ──────────────────────
create or replace function public.ped_indicadores(p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_resultado jsonb;
begin
  if v_tenant is null or not public.ped_ve_todos() then
    raise exception 'Só quem acompanha a conferência de pedidos vê os indicadores.' using errcode = '42501';
  end if;

  with ck as (
    select c.id, c.cliente_codigo, c.cliente_nome, c.vendedor_id,
           (select coalesce(sum(p.valor), 0) from public.ped_pedidos p where p.checklist_id = c.id and p.tipo = 'Venda') as valor,
           case when public.ped_finalizado(c.id) then 'Finalizado'
                else coalesce(public.ped_decisao_vigente(c.id), 'Em análise') end as situacao,
           (select count(*) from public.ped_decisoes d where d.checklist_id = c.id and d.status = 'Recusado'
               and not exists (select 1 from public.ped_reajustes r where r.decisao_id = d.id)) as recusas,
           (select count(*) from public.ped_reajustes r where r.checklist_id = c.id and r.status = 'aceito') as reajustes,
           public.ped_ultimo_pagamento(c.id) = 'Pago' as pago
      from public.ped_checklists c
     where c.tenant_id = v_tenant
       and (c.criado_em at time zone 'America/Sao_Paulo')::date between p_de and p_ate
  ),
  faturado as (
    select i.cliente_codigo, sum(i.valor_curva) as valor
      from public.com_vendas_itens i
     where i.tenant_id = v_tenant and i.classe in ('venda', 'devolucao')
       and i.emissao between p_de and p_ate
       and i.cliente_codigo in (select ck.cliente_codigo from ck)
     group by i.cliente_codigo
  ),
  por_cliente as (
    select ck.cliente_codigo as codigo, max(ck.cliente_nome) as nome,
           sum(ck.valor) as registrado,
           sum(ck.valor) filter (where ck.situacao in ('Aprovado', 'Finalizado')) as conciliado,
           sum(ck.valor) filter (where ck.pago) as recebido,
           max(f.valor) as faturado
      from ck left join faturado f on f.cliente_codigo = ck.cliente_codigo
     group by ck.cliente_codigo
  ),
  recusas as (
    select ck.vendedor_id, m as motivo
      from public.ped_decisoes d join ck on ck.id = d.checklist_id, unnest(d.motivos) m
     where d.status = 'Recusado'
       and not exists (select 1 from public.ped_reajustes r where r.decisao_id = d.id)
  ),
  motivos as (
    select motivo, count(*) as vezes from recusas group by motivo
  ),
  por_vendedora as (
    select ck.vendedor_id, coalesce(max(p.full_name), 'Sem nome') as nome,
           count(*) as checklists,
           count(*) filter (where ck.recusas > 0) as com_recusa,
           sum(ck.recusas) as recusas,
           sum(ck.reajustes) as reajustes,
           sum(ck.valor) as valor,
           (select coalesce(jsonb_agg(jsonb_build_object('motivo', x.motivo, 'vezes', x.vezes) order by x.vezes desc, x.motivo), '[]'::jsonb)
              from (select r.motivo, count(*) as vezes from recusas r where r.vendedor_id = ck.vendedor_id group by r.motivo) x) as motivos
      from ck left join public.profiles p on p.id = ck.vendedor_id
     group by ck.vendedor_id
  )
  select jsonb_build_object(
    'registrado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck),
    'conciliado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                    where situacao in ('Aprovado', 'Finalizado')),
    'pendente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck
                  where situacao in ('Em análise', 'Recusado')),
    'divergente', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where recusas > 0),
    'reajustado', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where reajustes > 0),
    'recebido', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(valor), 0)) from ck where pago),
    'percentual_conciliacao', (select case when sum(valor) > 0
                                        then round(100 * coalesce(sum(valor) filter (where situacao in ('Aprovado', 'Finalizado')), 0) / sum(valor), 1)
                                      end from ck),
    'faturado', (select coalesce(sum(valor), 0) from faturado),
    'motivos', (select coalesce(jsonb_agg(jsonb_build_object('motivo', motivo, 'vezes', vezes) order by vezes desc, motivo), '[]'::jsonb) from motivos),
    'por_vendedora', (select coalesce(jsonb_agg(jsonb_build_object(
                        'vendedor_id', vendedor_id, 'nome', nome, 'checklists', checklists, 'com_recusa', com_recusa,
                        'recusas', recusas, 'reajustes', reajustes, 'valor', valor,
                        'taxa', round(100.0 * com_recusa / nullif(checklists, 0), 1), 'motivos', motivos)
                        order by recusas desc, com_recusa desc, nome), '[]'::jsonb) from por_vendedora),
    'por_cliente', (select coalesce(jsonb_agg(jsonb_build_object(
                      'codigo', codigo, 'nome', nome, 'registrado', registrado,
                      'conciliado', coalesce(conciliado, 0), 'recebido', coalesce(recebido, 0),
                      'faturado', coalesce(faturado, 0)) order by registrado desc), '[]'::jsonb) from por_cliente)
  ) into v_resultado;

  return v_resultado;
end;
$$;
