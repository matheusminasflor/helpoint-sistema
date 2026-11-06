-- Trocar a tabela do cliente não mexe mais no que já passou (dono, 2026-11-06). Até aqui a Venda total lia a tabela de hoje:
-- quem saísse da condição perdia a parte da condição de outubro em diante, inclusive em mês fechado. Agora vale a tabela do
-- dia da venda. `com_clientes_tabela_historico` já existia, mas só as importações gravavam nela: passa a nascer de um
-- gatilho, para toda porta. A primeira tabela conhecida vale desde sempre (o cliente costuma chegar pela venda, sem tabela, e
-- ganhar a tabela depois).
--
-- `periodos_condicao` guarda quando o cliente esteve em condição, para a conta não consultar o histórico a cada linha: foi o
-- que levou o cashback do ano a 46 s (20270212400000).
alter table public.com_clientes add column if not exists periodos_condicao datemultirange;
alter table public.com_clientes_tabela_historico alter column created_at set default clock_timestamp();
create index if not exists com_clientes_tabela_historico_cliente
  on public.com_clientes_tabela_historico (tenant_id, cliente_codigo, vigente_desde, created_at);

create or replace function public.com_parte_no_dia(p_periodos datemultirange, p_dia date)
returns numeric language sql immutable as $$
  select case when p_dia >= date '2026-10-01' and p_periodos @> p_dia then 1 else 0 end::numeric;
$$;

create or replace function public.com_parte_do_cliente(p_codigo text, p_dia date)
returns numeric language sql stable set search_path to 'public' as $$
  select coalesce((select public.com_parte_no_dia(c.periodos_condicao, p_dia) from public.com_clientes c
                    where c.tenant_id = public.get_user_tenant_id() and c.codigo = p_codigo), 0);
$$;

-- Escrita de gatilho é do sistema: quem pode mudar o cliente não precisa poder escrever no histórico.
create or replace function public.com_guarda_tabela_do_cliente()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_ultima text;
begin
  select h.tabela_preco into v_ultima from public.com_clientes_tabela_historico h
   where h.tenant_id = new.tenant_id and h.cliente_codigo = new.codigo
   order by h.vigente_desde desc, h.created_at desc limit 1;
  -- As importações gravam o histórico antes de mudar o cliente, com o número da importação.
  if (found and v_ultima is not distinct from new.tabela_preco) or (not found and new.tabela_preco is null) then
    return null;
  end if;
  insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco)
  values (new.tenant_id, new.codigo, new.tabela_preco);
  return null;
end;
$$;

create or replace function public.com_periodos_da_condicao(p_tenant uuid, p_codigo text)
returns datemultirange language sql stable set search_path to 'public' as $$
  select range_agg(daterange(r.desde, r.ate))
    from (select case when row_number() over w = 1 then null else h.vigente_desde end as desde,
                 lead(h.vigente_desde) over w as ate, h.tabela_preco
            from public.com_clientes_tabela_historico h
           where h.tenant_id = p_tenant and h.cliente_codigo = p_codigo
          window w as (order by h.vigente_desde, h.created_at)) r
   where public.com_parte_da_condicao(r.tabela_preco, 'infinity') = 1;
$$;

create or replace function public.com_recalcula_periodos_condicao()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update public.com_clientes c set periodos_condicao = public.com_periodos_da_condicao(new.tenant_id, new.cliente_codigo)
   where c.tenant_id = new.tenant_id and c.codigo = new.cliente_codigo;
  return null;
end;
$$;

revoke all on function public.com_guarda_tabela_do_cliente() from public, anon;
revoke all on function public.com_recalcula_periodos_condicao() from public, anon;
revoke all on function public.com_periodos_da_condicao(uuid, text) from public, anon;
revoke all on function public.com_parte_no_dia(datemultirange, date) from public, anon;
grant execute on function public.com_parte_no_dia(datemultirange, date) to authenticated;

drop trigger if exists trg_com_clientes_guarda_tabela on public.com_clientes;
create trigger trg_com_clientes_guarda_tabela after insert or update of tabela_preco on public.com_clientes
  for each row execute function public.com_guarda_tabela_do_cliente();

drop trigger if exists trg_com_tabela_historico_periodos on public.com_clientes_tabela_historico;
create trigger trg_com_tabela_historico_periodos after insert on public.com_clientes_tabela_historico
  for each row execute function public.com_recalcula_periodos_condicao();

