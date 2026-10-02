-- As caixinhas que estavam vazias nos perfis (decisão do dono, 2026-10-02).
--
-- A partir de hoje toda tela com seção no perfil obedece a ela (menu, endereço e, setor por setor,
-- o banco). Medido antes de ligar: no Financeiro NENHUM perfil — nem o Gestor — tinha Contas a
-- pagar, Contas a receber e Fluxo de caixa; no Comercial, "Base de vendas › Ver o painel" estava
-- desmarcado no Gestor e vazio nos outros. Ligar a regra sem preencher tiraria as telas do Yuri
-- (Financeiro) e do Insights de Marcus, Jacqueline, Júlia e Fenicio. O dono escolheu:
--   * Financeiro: Gestor tudo; Operador ver, lançar, editar e baixar (sem excluir, sem aprovar
--     pagamento, sem importar/exportar); Somente leitura só ver;
--   * Comercial › Insights: Gestor, Operador e Somente leitura veem.
-- ponytail: só os perfis que existem (ADR-010, uma empresa só) — a semente de empresa nova não
-- ganha estas chaves; se um dia houver outra, o administrador marca no perfil.

update public.access_profiles set permissions = permissions
  || jsonb_build_object(
       'payables', '{"view":true,"create":true,"edit":true,"delete":true,"import":true,"settle":true,"approve_payment":true,"export":true}'::jsonb,
       'receivables', '{"view":true,"create":true,"edit":true,"delete":true,"import":true,"settle":true,"export":true}'::jsonb,
       'cashflow', '{"view":true,"export":true}'::jsonb)
 where department = 'financeiro' and name = 'Gestor';

update public.access_profiles set permissions = permissions
  || jsonb_build_object(
       'payables', '{"view":true,"create":true,"edit":true,"delete":false,"import":false,"settle":true,"approve_payment":false,"export":false}'::jsonb,
       'receivables', '{"view":true,"create":true,"edit":true,"delete":false,"import":false,"settle":true,"export":false}'::jsonb,
       'cashflow', '{"view":true,"export":false}'::jsonb)
 where department = 'financeiro' and name = 'Operador';

update public.access_profiles set permissions = permissions
  || jsonb_build_object(
       'payables', '{"view":true}'::jsonb,
       'receivables', '{"view":true}'::jsonb,
       'cashflow', '{"view":true}'::jsonb)
 where department = 'financeiro' and name = 'Somente leitura';

-- Comercial › Insights: "Ver o painel" para os três; importar/substituir seguem como estão.
update public.access_profiles
   set permissions = jsonb_set(permissions, '{vendas}',
         coalesce(permissions->'vendas', '{}'::jsonb) || '{"view":true}'::jsonb)
 where department = 'comercial' and name in ('Gestor', 'Operador', 'Somente leitura');
