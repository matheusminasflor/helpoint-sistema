-- O setor da compra nunca era gravado — e o teto de gasto por setor nunca podia disparar
--
-- Leva I (Compras), 2026-09-26. Decisão do dono: o solicitante escolhe o setor
-- da compra, com o dele já sugerido.
--
-- ══ O QUE ACONTECIA ═════════════════════════════════════════════════════════
--
-- O formulário de compra gravava o setor lendo `user_metadata.department` do
-- usuário autenticado (`CreateTicketForm.tsx`). Esse campo **não é escrito por
-- nada neste sistema**: o convite grava `profiles.department`
-- (`invite-signup/index.ts`), a tela de perfil grava `profiles.department`
-- (`ProfileDialog.tsx`), e `user_metadata` recebe só `full_name`. Medido no
-- test-helpoint antes desta migration:
--
--   pessoas                                        5
--   com setor em profiles.department               5
--   com setor em user_metadata.department          0   ← o que a compra lia
--
-- Então toda compra nasceria com `department = null`. A cadeia inteira depois
-- disso é consequência, e nenhum degrau dela acusa nada:
--
--   department nulo
--     → a conta a pagar nasce com `cost_center` nulo (o trigger copia o setor)
--     → `useDepartmentMonthlySpend(null)` nem consulta (`enabled: !!department`)
--     → o teto lido para o setor é 0 (`?? 0` em PurchasePanel)
--     → `overBudget` = `limit > 0 && …` = **sempre falso**
--
-- O aviso de estouro de teto que a leva L8 construiu existe e é inalcançável.
-- Não há erro, não há tarja: há um limite que ninguém pode passar porque
-- ninguém pertence a setor nenhum.
--
-- ══ O SEGUNDO ANDAR: TRÊS LISTAS DE SETOR ═══════════════════════════════════
--
-- Consertar a leitura não bastava, porque "setor" não tinha uma lista só:
--
-- - o convite oferecia NOVE setores (com Produção e Expedição);
-- - a tela de teto de gasto percorria os SETE de `DEPARTMENT_LIST` (os módulos
--   com perfil de acesso) — Produção e Expedição jamais teriam teto, apesar de
--   o convite pôr gente lá;
-- - a tela de perfil deixava DIGITAR o setor. O banco guardou `ti` (3 pessoas)
--   e `TI` (2). Um teto gravado em `ti` não casaria com quem escreveu `TI`,
--   porque a comparação é de texto.
--
-- ══ A CORREÇÃO, DO LADO DO BANCO ════════════════════════════════════════════
--
-- 1. normaliza o que está gravado (minúsculas, sem espaço nas pontas);
-- 2. põe um CHECK: setor é nulo ou um dos nove. É a platform fazendo o
--    trabalho — sem o CHECK, a próxima tela que gravar setor à mão recria o
--    `TI` e nada acusa até alguém conferir um teto que não bate.
--
-- O front passa a ler a mesma lista de um lugar só (`src/lib/setores.ts`).
--
-- NÃO entra aqui: tornar `profiles.department` obrigatório. Pessoa sem setor
-- existe (o dono, um convite antigo), e um setor inventado para satisfazer uma
-- coluna é pior que nulo — foi o que a L8 registrou sobre centro de custo.

begin;

-- ── 1. O dado gravado ───────────────────────────────────────────────────────
-- `lower(trim(...))` resolve os dois casos que existem (`TI`, ` ti `). Setor
-- fora da lista NÃO é apagado: o CHECK abaixo nasceria reprovando, e apagar o
-- setor de alguém para uma constraint passar é perder dado para agradar o
-- banco. Se houver, a migration para aqui e diz qual — de propósito.
update public.profiles
   set department = lower(trim(department))
 where department is not null
   and department <> lower(trim(department));

update public.tenant_invites
   set department = lower(trim(department))
 where department is not null
   and department <> lower(trim(department));

update public.fin_department_budgets
   set department = lower(trim(department))
 where department <> lower(trim(department));

do $$
declare
  v_fora text;
begin
  select string_agg(distinct department, ', ')
    into v_fora
  from (
    select department from public.profiles where department is not null
    union all
    select department from public.tenant_invites where department is not null
    union all
    select department from public.fin_department_budgets
  ) t
  where department not in ('ti','marketing','comercial','rh','financeiro',
                           'producao','expedicao','educacional','qualidade');
  if v_fora is not null then
    raise exception
      'setor gravado fora da lista dos nove: %. Decida o que fazer com cada um antes de pôr o CHECK.',
      v_fora;
  end if;
end $$;

-- ── 2. A regra, onde ela não depende de ninguém lembrar ─────────────────────
alter table public.profiles
  drop constraint if exists profiles_department_conhecido;
alter table public.profiles
  add constraint profiles_department_conhecido
  check (department is null or department in (
    'ti','marketing','comercial','rh','financeiro',
    'producao','expedicao','educacional','qualidade'
  ));

alter table public.tenant_invites
  drop constraint if exists tenant_invites_department_conhecido;
alter table public.tenant_invites
  add constraint tenant_invites_department_conhecido
  check (department is null or department in (
    'ti','marketing','comercial','rh','financeiro',
    'producao','expedicao','educacional','qualidade'
  ));

-- O teto é por setor: um teto gravado para um setor que não existe é dinheiro
-- reservado para ninguém.
alter table public.fin_department_budgets
  drop constraint if exists fin_department_budgets_department_conhecido;
alter table public.fin_department_budgets
  add constraint fin_department_budgets_department_conhecido
  check (department in (
    'ti','marketing','comercial','rh','financeiro',
    'producao','expedicao','educacional','qualidade'
  ));

-- ── 3. O setor da compra ────────────────────────────────────────────────────
-- A compra guarda o setor escolhido pelo solicitante, e é dele que sai o centro
-- de custo da conta a pagar. Mesma lista, mesmo CHECK: sem isso a tela poderia
-- mandar qualquer texto pelo PostgREST e o teto voltaria a não casar.
--
-- Continua NULO permitido: as compras que já existirem sem setor não se
-- inventam, e o centro de custo nulo é a verdade sobre elas.
alter table public.fin_purchase_requests
  drop constraint if exists fin_purchase_requests_department_conhecido;
alter table public.fin_purchase_requests
  add constraint fin_purchase_requests_department_conhecido
  check (department is null or department in (
    'ti','marketing','comercial','rh','financeiro',
    'producao','expedicao','educacional','qualidade'
  ));

commit;