-- O ponto de partida: nenhuma troca foi registrada até aqui, então a tabela de hoje vale para outubro em diante.
insert into public.com_clientes_tabela_historico (tenant_id, cliente_codigo, tabela_preco, vigente_desde)
select c.tenant_id, c.codigo, c.tabela_preco, date '2026-10-01'
  from public.com_clientes c
 where c.tabela_preco is not null
   and not exists (select 1 from public.com_clientes_tabela_historico h
                    where h.tenant_id = c.tenant_id and h.cliente_codigo = c.codigo);
update public.com_clientes c set periodos_condicao = public.com_periodos_da_condicao(c.tenant_id, c.codigo);

-- As contas passam a ler os períodos no lugar da tabela de hoje.
do $$
declare
  f regprocedure;
  v_def text;
begin
  foreach f in array array[
    'public.com_vendas_unificadas(text[], date, date, text)',
    'public.com_venda_atribuida(date, date)',
    'public.com_carteira_mes_a_mes(text, integer, text)',
    'public.dir_realizado_carteiras(integer[])',
    'public.dir_realizado_total(integer[])',
    'public.com_cashback_mensal(integer, text, text, date, date, text)',
    'public.com_composicao_da_venda(date, date, text, text, text)'
  ]::regprocedure[] loop
    v_def := regexp_replace(pg_get_functiondef(f), 'public\.com_parte_da_condicao\((\w+)\.tabela_preco,',
                            'public.com_parte_no_dia(\1.periodos_condicao,', 'g');
    v_def := replace(v_def, 'c.tabela_base, c.tabela_preco', 'c.tabela_base, c.periodos_condicao');
    -- O cashback lia o dia 1 do mês: quem troca de tabela no meio do mês tem de somar como a Carteira, nota a nota.
    v_def := replace(v_def, 'public.com_parte_no_dia(cc.periodos_condicao, i.competencia)', 'public.com_parte_no_dia(cc.periodos_condicao, i.emissao)');
    v_def := replace(v_def, $x$select coalesce(sum(s.valor_curva), 0) * (1 + public.com_parte_no_dia(ct.periodos_condicao, (ct.competencia + interval '1 month')::date))$x$,
                     'select coalesce(sum(s.valor_curva * (1 + public.com_parte_no_dia(ct.periodos_condicao, s.emissao))), 0)');
    if position('com_parte_da_condicao' in v_def) > 0 then
      raise exception 'trecho não trocado em %', f;
    end if;
    execute v_def;
  end loop;
end;
$$;

-- A Carteira, que ainda ganha a quantidade de pedidos por faturar: o cartão dizia clientes, e a tela de pedidos, pedidos.
do $$
declare
  v_def text := pg_get_functiondef('public.com_acompanhamento_da_carteira(text, date, date, date, text)'::regprocedure);
  p text[];
begin
  foreach p slice 1 in array array[
    ['a_faturar numeric, contatos_mes integer', 'a_faturar numeric, pedidos_a_faturar integer, contatos_mes integer'],
    ['select c.codigo, c.tabela_preco, c.cidade, c.estado,', 'select c.codigo, c.tabela_preco, c.periodos_condicao, c.cidade, c.estado,'],
    ['sum(p.valor * (1 + public.com_parte_da_condicao(cl.tabela_preco, v_ref))) as valor',
     'sum(p.valor * (1 + public.com_parte_no_dia(cl.periodos_condicao, v_ref))) as valor, count(*)::int as pedidos'],
    ['coalesce(af.valor, 0),', 'coalesce(af.valor, 0), coalesce(af.pedidos, 0),'],
    ['mc.meses, af.valor, cg.n,', 'mc.meses, af.valor, af.pedidos, cg.n,']
  ] loop
    if position(p[1] in v_def) = 0 then
      raise exception 'trecho não encontrado: %', p[1];
    end if;
    v_def := replace(v_def, p[1], p[2]);
  end loop;
  drop function public.com_acompanhamento_da_carteira(text, date, date, date, text);
  execute v_def;
end;
$$;

revoke all on function public.com_acompanhamento_da_carteira(text, date, date, date, text) from public, anon;
grant execute on function public.com_acompanhamento_da_carteira(text, date, date, date, text) to authenticated;
