-- A grade anual da Carteira passa a respeitar a filial escolhida (tópico 5, dono, 2026-11-05).
do $$
declare
  v_def text := pg_get_functiondef('public.com_carteira_mes_a_mes(text, integer)'::regprocedure);
  p text[];
begin
  foreach p slice 1 in array array[
    ['p_ano integer)', 'p_ano integer, p_filial text DEFAULT NULL::text)'],
    ['v_corte date := public.com_faturado_importado_ate();', $x$v_corte date := public.com_faturado_importado_ate();
  v_filial text := nullif(upper(btrim(p_filial)), '');$x$],
    [$x$and v.classe in ('venda', 'devolucao')$x$, $x$and v.classe in ('venda', 'devolucao') and (v_filial is null or v.filial = v_filial)$x$],
    ['and i.valor_venda > 0', 'and i.valor_venda > 0 and (v_filial is null or i.nota_filial = v_filial)'],
    ['where c.carteira = v_carteira), 0) as m_venda', 'where c.carteira = v_carteira and (v_filial is null or n.filial = v_filial)), 0) as m_venda']
  ] loop
    if position(p[1] in v_def) = 0 then
      raise exception 'trecho não encontrado: %', p[1];
    end if;
    v_def := replace(v_def, p[1], p[2]);
  end loop;
  drop function public.com_carteira_mes_a_mes(text, integer);
  execute v_def;
end;
$$;

revoke all on function public.com_carteira_mes_a_mes(text, integer, text) from public, anon;
grant execute on function public.com_carteira_mes_a_mes(text, integer, text) to authenticated;
