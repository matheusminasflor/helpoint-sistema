-- CARTEIRA: PERÍODO, FILIAL E A MÉDIA SÓ COM OS MESES QUE EXISTEM (dono, 2026-10-15).
--   1. período: "não consigo ver a Daniele nos últimos 10 meses de 2026". A Carteira aceita um mês OU um período
--      (de–até), como os Indicadores; no período, a venda é a do período e a média divide pelos meses dele;
--   2. filial: o filtro INBRAS / MF vale para tudo. O Forteplus tem a filial; o lançamento passa a ter a "filial da
--      nota" (`nota_filial`), obrigatória para quem lança nota (`com_salvar_interacao`); o A faturar usa a filial do
--      pedido do checklist;
--   3. "só importei 2026, como a coluna 12 meses mostra 2025?": a janela de 12 e de 3 meses começa onde começa o dado
--      importado, e a média divide só pelos meses que existem (`meses_12`, `meses_3` vão para a tela escrever);
--   4. o cliente, mês a mês, no período (`com_cliente_mes_a_mes`).
-- A soma de venda deixa de se repetir em cinco subconsultas: `com_vendas_unificadas` é a base única (o Forteplus até a
-- última nota importada; depois dele, o lançamento com nota — "faturado manda", 20261202030000).

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

-- ─── 1. A filial da nota no lançamento ───────────────────────────────────────────────────────────
alter table public.com_interacoes add column if not exists nota_filial text;
alter table public.com_interacoes drop constraint if exists com_interacoes_nota_filial;
alter table public.com_interacoes add constraint com_interacoes_nota_filial
  check (nota_filial is null or (nota_filial in ('INBRAS', 'MF') and nota_fiscal is not null));

select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$  v_nota_em date := nullif(p_dados ->> 'nota_em', '')::date;
$$,
$$  v_nota_em date := nullif(p_dados ->> 'nota_em', '')::date;
  v_filial text := upper(nullif(btrim(p_dados ->> 'nota_filial'), ''));
