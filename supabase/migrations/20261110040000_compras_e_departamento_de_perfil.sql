-- Compras entra na lista de departamentos de PERFIL DE ACESSO.
--
-- O CI #145 reprovou `catalogo_de_produto_tem_porta` com
-- `access_profiles_department_check`: eu havia movido a permissão do catálogo para o
-- departamento `compras` sem `compras` existir na lista de departamentos. Terceira
-- lista enumerada que eu não tinha achado nesta leva.
--
-- ── AS QUATRO LISTAS DO BANCO, e é isto que vale registrar ───────────────────
--
-- Elas se parecem e **não são a mesma coisa**. Procurar por uma e consertar todas é
-- o erro; é o que me pegou três vezes aqui.
--
--   A. SETOR DA PESSOA — 10 valores, com `compras`.
--      `profiles`, `tenant_invites`, `compras_solicitacoes`, `fin_department_budgets`.
--      Onde a pessoa trabalha, para onde o chamado dela vai, de qual teto ela gasta.
--      Feita na `20261110010000`.
--
--   B. DEPARTAMENTO DE PERFIL DE ACESSO — 7 valores, e é o que ESTE arquivo conserta.
--      `access_profiles`, `user_access_profiles`.
--      Quais módulos têm perfil de acesso com permissões finas. **É mais estreita que
--      a lista de setores de propósito:** quem trabalha na Produção tem setor e não
--      tem perfil de acesso, porque não há tela de Produção para permitir nada.
--
--   C. MÓDULO DE CHAMADO — `tickets` (7) e `automation_workflows` (8, com `crm`).
--      **NÃO recebe `compras`**, e é decisão do dono: *"a solicitação de compra JÁ é o
--      pedido"*, sem fila própria. O chamado que existe por baixo de uma compra
--      continua sendo do módulo `financeiro` — o que deixa uma pergunta em aberto no
--      `plano-geral.md`, porque é por isso que a caixa de entrada do Financeiro ainda
--      mostra as compras.
--
--   D. MÓDULO CONCEDIDO — `user_module_access`, 12 valores, com `compras`.
--      O que abre o menu. Nasceu na `20261110030000`, porque antes era texto livre.
--
-- Quem acrescentar módulo ao sistema decide, uma lista por vez, se ele entra em cada
-- uma — e o teste do front (`src/types/modulos.test.ts`) mais estes CHECKs são o que
-- avisa quando a resposta foi esquecida.

alter table public.access_profiles drop constraint if exists access_profiles_department_check;
alter table public.access_profiles add constraint access_profiles_department_check
  check (department = any (array[
    'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional'
  ]));

alter table public.user_access_profiles drop constraint if exists user_access_profiles_department_check;
alter table public.user_access_profiles add constraint user_access_profiles_department_check
  check (department = any (array[
    'ti', 'marketing', 'rh', 'qualidade', 'financeiro', 'compras', 'comercial', 'educacional'
  ]));

-- A prova de que as duas listas de perfil de acesso não divergiram entre si — elas
-- sempre tiveram os mesmos valores, e divergir seria criar um departamento em que se
-- cria perfil e não se atribui, ou o contrário.
do $$
declare v_a text; v_b text;
begin
  select pg_get_constraintdef(con.oid) into v_a from pg_constraint con
    where con.conname = 'access_profiles_department_check';
  select pg_get_constraintdef(con.oid) into v_b from pg_constraint con
    where con.conname = 'user_access_profiles_department_check';

  if replace(v_a, 'access_profiles', '') <> replace(v_b, 'user_access_profiles', '') then
    -- Comparação por texto é grosseira, e aqui basta: as duas são escritas lado a
    -- lado, neste arquivo, e o que se quer pegar é alguém mexer numa só depois.
    raise notice 'as duas listas de departamento de perfil divergiram: % vs %', v_a, v_b;
  end if;
end $$;
