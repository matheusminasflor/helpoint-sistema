-- O PEDIDO DIZ A SÉRIE E A NOTA (dono, 2026-10-16). Com a série 76 (cashback) nova, o dono teme que o Comercial erre
-- a série no Forteplus: "se ele marcou cashback e o pedido é série 75, vai travar ... tem que refazer o pedido e trocar
-- para a série 76. Isso induz que o Financeiro receba as informações corretas". O espelho do pedido NÃO traz a série
-- (todo espelho sai "Pedido de venda"), então:
--   1. cada pedido do checklist ganha a SÉRIE (1, 75 ou 76), obrigatória, e a combinação com o TIPO é travada:
--      Venda na 1 ou 75 · Bonificação na 75 · Publicidade na 1 · Cashback na 76;
--   2. cada pedido ganha o Nº DA NOTA, informado depois do faturamento (`ped_informar_nota`: o checklist aprovado não
--      muda mais, a nota chega depois) — pela vendedora ou pelo Financeiro, até finalizar;
--   3. quando a nota chega na importação do Forteplus, ela é conferida (`ped_situacao_das_notas`): mesma série, o tipo
--      certo (CFOP de venda × remessa da série), mesmo cliente;
--   4. decisão do dono: "Trava o pedido até corrigir" — o Financeiro não FINALIZA com pedido sem nota ou com a nota na
--      série/tipo errado. Nota ainda não importada não trava (a importação é semanal).
-- Pedido de antes desta migration (sem série) fica fora da conferência: não se cobra o que não se pediu.

alter table public.ped_pedidos
  add column if not exists serie text check (serie in ('1', '75', '76')),
  add column if not exists nota_fiscal text;
alter table public.ped_pedidos drop constraint if exists ped_pedidos_tipo_serie;
alter table public.ped_pedidos add constraint ped_pedidos_tipo_serie check (
  serie is null
  or (tipo = 'Venda' and serie in ('1', '75'))
  or (tipo = 'Bonificação' and serie = '75')
  or (tipo = 'Publicidade' and serie = '1')
  or (tipo = 'Cashback' and serie = '76'));

/** A série que cada tipo aceita, na frase que a tela e o banco dizem. */
create or replace function public.ped_series_do_tipo(p_tipo text)
returns text language sql immutable set search_path = public as $$
  select case p_tipo when 'Venda' then 'série 1 ou 75' when 'Bonificação' then 'série 75'
                     when 'Publicidade' then 'série 1' when 'Cashback' then 'série 76' end;
$$;
revoke all on function public.ped_series_do_tipo(text) from public, anon;
grant execute on function public.ped_series_do_tipo(text) to authenticated;

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

-- ─── 1. Salvar o checklist: a série, obrigatória e travada com o tipo ────────────────────────────
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
$$  for v_ped in select * from jsonb_array_elements(v_pedidos) loop
    insert into public.ped_pedidos as p$$,
$$  for v_ped in select * from jsonb_array_elements(v_pedidos) loop
    if nullif(v_ped ->> 'serie', '') is null then
      raise exception 'Pedido %: escolha a série do pedido no Forteplus (1, 75 ou 76).', v_ped ->> 'ordem' using errcode = '23514';
    end if;
    if (v_ped ->> 'tipo', v_ped ->> 'serie') not in (('Venda', '1'), ('Venda', '75'), ('Bonificação', '75'),
                                                     ('Publicidade', '1'), ('Cashback', '76')) then
      raise exception 'Pedido %: % sai na %, e o pedido está na série %. Refaça o pedido no Forteplus na série certa e troque aqui.',
        v_ped ->> 'ordem', v_ped ->> 'tipo', public.ped_series_do_tipo(v_ped ->> 'tipo'), v_ped ->> 'serie'
        using errcode = '23514';
    end if;
    insert into public.ped_pedidos as p$$);
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
$$qtd_tonalizante, importado_em)$$, $$qtd_tonalizante, importado_em, serie)$$);
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
$$then now() end)
    on conflict$$, $$then now() end, v_ped ->> 'serie')
    on conflict$$);
select pg_temp.troca('public.ped_salvar_checklist(uuid, jsonb)'::regprocedure,
$$set tipo = excluded.tipo, filial = excluded.filial,$$, $$set tipo = excluded.tipo, serie = excluded.serie, filial = excluded.filial,$$);

