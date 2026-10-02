-- Lançamento salvo não muda (migration 20261120010000_lancamento_salvo_nao_muda.sql).
--
-- O dono (2026-10-02): "lançou, não pode editar os indicadores e farol mais, precisa lançar de novo
-- caso tenha que entrar em contato novamente" — cada contato conta. Pelo caminho da tela:
-- `com_salvar_interacao`, que é o que o formulário chama.
--
--   ana    vendedora, carteira NORTE
--   chefe  administrador — corrige
begin;
\ir _helpers.psql

select plan(17);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-lanc-trava', 'Lancamento Trava', false) as a;
create temporary table u on commit drop as
select tests.create_user('ana@lanctrava.test',   (select a from f)) as ana,
       tests.create_user('chefe@lanctrava.test', (select a from f)) as chefe,
       tests.create_user('gil@lanctrava.test',   (select a from f)) as gil;
select tests.grant_module((select ana from u), (select a from f), 'comercial');
select tests.grant_module((select chefe from u), (select a from f), 'comercial');
select tests.grant_role((select chefe from u), 'admin');
-- Gil: perfil Gestor do Comercial, que nesta empresa nasce SEM as caixinhas de lançamento.
select tests.grant_module((select gil from u), (select a from f), 'comercial');
select tests.grant_profile((select gil from u), (select a from f), 'comercial', 'Gestor');
-- Com "Carteiras: gerir" (lê os lançamentos da equipe) — para provar que ELA não basta mais para corrigir.
update public.access_profiles
   set permissions = jsonb_set(coalesce(permissions, '{}'::jsonb), '{carteiras}', '{"gerir": true}'::jsonb) - 'lancamentos'
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

insert into public.com_carteira_membros (tenant_id, user_id, carteira)
values ((select a from f), (select ana from u), 'NORTE');
insert into public.com_clientes (tenant_id, codigo, razao_social, carteira, ativo, origem) values
  ((select a from f), 'N1', 'CLIENTE N1', 'NORTE', true, 'cadastro'),
  ((select a from f), 'N2', 'CLIENTE N2', 'NORTE', true, 'cadastro');

create temporary table l (nome text, id uuid) on commit drop;
create temporary table cnt (n int) on commit drop;
create temporary table ind on commit drop as
select (select id from public.com_indicadores where tenant_id = (select a from f) and nome = 'Contato para venda') as contato,
       (select id from public.com_indicadores where tenant_id = (select a from f) and nome = 'Venda ativa') as venda;
grant select on f, u, ind to authenticated;
grant select, insert, update, delete on l, cnt to authenticated;

select tests.authenticate_as('ana@lanctrava.test');

-- ═══ 1. Lançar com indicador: entra, com a marca (as marcas nascem com o lançamento). ═══
insert into l select 'manha', public.com_salvar_interacao(null,
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"em_andamento"}'::jsonb, array[(select contato from ind)]);
select is((select count(*)::int from public.com_interacao_marcas where interacao_id = (select id from l where nome = 'manha')), 1,
  'o lancamento nasce com o indicador marcado');

-- ═══ 2-4. Depois de salvo, indicadores, cliente e data não mudam. ═══
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"em_andamento"}'::jsonb,
  array[(select contato from ind), (select venda from ind)]) $$,
  '42501', null, 'marcar mais um indicador num lancamento salvo e recusado');
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"em_andamento"}'::jsonb, array[]::uuid[]) $$,
  '42501', null, 'desmarcar o indicador de um lancamento salvo e recusado');
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N2","data":"2026-08-11","status":"em_andamento"}'::jsonb, array[(select contato from ind)]) $$,
  '42501', null, 'trocar cliente ou data de um lancamento salvo e recusado');

-- Direto na tabela, sem a função, também não.
select throws_ok($$ insert into public.com_interacao_marcas (interacao_id, indicador_id, tenant_id)
  values ((select id from l where nome = 'manha'), (select venda from ind), (select a from f)) $$,
  '42501', null, 'marcar direto na tabela tambem e recusado');

