-- SALDO DE FÉRIAS SEM INVENTAR (dono, 2026-10-03): "saldo de férias 30 para todos induz a falsa
-- informação; se não tem os dados, deve aparecer ----".
--
-- A coluna nascia 30 para todo cadastro, e nenhuma tela do RH a preenche: todo saldo mostrado era o
-- padrão, não um dado. Passa a nascer vazia (nulo = o RH não informou). Medido antes: a produção não
-- tem nenhum cadastro em `rh_employee_profiles`, então não há saldo real a perder.
alter table public.rh_employee_profiles alter column vacation_balance_days drop default;
alter table public.rh_employee_profiles alter column vacation_balance_days drop not null;
update public.rh_employee_profiles set vacation_balance_days = null where vacation_balance_days = 30;