$$);
select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$  if v_nota is not null then
    v_nota_em := coalesce($$,
$$  if v_nota is not null and v_filial is null then
    raise exception 'Escolha a filial da nota: INBRAS ou MF.' using errcode = '23514';
  end if;
  if v_nota is null then
    v_filial := null;
  end if;
  if v_nota is not null then
    v_nota_em := coalesce($$);
select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$(cliente_codigo, data, status, valor_venda, nota_fiscal, nota_em, prazo$$,
$$(cliente_codigo, data, status, valor_venda, nota_fiscal, nota_em, nota_filial, prazo$$);
select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$      v_valor, v_nota, v_nota_em,
$$,
$$      v_valor, v_nota, v_nota_em, v_filial,
$$);
select pg_temp.troca('public.com_salvar_interacao(uuid, jsonb, uuid[])'::regprocedure,
$$      nota_em          = v_nota_em,
$$,
$$      nota_em          = v_nota_em,
      nota_filial      = v_filial,
$$);
-- A nota posta não muda — e a filial dela também não.
select pg_temp.troca('public.com_interacao_salva_nao_muda()'::regprocedure,
$$new.nota_em is distinct from old.nota_em$$,
$$new.nota_em is distinct from old.nota_em or new.nota_filial is distinct from old.nota_filial$$);

-- A conferência contra o Forteplus: entre as notas de mesmo número, a da filial lançada primeiro.
select pg_temp.troca('public.com_notas_que_nao_bateram(date, date)'::regprocedure,
$$order by (n.chave = l.chave) desc,$$,
$$order by (n.filial is not distinct from l.nota_filial) desc, (n.chave = l.chave) desc,$$);

-- ─── 2. A base única de vendas ───────────────────────────────────────────────────────────────────
-- `security invoker` e sem grant: só as leituras `security definer` abaixo a chamam (e, nelas, como o dono).
create or replace function public.com_vendas_unificadas(p_codigos text[], p_de date, p_ate date, p_filial text)
returns table(codigo text, dia date, valor numeric)
language sql stable security invoker set search_path to 'public' as $$
  with corte as (select public.com_faturado_importado_ate() as d)
  select vi.cliente_codigo, vi.emissao, vi.valor_curva
    from public.com_vendas_itens vi, corte
   where vi.tenant_id = public.get_user_tenant_id() and vi.cliente_codigo = any (p_codigos)
     and vi.classe in ('venda', 'devolucao') and vi.emissao <= corte.d
     and vi.emissao >= p_de and vi.emissao < p_ate
     and (p_filial is null or vi.filial = p_filial)
  union all
  select i.cliente_codigo, i.nota_em, i.valor_venda
    from public.com_interacoes i, corte
   where i.tenant_id = public.get_user_tenant_id() and i.cliente_codigo = any (p_codigos)
     and i.valor_venda > 0 and (corte.d is null or i.nota_em > corte.d)
     and i.nota_em >= p_de and i.nota_em < p_ate
     and (p_filial is null or i.nota_filial = p_filial);
$$;
revoke all on function public.com_vendas_unificadas(text[], date, date, text) from public, anon, authenticated;

-- ─── 3. A Carteira ───────────────────────────────────────────────────────────────────────────────
drop function if exists public.com_acompanhamento_da_carteira(text, date);
create function public.com_acompanhamento_da_carteira(
  p_carteira text, p_competencia date, p_de date default null, p_ate date default null, p_filial text default null)
returns table(grupo_chave text, grupo_nome text, codigos text[], tabelas text, uf_cidade text, situacao text,
              ultima_compra date, dias_sem_comprar integer, venda_12m numeric, meses_12 integer, meses_com_compra integer,
              recompra boolean, venda_mes numeric, venda_mes_passado numeric, meses_periodo integer,
              media_12m numeric, media_3m numeric, meses_3 integer, a_faturar numeric,
              contatos_mes integer, ultimo_contato date, status_ultimo_contato text, proximo_prazo date, observacao text)
language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_tenant uuid := public.get_user_tenant_id();
  v_carteira text := public.normalizar_nome_carteira(p_carteira);
  v_periodo boolean := p_de is not null and p_ate is not null;
  v_de date := case when v_periodo then p_de else date_trunc('month', p_competencia)::date end;
  -- `v_ate` é EXCLUSIVO: o dia seguinte ao último.
  v_ate date := case when v_periodo then p_ate + 1 else (date_trunc('month', p_competencia) + interval '1 month')::date end;
  -- O período anterior: o mês passado, ou os mesmos dias imediatamente antes do período.
  v_antes date := case when v_periodo then v_de - (v_ate - v_de) else (v_de - interval '1 month')::date end;
  v_ref date := least((now() at time zone 'America/Sao_Paulo')::date, v_ate - 1);
  -- Onde começa o dado importado: a janela de 12 e de 3 meses não vai antes disso.
  v_inicio date := (select date_trunc('month', min(vi.emissao))::date from public.com_vendas_itens vi where vi.tenant_id = v_tenant);
  v_mes_de date := date_trunc('month', v_de)::date;
  v_de12 date := greatest((v_mes_de - interval '12 months')::date, coalesce(v_inicio, (v_mes_de - interval '12 months')::date));
  v_de3 date := greatest((v_mes_de - interval '3 months')::date, coalesce(v_inicio, (v_mes_de - interval '3 months')::date));
  v_meses12 int := greatest(0, (extract(year from age(v_mes_de, v_de12)) * 12 + extract(month from age(v_mes_de, v_de12)))::int);
  v_meses3 int := greatest(0, (extract(year from age(v_mes_de, v_de3)) * 12 + extract(month from age(v_mes_de, v_de3)))::int);
  v_meses_periodo int := ((extract(year from v_ate - 1) - extract(year from v_de)) * 12
                          + extract(month from v_ate - 1) - extract(month from v_de) + 1)::int;
  v_filial text := nullif(upper(btrim(p_filial)), '');
  v_codigos text[];
begin
  if v_tenant is null or not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;
  select array_agg(c.codigo) into v_codigos from public.com_clientes c where c.tenant_id = v_tenant and c.carteira = v_carteira;

  return query
  with clientes as (
    select c.codigo, c.tabela_preco, c.cidade, c.estado,
           public.com_chave_do_grupo(c.grupo, c.codigo) as chave,
           coalesce(nullif(btrim(c.grupo), ''), c.razao_social) as nome
      from public.com_clientes c
     where c.tenant_id = v_tenant and c.carteira = v_carteira
  ),
  -- Do começo da janela de 12 meses até o fim do período: tudo que as colunas de venda leem.
  vendas as (
    select cl.chave, v.dia, v.valor
      from public.com_vendas_unificadas(v_codigos, least(v_de12, v_antes), v_ate, v_filial) v
      join clientes cl on cl.codigo = v.codigo
  ),
  ultima as (
    select cl.chave, max(v.dia) as dia
      from public.com_vendas_unificadas(v_codigos, '1900-01-01', v_ref + 1, v_filial) v
      join clientes cl on cl.codigo = v.codigo
     where v.valor > 0 group by cl.chave
  ),
  soma as (
    select v.chave,
           sum(v.valor) filter (where v.dia >= v_de and v.dia < v_ate) as periodo,
           sum(v.valor) filter (where v.dia >= v_antes and v.dia < v_de) as antes,
           sum(v.valor) filter (where v.dia >= v_de12 and v.dia < v_mes_de) as doze,
           sum(v.valor) filter (where v.dia >= v_de3 and v.dia < v_mes_de) as tres
      from vendas v group by v.chave
  ),
  meses_compra as (
    select m.chave, count(*)::int as meses
      from (select v.chave, date_trunc('month', v.dia) from vendas v
             where v.dia >= v_de12 and v.dia < v_mes_de group by 1, 2 having sum(v.valor) > 0) m
     group by m.chave
  ),
  a_faturar as (
    select cl.chave, sum(p.valor) as valor
      from clientes cl
      join public.com_interacoes i on i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
      join public.ped_checklists ck on ck.interacao_id = i.id
      join public.ped_pedidos p on p.checklist_id = ck.id and p.tipo = 'Venda'
     where i.nota_fiscal is null and i.data >= v_de and i.data < v_ate
       and (v_filial is null or p.filial = v_filial)
     group by cl.chave
  ),
  -- Os contatos do período, de QUALQUER vendedora, para os clientes desta carteira.
  contatos as (
    select cl.chave, i.*
      from clientes cl
      join public.com_interacoes i on i.tenant_id = v_tenant and i.cliente_codigo = cl.codigo
     where i.data >= v_de and i.data < v_ate
  ),
  contatos_grupo as (select c.chave, count(*)::int as n from contatos c group by c.chave),
  ultimo as (
    select distinct on (c.chave) c.chave, c.data, c.status, c.prazo, c.observacoes
      from contatos c order by c.chave, c.data desc, c.created_at desc
  )
  select g.chave,
         min(g.nome),
         array_agg(g.codigo order by g.codigo),
         string_agg(distinct g.tabela_preco, ', '),
         string_agg(distinct nullif(concat_ws(' - ', g.estado, g.cidade), ''), '; '),
         case when u.dia is null then 'nunca_comprou' when v_ref - u.dia <= 120 then 'ativo' else 'inativo' end,
         u.dia,
         (v_ref - u.dia)::int,
         coalesce(s.doze, 0),
         v_meses12,
         coalesce(mc.meses, 0),
         coalesce(mc.meses, 0) >= 2,
         coalesce(s.periodo, 0),
         coalesce(s.antes, 0),
         v_meses_periodo,
         case when v_meses12 > 0 then round(coalesce(s.doze, 0) / v_meses12, 2) else 0 end,
         case when v_meses3 > 0 then round(coalesce(s.tres, 0) / v_meses3, 2) else 0 end,
         v_meses3,
         coalesce(af.valor, 0),
         coalesce(cg.n, 0),
         ul.data, ul.status, ul.prazo, ul.observacoes
    from clientes g
    left join ultima u on u.chave = g.chave
    left join soma s on s.chave = g.chave
    left join meses_compra mc on mc.chave = g.chave
    left join a_faturar af on af.chave = g.chave
    left join contatos_grupo cg on cg.chave = g.chave
    left join ultimo ul on ul.chave = g.chave
   group by g.chave, u.dia, s.periodo, s.antes, s.doze, s.tres, mc.meses, af.valor, cg.n,
            ul.data, ul.status, ul.prazo, ul.observacoes
   order by coalesce(s.doze, 0) desc, min(g.nome);
end;
$function$;
revoke all on function public.com_acompanhamento_da_carteira(text, date, date, date, text) from public, anon;
grant execute on function public.com_acompanhamento_da_carteira(text, date, date, date, text) to authenticated;

-- ─── 4. O cliente, mês a mês ─────────────────────────────────────────────────────────────────────
create or replace function public.com_cliente_mes_a_mes(p_carteira text, p_codigos text[], p_de date, p_ate date,
                                                        p_filial text default null)
returns table(mes date, venda numeric)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_codigos text[];
begin
  if not public.com_pode_ver_carteira(p_carteira) then
    raise exception 'Você não tem acesso a esta carteira.' using errcode = '42501';
  end if;
  -- Só os códigos que são mesmo desta carteira: a porta é a carteira, não o código que a tela mandou.
  select array_agg(c.codigo) into v_codigos from public.com_clientes c
   where c.tenant_id = public.get_user_tenant_id() and c.carteira = public.normalizar_nome_carteira(p_carteira)
     and c.codigo = any (p_codigos);
  return query
  select m.mes::date, coalesce(sum(v.valor), 0)
    from generate_series(date_trunc('month', p_de), date_trunc('month', p_ate), interval '1 month') m(mes)
    left join public.com_vendas_unificadas(v_codigos, p_de, p_ate + 1, nullif(upper(btrim(p_filial)), '')) v
      on date_trunc('month', v.dia) = m.mes
   group by m.mes order by m.mes;
end;
$$;
revoke all on function public.com_cliente_mes_a_mes(text, text[], date, date, text) from public, anon;
grant execute on function public.com_cliente_mes_a_mes(text, text[], date, date, text) to authenticated;
