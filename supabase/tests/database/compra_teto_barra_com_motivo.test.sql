-- O TETO DE GASTO BARRA, E LIBERA COM MOTIVO ESCRITO (migration 20261103040000)
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: barrar e liberar com motivo —
-- a mesma forma da regra dos três orçamentos.
--
-- POR QUE ISTO EXISTE. O teto que a L8 construiu só avisava, na tela, e nem ao
-- aviso se chegava: até a migration `20261103010000` a compra nascia sem setor,
-- então o teto lido era zero e "passou do teto" era sempre falso. O aviso era
-- inalcançável, e quem chamasse o PostgREST direto não veria nem ele.
--
-- AS PROPRIEDADES QUE ESTA SUÍTE PRENDE:
--
-- 1. **sem teto, nada muda** — setor sem limite definido, e empresa com o teto
--    desligado, aprovam sem motivo. Zero aqui é "não definido", não "não pode
--    gastar nada";
-- 2. **abaixo do teto, nada muda**;
-- 3. **estourando, sem motivo: recusa** — e com motivo, passa;
-- 4. **o motivo vale para UMA decisão.** Voltar para análise apaga. Sem isto a
--    regra vale uma vez e depois é de graça: a segunda aprovação passaria com o
--    texto da primeira. É a lição da auditoria da L8, aplicada de novo;
-- 5. **o gasto do mês é do MESMO setor** — compra aprovada de outro setor não
--    entra na conta, senão um setor gastador barraria o vizinho;
-- 6. **compra sem setor não é barrada** — não há teto a respeitar, e inventar um
--    setor para aplicar o teto seria pior.
--
-- Nota de fixture (regra 9 do pgTAP): dentro da transação `now()` é constante,
-- então todas as compras aqui são "deste mês" sem ambiguidade. E a conta do mês
-- usa `America/Sao_Paulo` nos dois lados — função e asserção —, senão o CI em
-- UTC quebraria sozinho no dia 1º.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-teto', 'Teto', false) as a;
create temporary table u on commit drop as
select tests.create_user('aprovador@teto.test', (select a from f)) as pa;
select tests.grant_module((select pa from u), (select a from f), 'financeiro');
select tests.grant_role((select pa from u), 'manager');
grant select on f, u to authenticated;

create temporary table cat on commit drop as
with ins as (
  insert into public.ti_categories (tenant_id, module, name, is_purchase)
  select a, 'financeiro', 'Compra', true from f returning id
) select id from ins;
grant select on cat to authenticated;

-- Monta uma compra pronta para aprovar, com três orçamentos (para a regra da L8
-- ficar fora do caminho) e o orçamento 1 no valor pedido.
create or replace function pg_temp.compra_pronta(p_nome text, p_setor text, p_valor numeric)
returns uuid language plpgsql as $$
declare v_ch uuid; v_req uuid;
begin
  insert into public.tickets (tenant_id, module, title, description, priority, status, requester_id, category_id)
  select a, 'financeiro', p_nome, 'x', 'medium', 'open', (select pa from u), (select id from cat) from f
  returning id into v_ch;
  insert into public.compras_solicitacoes
    (tenant_id, ticket_id, product_name, department, estimated_amount, status, created_by)
  select a, v_ch, p_nome, p_setor, p_valor, 'pending_approval', (select pa from u) from f
  returning id into v_req;
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'F1', p_valor, 1 from f;
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'F2', p_valor + 1, 2 from f;
  insert into public.compras_orcamentos (tenant_id, request_id, supplier, amount, position)
  select a, v_req, 'F3', p_valor + 2, 3 from f;
  return v_req;
end;
$$;

create or replace function pg_temp.aprovar(p_req uuid, p_motivo text default null)
returns void language plpgsql as $$
begin
  update public.compras_solicitacoes
     set status = 'approved',
         approved_quote_id = (select id from public.compras_orcamentos
                               where request_id = p_req and position = 1),
         approved_by = (select pa from u), approved_at = now(),
         over_budget_reason = p_motivo
   where id = p_req;
end;
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Empresa com o teto DESLIGADO: nada muda
-- ───────────────────────────────────────────────────────────────────────────
insert into public.fin_department_budgets (tenant_id, department, monthly_limit)
select a, 'ti', 1000.00 from f;

