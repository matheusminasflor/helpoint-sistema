-- A vendedora em uma, duas ou mais carteiras (migration 20261119060000_vendedora_em_varias_carteiras.sql)
--
-- Antes: UNIQUE (tenant, pessoa) — uma pessoa, uma carteira. Decisão do dono (2026-10-01): a mesma
-- vendedora em várias; no painel, uma linha por PESSOA com as carteiras listadas.
--
--   chefe  owner
--   ana    vendedora (Comercial Operador) em MG e ESPECIAL
begin;
\ir _helpers.psql

select plan(7);

create temporary table f on commit drop as
select tests.create_tenant('varias-carteiras', 'Varias Carteiras', false) as a;
create temporary table u on commit drop as
select tests.create_user('chefe@variascart.test', (select a from f)) as chefe,
       tests.create_user('ana@variascart.test',   (select a from f)) as ana;
select tests.grant_role((select chefe from u), 'owner');
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_profile((select ana from u), (select a from f), 'comercial', 'Operador');

insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, origem) values
  ((select a from f), '1', 'CLIENTE MG',       'MG',       'cadastro'),
  ((select a from f), '2', 'CLIENTE ESPECIAL', 'ESPECIAL', 'cadastro'),
  ((select a from f), '3', 'CLIENTE DE FORA',  null,       'cadastro');

grant select on f, u to authenticated;

-- ═══ 1 e 2. A mesma pessoa entra em duas carteiras; na mesma, duas vezes não. ═══
select tests.authenticate_as('chefe@variascart.test');
select lives_ok(
  $$insert into public.com_carteira_membros (tenant_id, user_id, carteira) values
      ((select a from f), (select ana from u), 'MG'),
      ((select a from f), (select ana from u), 'ESPECIAL') returning id$$,
  'a mesma vendedora em MG e em ESPECIAL — antes o banco recusava a segunda'
);
select throws_ok(
  $$insert into public.com_carteira_membros (tenant_id, user_id, carteira)
    values ((select a from f), (select ana from u), 'MG') returning id$$,
  '23505', null,
  'mas na mesma carteira, uma vez só'
);

-- ═══ 3. No painel, uma linha por pessoa, com as duas carteiras. ═══
select is(
  (select array_agg(carteira) from public.com_vendedoras_do_painel(date_trunc('month', current_date)::date)
    where vendedor_id = (select ana from u)),
  array['ESPECIAL, MG'],
  'a Ana aparece UMA vez no painel, com "ESPECIAL, MG"'
);

-- ═══ 4. O resumo conta os clientes das duas carteiras. ═══
select is(
  (select total_carteira from public.com_resumo_da_carteira(date_trunc('month', current_date)::date)
    where vendedor_id = (select ana from u)),
  2::bigint,
  'a base dela são os clientes de MG e de ESPECIAL juntos'
);
select tests.clear_authentication();

-- ═══ 5 a 7. Ela vê e lança para os clientes das duas carteiras; o de fora, não. ═══
select tests.authenticate_as('ana@variascart.test');
select is((select count(*)::int from public.com_clientes where codigo in ('1', '2')), 2,
  'ela vê os clientes das duas carteiras');
select lives_ok(
  $$insert into public.com_interacoes (tenant_id, vendedor_id, cliente_codigo, data, status)
    values ((select a from f), auth.uid(), '2', (now() at time zone 'America/Sao_Paulo')::date, 'em_andamento') returning id$$,
  'e lança para o cliente da segunda carteira'
);
select lives_ok(
  $$select public.com_atribuir_carteira_em_lote(array['3'], 'ESPECIAL')$$,
  'e traz um cliente do Histórico para a segunda carteira dela'
);
select tests.clear_authentication();

select * from finish();
rollback;