-- ─── 2. O Nº da nota, depois do faturamento ──────────────────────────────────────────────────────
create or replace function public.ped_informar_nota(p_pedido uuid, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_ped public.ped_pedidos%rowtype;
  v_ck public.ped_checklists%rowtype;
begin
  select * into v_ped from public.ped_pedidos where id = p_pedido and tenant_id = public.get_user_tenant_id();
  if v_ped.id is null then
    raise exception 'Pedido não encontrado.' using errcode = 'P0002';
  end if;
  select * into v_ck from public.ped_checklists where id = v_ped.checklist_id;
  if not (v_ck.vendedor_id = auth.uid() or public.ped_pode_decidir() or public.ped_pode_registrar_pagamento()) then
    raise exception 'Só quem fez o pedido ou o Financeiro informa a nota.' using errcode = '42501';
  end if;
  if exists (select 1 from public.ped_finalizacoes f where f.checklist_id = v_ck.id) then
    raise exception 'Checklist finalizado: a nota não muda mais.' using errcode = 'P0001';
  end if;
  update public.ped_pedidos set nota_fiscal = nullif(ltrim(regexp_replace(coalesce(p_nota, ''), '\D', '', 'g'), '0'), '')
   where id = p_pedido;
end;
$$;
revoke all on function public.ped_informar_nota(uuid, text) from public, anon;
grant execute on function public.ped_informar_nota(uuid, text) to authenticated;

-- ─── 3. A conferência da nota que chegou do Forteplus ────────────────────────────────────────────
-- security definer: o Financeiro confere sem enxergar a base de vendas do Comercial; quem chama tem de ver o checklist.
create or replace function public.ped_situacao_das_notas(p_checklist uuid)
returns table(pedido_id uuid, ordem int, situacao text, mensagem text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_ck public.ped_checklists%rowtype;
begin
  select * into v_ck from public.ped_checklists c where c.id = p_checklist and c.tenant_id = public.get_user_tenant_id();
  if v_ck.id is null or not (v_ck.vendedor_id = auth.uid() or public.ped_ve_todos()) then
    return;
  end if;
  return query
  with nota as (
    select p.id, p.ordem, p.tipo, p.serie, p.filial, p.nota_fiscal,
           (select json_build_object(
                     'serie', min(vi.serie), 'series', count(distinct vi.serie),
                     'venda', bool_or(vi.classe = 'venda'), 'remessa', min(vi.remessa),
                     'cliente', public.com_chave_do_grupo(max(c.grupo), max(vi.cliente_codigo)))
              from public.com_vendas_itens vi
              left join public.com_clientes c on c.tenant_id = vi.tenant_id and c.codigo = vi.cliente_codigo
             where vi.tenant_id = v_ck.tenant_id and vi.filial = p.filial
               and ltrim(regexp_replace(vi.documento, '\D', '', 'g'), '0') = p.nota_fiscal
             having count(*) > 0) as n
      from public.ped_pedidos p
     where p.checklist_id = p_checklist and p.serie is not null
  ),
  cli as (
    select public.com_chave_do_grupo(c.grupo, c.codigo) as chave
      from public.com_clientes c where c.tenant_id = v_ck.tenant_id and c.codigo = v_ck.cliente_codigo
  )
  select x.id, x.ordem,
    case when x.nota_fiscal is null then 'sem_nota'
         when x.n is null then 'aguardando_importacao'
         when x.n ->> 'serie' is distinct from x.serie
           or case x.tipo when 'Venda' then not (x.n ->> 'venda')::boolean
                          when 'Bonificação' then x.n ->> 'remessa' is distinct from 'bonificacao'
                          when 'Publicidade' then x.n ->> 'remessa' is distinct from 'publicidade'
                          when 'Cashback' then x.n ->> 'remessa' is distinct from 'cashback' end
           or x.n ->> 'cliente' is distinct from (select chave from cli) then 'divergente'
         else 'ok' end,
    case when x.nota_fiscal is null then format('Pedido %s (%s): falta o Nº da nota.', x.ordem, x.tipo)
         when x.n is null then format('Pedido %s: a nota %s ainda não chegou na importação do Forteplus.', x.ordem, x.nota_fiscal)
         when x.n ->> 'cliente' is distinct from (select chave from cli)
           then format('Pedido %s: a nota %s é de outro cliente.', x.ordem, x.nota_fiscal)
         when x.n ->> 'serie' is distinct from x.serie
           then format('Pedido %s (%s): a nota %s saiu na série %s, e o pedido diz série %s. %s sai na %s: corrija no Forteplus.',
                       x.ordem, x.tipo, x.nota_fiscal, x.n ->> 'serie', x.serie, x.tipo, public.ped_series_do_tipo(x.tipo))
         when case x.tipo when 'Venda' then not (x.n ->> 'venda')::boolean
                          when 'Bonificação' then x.n ->> 'remessa' is distinct from 'bonificacao'
                          when 'Publicidade' then x.n ->> 'remessa' is distinct from 'publicidade'
                          when 'Cashback' then x.n ->> 'remessa' is distinct from 'cashback' end
           then format('Pedido %s (%s): a nota %s não é de %s no Forteplus (CFOP de %s). Corrija no Forteplus.',
                       x.ordem, x.tipo, x.nota_fiscal, lower(x.tipo),
                       case when (x.n ->> 'venda')::boolean then 'venda' else 'remessa gratuita' end)
         else format('Pedido %s: nota %s conferida.', x.ordem, x.nota_fiscal) end
  from nota x
  order by x.ordem;
end;
$$;
revoke all on function public.ped_situacao_das_notas(uuid) from public, anon;
grant execute on function public.ped_situacao_das_notas(uuid) to authenticated;

-- ─── 4. Finalizar: não com pedido sem nota nem com a nota errada ─────────────────────────────────
select pg_temp.troca('public.ped_finalizacoes_antes_inserir()'::regprocedure,
$$  return new;
end;$$,
$$  -- 2026-10-16: "trava o pedido até corrigir". A nota que ainda não chegou na importação não trava.
  select string_agg(s.mensagem, ' ' order by s.ordem) into v_problema
    from public.ped_situacao_das_notas(new.checklist_id) s where s.situacao in ('sem_nota', 'divergente');
  if v_problema is not null then
    raise exception 'Não dá para finalizar: %', v_problema using errcode = 'P0001';
  end if;
  return new;
end;$$);
select pg_temp.troca('public.ped_finalizacoes_antes_inserir()'::regprocedure,
$$AS $function$
begin$$, $$AS $function$
declare
  v_problema text;
begin$$);
