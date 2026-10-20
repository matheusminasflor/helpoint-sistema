-- MARKETING › BENEFÍCIO DE SEXTA (migration 20270129070000; dono, 2026-10-20). res é o responsável, lib o liberador,
-- col leva os produtos, zeca não tem nada com o benefício.
--   1  retirada na sexta vence segunda ao meio-dia (Brasília)
--   2  segunda feriado: vence terça ao meio-dia
--   3  quem não é o responsável não registra a retirada
--   4  da mesma linha, 4 produtos são recusados
--   5  de linhas diferentes, 3 produtos são recusados
--   6  da mesma linha, 3 produtos saem
--   7  com uma retirada aberta, não sai outra
--   8  devolvida fora do prazo sem motivo é recusada
--   9  fora do prazo e com uso acima do ideal: marcada como má-fé
--  10  com 2 atrasos em 6 meses, a próxima retirada espera liberação
--  11  ... e o liberador recebe o aviso
--  12  quem não libera não decide
--  13  o liberador aprova, e a retirada sai com prazo
--  14  o colaborador vê as próprias retiradas; quem não tem nada com o benefício, nenhuma
--  15  as funções não abrem para anon
begin;
\ir _helpers.psql

select plan(15);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-beneficio', 'Beneficio', false) as a;
create temporary table u on commit drop as
select tests.create_user('res@benef.test',  (select a from f)) as res,
       tests.create_user('lib@benef.test',  (select a from f)) as lib,
       tests.create_user('col@benef.test',  (select a from f)) as col,
       tests.create_user('zeca@benef.test', (select a from f)) as zeca;
insert into public.mkt_beneficio_config (tenant_id, responsavel_id, liberador_id)
select a, (select res from u), (select lib from u) from f;
create temporary table fam on commit drop as
with x as (insert into public.com_familias (tenant_id, nome) select a, n from f, (values ('Oxygen'), ('Serene')) v(n) returning id, nome)
select * from x;
create temporary table prod on commit drop as
with x as (
  insert into public.mkt_beneficio_produtos (tenant_id, nome, familia_id, quantidade)
  select a, n, (select id from fam where nome = l), 5 from f,
         (values ('Shampoo Oxygen', 'Oxygen'), ('Mascara Oxygen', 'Oxygen'), ('Shampoo Serene', 'Serene')) v(n, l)
  returning id, nome
) select * from x;
create temporary table ret (n int, id uuid) on commit drop;
create temporary table visto (n int) on commit drop;
grant select on f, u, prod to authenticated;
grant select, insert on ret, visto to authenticated;

select is(public.beneficio_prazo((select a from f), '2026-10-23 18:00+00'), '2026-10-26 15:00+00'::timestamptz,
  'retirada na sexta vence segunda ao meio-dia (Brasilia)');
select is(public.beneficio_prazo((select a from f), '2026-10-30 18:00+00'), '2026-11-03 15:00+00'::timestamptz,
  'segunda feriado (Finados): vence terca ao meio-dia');

select tests.authenticate_as('zeca@benef.test');
select throws_ok(format($$ select public.beneficio_retirar(%L, '[{"produto_id":"%s","quantidade":1}]'::jsonb) $$,
  (select col from u), (select id from prod where nome = 'Shampoo Oxygen')), '42501', null,
  'quem nao e o responsavel nao registra a retirada');
select tests.clear_authentication();

select tests.authenticate_as('res@benef.test');
select throws_ok(format($$ select public.beneficio_retirar(%L, '[{"produto_id":"%s","quantidade":2},{"produto_id":"%s","quantidade":2}]'::jsonb) $$,
  (select col from u), (select id from prod where nome = 'Shampoo Oxygen'), (select id from prod where nome = 'Mascara Oxygen')),
  '23514', null, 'da mesma linha, 4 produtos sao recusados');
select throws_ok(format($$ select public.beneficio_retirar(%L, '[{"produto_id":"%s","quantidade":2},{"produto_id":"%s","quantidade":1}]'::jsonb) $$,
  (select col from u), (select id from prod where nome = 'Shampoo Oxygen'), (select id from prod where nome = 'Shampoo Serene')),
  '23514', null, 'de linhas diferentes, 3 produtos sao recusados');