-- ═══ 5. Reenviar sem mudar nada passa (a tela reenvia as marcas que já estão lá). ═══
select lives_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"em_andamento","observacoes":"retornar"}'::jsonb,
  array[(select contato from ind)]) $$,
  'salvar de novo com as mesmas marcas passa, e a observacao ainda muda');

-- ═══ 6. A negociação anda: em andamento vira concluído, com valor. ═══
select lives_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"concluido","valor_venda":"2000","observacoes":"retornar"}'::jsonb,
  array[(select contato from ind)]) $$,
  'concluir a tentativa com o valor da venda e permitido');

-- ═══ 7. Concluído, trava tudo. ═══
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"concluido","valor_venda":"3000","observacoes":"retornar"}'::jsonb,
  array[(select contato from ind)]) $$,
  '42501', null, 'lancamento concluido nao muda nem o valor');

-- ═══ 8. Novo contato é lançamento novo — e conta. ═══
insert into l select 'tarde', public.com_salvar_interacao(null,
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"em_andamento"}'::jsonb, array[(select contato from ind)]);
select is((select count(*)::int from public.com_interacoes where cliente_codigo = 'N1' and data = '2026-08-10'), 2,
  'dois contatos no mesmo dia com o mesmo cliente sao dois lancamentos');

-- ═══ 9. Apagar sai da vendedora (lição 12: zero linhas, sem erro). ═══
with x as (delete from public.com_interacoes where id = (select id from l where nome = 'tarde') returning 1)
insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'a vendedora nao apaga lancamento');
select tests.clear_authentication();

-- ═══ 10-12. O administrador corrige o erro de verdade, e fica registrado. ═══
select tests.authenticate_as('chefe@lanctrava.test');
select lives_ok($$ select public.com_salvar_interacao((select id from l where nome = 'tarde'),
  '{"cliente_codigo":"N2","data":"2026-08-10","status":"em_andamento"}'::jsonb, array[(select venda from ind)]) $$,
  'o administrador troca cliente e indicador de um lancamento da vendedora');
select is((select cliente_codigo || '|' || (select count(*) from public.com_interacao_marcas m
                                              where m.interacao_id = i.id and m.indicador_id = (select venda from ind))
             from public.com_interacoes i where i.id = (select id from l where nome = 'tarde')),
  'N2|1', 'a correcao gravou');
select tests.clear_authentication();
select ok((select count(*) > 0 from public.audit_logs
            where record_id = (select id from l where nome = 'tarde') and user_id = (select chefe from u)),
  'a correcao do administrador fica em audit_logs');

-- ═══ 14-17. Quem corrige e quem apaga é a caixinha do perfil (migration 20261120020000). ═══
select tests.authenticate_as('gil@lanctrava.test');
select throws_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"concluido","valor_venda":"2000","observacoes":"corrigido"}'::jsonb,
  array[(select contato from ind)]) $$,
  '42501', null, 'Gestor sem "Corrigir lancamento" no perfil nao corrige');
select tests.clear_authentication();

-- O dono marca só "Corrigir" no perfil Gestor desta empresa.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{lancamentos}', '{"corrigir": true}'::jsonb)
 where tenant_id = (select a from f) and department = 'comercial' and name = 'Gestor';

select tests.authenticate_as('gil@lanctrava.test');
select lives_ok($$ select public.com_salvar_interacao((select id from l where nome = 'manha'),
  '{"cliente_codigo":"N1","data":"2026-08-10","status":"concluido","valor_venda":"2000","observacoes":"corrigido"}'::jsonb,
  array[(select contato from ind)]) $$,
  'com "Corrigir lancamento" marcado, corrige ate o concluido');
delete from cnt;
with x as (delete from public.com_interacoes where id = (select id from l where nome = 'tarde') returning 1)
insert into cnt select count(*) from x;
select is((select n from cnt), 0, 'mas sem "Apagar lancamento" nao apaga');
select tests.clear_authentication();

select is((select observacoes from public.com_interacoes where id = (select id from l where nome = 'manha')), 'corrigido',
  'a correcao do Gestor gravou');

select * from finish();
rollback;