create temporary table c_desligado on commit drop as select pg_temp.compra_pronta('Desligado', 'ti', 5000.00) as req;
grant select on c_desligado to authenticated;
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_desligado)),
  'com o teto desligado na empresa, aprovar acima do limite passa — o limite nao vale'
);

-- Liga o teto por setor.
insert into public.fin_budget_settings (tenant_id, mode) select a, 'per_department' from f
on conflict (tenant_id) do update set mode = 'per_department';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Setor SEM teto definido
-- ───────────────────────────────────────────────────────────────────────────
create temporary table c_sem_teto on commit drop as select pg_temp.compra_pronta('Sem teto', 'marketing', 9000.00) as req;
grant select on c_sem_teto to authenticated;
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_sem_teto)),
  'setor sem teto definido nao tem teto: zero e "nao definido", nao "nao pode gastar"'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Abaixo do teto
-- ───────────────────────────────────────────────────────────────────────────
-- Atenção: a compra 1 (R$ 5.000, setor ti) já está `approved` deste mês e conta
-- no gasto. Para falar de "abaixo do teto" sem ela no caminho, ela volta para
-- análise — o que também é o que a asserção 6 usa depois.
update public.compras_solicitacoes set status = 'pending_approval' where id = (select req from c_desligado);

create temporary table c_cabe on commit drop as select pg_temp.compra_pronta('Cabe', 'ti', 400.00) as req;
grant select on c_cabe to authenticated;
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_cabe)),
  'compra que cabe no teto aprova sem motivo nenhum'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Estourando: recusa sem motivo, passa com motivo
-- ───────────────────────────────────────────────────────────────────────────
-- Teto 1.000, já aprovados 400 no setor `ti`; esta pede 700 → 1.100.
create temporary table c_estoura on commit drop as select pg_temp.compra_pronta('Estoura', 'ti', 700.00) as req;
grant select on c_estoura to authenticated;

select throws_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_estoura)),
  '23514',
  null,
  'passar do teto sem motivo escrito e recusado pelo BANCO, nao pela tela'
);
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid, 'maquina parada, producao travada') $$,
         (select req from c_estoura)),
  'com o motivo escrito, aprova'
);
select is(
  (select over_budget_reason from public.compras_solicitacoes where id = (select req from c_estoura)),
  'maquina parada, producao travada',
  'e o motivo fica guardado na compra'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. O motivo morre com a decisão que ele explica
-- ───────────────────────────────────────────────────────────────────────────
update public.compras_solicitacoes set status = 'pending_approval' where id = (select req from c_estoura);
select is(
  (select over_budget_reason from public.compras_solicitacoes where id = (select req from c_estoura)),
  null,
  'voltar para analise apaga o motivo — senao a segunda aprovacao passa com o texto da primeira'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. O gasto é do MESMO setor
-- ───────────────────────────────────────────────────────────────────────────
-- O setor `marketing` tem teto de 2.000 e já teve 9.000 aprovados na asserção 2
-- (quando não havia teto). Uma compra de 100 no `ti` não pode ser barrada por
-- causa disso — nem o contrário.
insert into public.fin_department_budgets (tenant_id, department, monthly_limit)
select a, 'marketing', 2000.00 from f;

create temporary table c_outro_setor on commit drop as select pg_temp.compra_pronta('Outro setor', 'rh', 100.00) as req;
grant select on c_outro_setor to authenticated;
insert into public.fin_department_budgets (tenant_id, department, monthly_limit)
select a, 'rh', 500.00 from f;
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_outro_setor)),
  'compra de R$ 100 no RH (teto 500) aprova, apesar de o Marketing ter 9.000 aprovados'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Compra sem setor
-- ───────────────────────────────────────────────────────────────────────────
create temporary table c_sem_setor on commit drop as select pg_temp.compra_pronta('Sem setor', null, 99999.00) as req;
grant select on c_sem_setor to authenticated;
select lives_ok(
  format($$ select pg_temp.aprovar(%L::uuid) $$, (select req from c_sem_setor)),
  'compra sem setor nao e barrada: nao ha teto a respeitar, e inventar setor seria pior'
);

select * from finish();
rollback;