insert into ret select 1, public.beneficio_retirar((select col from u),
  jsonb_build_array(jsonb_build_object('produto_id', (select id from prod where nome = 'Shampoo Oxygen'), 'quantidade', 2),
                    jsonb_build_object('produto_id', (select id from prod where nome = 'Mascara Oxygen'), 'quantidade', 1)));
select is((select status from public.mkt_beneficio_retiradas where id = (select id from ret where n = 1)), 'retirada',
  'da mesma linha, 3 produtos saem');
select throws_ok(format($$ select public.beneficio_retirar(%L, '[{"produto_id":"%s","quantidade":1}]'::jsonb) $$,
  (select col from u), (select id from prod where nome = 'Shampoo Serene')), '23514', null, 'com uma retirada aberta, nao sai outra');
select tests.clear_authentication();

-- Fora do prazo (o relógio do teste não espera o fim de semana).
update public.mkt_beneficio_retiradas set prazo = now() - interval '1 hour' where id = (select id from ret where n = 1);
select tests.authenticate_as('res@benef.test');
select throws_ok(format($$ select public.beneficio_devolver(%L, 'uso_acima') $$, (select id from ret where n = 1)),
  '23514', null, 'devolvida fora do prazo sem motivo e recusada');
select public.beneficio_devolver((select id from ret where n = 1), 'uso_acima', 'Esqueceu em casa', 'Frascos pela metade');
select tests.clear_authentication();
select ok((select atraso and ma_fe from public.mkt_beneficio_retiradas where id = (select id from ret where n = 1)),
  'fora do prazo e com uso acima do ideal: marcada como ma-fe');

-- Um segundo atraso, já devolvido (histórico).
insert into public.mkt_beneficio_retiradas (tenant_id, colaborador_id, status, retirado_em, prazo, devolvido_em, atraso)
select a, (select col from u), 'devolvida', now() - interval '20 days', now() - interval '17 days', now() - interval '15 days', true from f;
select tests.authenticate_as('res@benef.test');
insert into ret select 2, public.beneficio_retirar((select col from u),
  jsonb_build_array(jsonb_build_object('produto_id', (select id from prod where nome = 'Shampoo Serene'), 'quantidade', 1)));
select tests.clear_authentication();
select is((select status from public.mkt_beneficio_retiradas where id = (select id from ret where n = 2)), 'aguardando_liberacao',
  'com 2 atrasos em 6 meses, a proxima retirada espera liberacao');
select is((select count(*)::int from public.notifications where user_id = (select lib from u) and type = 'beneficio_liberar'), 1,
  '... e o liberador recebe o aviso');

select tests.authenticate_as('res@benef.test');
select throws_ok(format($$ select public.beneficio_liberar(%L, true) $$, (select id from ret where n = 2)),
  '42501', null, 'quem nao libera nao decide');
select tests.clear_authentication();
select tests.authenticate_as('lib@benef.test');
select public.beneficio_liberar((select id from ret where n = 2), true, 'Conversado com o colaborador');
select tests.clear_authentication();
select ok((select status = 'retirada' and prazo is not null from public.mkt_beneficio_retiradas where id = (select id from ret where n = 2)),
  'o liberador aprova, e a retirada sai com prazo');

select tests.authenticate_as('col@benef.test');
insert into visto select count(*)::int from public.mkt_beneficio_retiradas;
select tests.clear_authentication();
select tests.authenticate_as('zeca@benef.test');
insert into visto select count(*)::int from public.mkt_beneficio_retiradas;
select tests.clear_authentication();
select is((select array_agg(n order by n desc) from visto), array[3, 0],
  'o colaborador ve as proprias retiradas; quem nao tem nada com o beneficio, nenhuma');

select ok(not has_function_privilege('anon', 'public.beneficio_retirar(uuid, jsonb)', 'execute')
          and not has_function_privilege('anon', 'public.beneficio_devolver(uuid, text, text, text)', 'execute')
          and not has_function_privilege('anon', 'public.beneficio_liberar(uuid, boolean, text)', 'execute')
          and not has_function_privilege('anon', 'public.beneficio_prazo(uuid, timestamptz)', 'execute'),
  'as funcoes nao abrem para anon');

select * from finish();
rollback;
