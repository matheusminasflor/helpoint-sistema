-- IMPORTAR POR PERÍODO (migration 20270212722000; dono, 2026-11-11): ano, mês ou semana.
--   1    a semana sobre um mês já importado, sem "substituir", é recusada
--   2-3  com "substituir", troca só os dias da semana: o resto do mês fica
--   4    a reserva do mês vira dois trechos, com a semana no meio
--   5    nota fora do período confirmado não publica
--   6    data inicial depois da final é recusada
--   7    o ano (vários meses) entra numa importação só
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as select tests.create_tenant('pgtap-periodo', 'Periodo', false) as a;
create temporary table u on commit drop as select tests.create_user('dono@periodo.test', (select a from f)) as dono;
select tests.grant_role((select dono from u), 'owner');
grant select on f, u to authenticated;

create function tests.item(p_emissao text, p_doc text, p_valor numeric) returns jsonb language sql as $$
  select jsonb_build_object('emissao', p_emissao, 'documento', p_doc, 'serie', '1', 'tipo_documento', 'NFe', 'cfop', '5101',
    'classe', 'venda', 'cliente_codigo', 'CP1', 'cliente_nome', 'Cliente Periodo', 'produto_codigo', 'PP1', 'produto_nome', 'Produto',
    'quantidade', 1, 'valor_nota', p_valor, 'desconto', 0, 'vendedor_codigo', 'V1', 'vendedor_nome', 'Vend');
$$;
-- Uma importação inteira (início, um lote, fim), como a tela faz.
create function tests.importar(p_itens jsonb, p_substituir boolean, p_de date default null, p_ate date default null)
returns uuid language plpgsql as $$
declare v_id uuid; v_comp jsonb;
begin
  select jsonb_agg(jsonb_build_object('competencia', c, 'linhas', n, 'total_venda', t)) into v_comp
    from (select date_trunc('month', (i->>'emissao')::date)::date::text c, count(*) n, sum((i->>'valor_nota')::numeric) t
            from jsonb_array_elements(p_itens) i group by 1) x;
  v_id := public.com_importar_vendas_inicio('MF', 'pgtap-periodo.xlsx', jsonb_array_length(p_itens), '{}'::jsonb, v_comp,
                                            jsonb_array_length(p_itens), p_substituir, null, p_de, p_ate);
  perform public.com_importar_vendas_lote(v_id, p_itens);
  perform public.com_importar_vendas_fim(v_id);
  return v_id;
end;
$$;
grant execute on all functions in schema tests to authenticated;

select tests.authenticate_as('dono@periodo.test');
-- Novembro inteiro, como a importação de sempre (sem período).
select tests.importar(jsonb_build_array(tests.item('2034-11-03', 'N1', 100), tests.item('2034-11-20', 'N2', 200)), false);

select throws_like($$ select tests.importar(jsonb_build_array(tests.item('2034-11-05', 'N3', 50)), false, '2034-11-02', '2034-11-08') $$,
  'De 01/11/2034 a 30/11/2034 a filial MF já foi importada%', 'a semana sobre o mes ja importado, sem substituir, e recusada');

select tests.importar(jsonb_build_array(tests.item('2034-11-05', 'N3', 50)), true, '2034-11-02', '2034-11-08');
select is((select string_agg(documento, ',' order by documento) from public.com_vendas_itens where cliente_codigo = 'CP1'), 'N2,N3',
  'substituir troca so os dias da semana: a nota do dia 03 sai, a do dia 20 fica');
select is((select sum(valor_nota) from public.com_vendas_itens where cliente_codigo = 'CP1'), 250::numeric, 'o resto do mes continua somando');
select is((select string_agg(to_char(de, 'DD') || '-' || to_char(ate, 'DD'), ',' order by de) from public.com_competencias_importadas('MF')
            where competencia = '2034-11-01'), '01-01,02-08,09-30', 'a reserva do mes vira dois trechos com a semana no meio');

select throws_like($$ select tests.importar(jsonb_build_array(tests.item('2034-12-20', 'N4', 10)), false, '2034-12-01', '2034-12-07') $$,
  'O arquivo tem notas fora do período%', 'nota fora do periodo confirmado nao publica');
select throws_like($$ select tests.importar(jsonb_build_array(tests.item('2034-12-05', 'N5', 10)), false, '2034-12-08', '2034-12-01') $$,
  'O período vai de%', 'data inicial depois da final e recusada');

select tests.importar(jsonb_build_array(tests.item('2035-01-10', 'A1', 10), tests.item('2035-02-10', 'A2', 20), tests.item('2035-03-10', 'A3', 30)),
  false, '2035-01-01', '2035-03-31');
select is((select count(*)::int from public.com_competencias_importadas('MF') where competencia between '2035-01-01' and '2035-03-01'), 3,
  'o ano (varios meses) entra numa importacao so');
select tests.clear_authentication();

select * from finish();
rollback;
