-- O cartão de quem responde por mais de uma carteira soma todas elas (visto na tela em 2026-11-05: "BERCARIO, ESPECIAL").
do $$
declare
  v_def text := pg_get_functiondef('public.com_composicao_da_venda(date, date, text, text, text)'::regprocedure);
  p text[];
begin
  foreach p slice 1 in array array[
    [$x$v_carteira text := nullif(public.normalizar_nome_carteira(coalesce(p_carteira, '')), '');$x$,
     $x$v_carteiras text[] := (select array_agg(public.normalizar_nome_carteira(x)) from unnest(string_to_array(nullif(btrim(p_carteira), ''), ',')) x);$x$],
    ['(v_carteira is null or c.carteira = v_carteira)', '(v_carteiras is null or c.carteira = any (v_carteiras))']
  ] loop
    if position(p[1] in v_def) = 0 then
      raise exception 'trecho não encontrado: %', p[1];
    end if;
    v_def := replace(v_def, p[1], p[2]);
  end loop;
  execute v_def;
end;
$$;
