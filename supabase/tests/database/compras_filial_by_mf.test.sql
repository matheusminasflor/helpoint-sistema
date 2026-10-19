-- COMPRAS: A FILIAL BY.MF (migration 20270128080000; dono, 2026-10-19). A compra e a conta a pagar aceitam BY.MF.
begin;

select plan(2);

select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'compras_solicitacoes_filial_check')) like '%BY.MF%',
  'a compra aceita a filial BY.MF');
select ok(pg_get_constraintdef((select oid from pg_constraint where conname = 'fin_entries_filial_check')) like '%BY.MF%',
  'a conta a pagar aceita a filial BY.MF');

select * from finish();
rollback;
