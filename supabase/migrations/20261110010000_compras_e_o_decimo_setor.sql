-- "Compras" entra na lista de setores — passa de nove para dez.
--
-- DECISÃO DO DONO em 2026-09-27, ao separar Compras do Financeiro: *"sim, Compras é
-- um setor"*. É coerente com virar módulo, e tem duas consequências concretas: quem
-- trabalha em Compras passa a ter esse setor no cadastro, e o setor ganha **teto de
-- gasto próprio** como os outros nove.
--
-- A LISTA É UMA SÓ, e por isso este arquivo mexe em quatro lugares de uma vez. Ela
-- vive em `src/lib/setores.ts` (a fonte que a tela usa) e é reafirmada por quatro
-- CHECKs no banco — `profiles`, `tenant_invites`, `fin_department_budgets` e
-- `fin_purchase_requests`. A leva I (migration `20261103010000`) criou esses CHECKs
-- justamente porque **havia três listas de setor concorrendo** no repositório.
-- Acrescentar um setor em um lugar só recriaria o problema que ela resolveu.
--
-- Por que CHECK e não tabela de domínio: a lista muda uma vez por ano e o CHECK
-- reprova na hora da escrita, com o nome do valor errado na mensagem. Tabela com FK
-- daria a mesma garantia e mais uma tabela para manter — o degrau da plataforma
-- resolve (`ponytail`).

do $$
declare
  v_tabela text;
  v_constraint text;
  v_permite_nulo boolean;
begin
  for v_tabela, v_constraint, v_permite_nulo in
    select * from (values
      ('profiles',                'profiles_department_conhecido',                true),
      ('tenant_invites',          'tenant_invites_department_conhecido',          true),
      ('fin_purchase_requests',   'fin_purchase_requests_department_conhecido',   true),
      -- O teto de gasto não aceita setor nulo: teto sem setor não limita nada.
      ('fin_department_budgets',  'fin_department_budgets_department_conhecido',   false)
    ) as t(tabela, nome, nulo)
  loop
    execute format('alter table public.%I drop constraint if exists %I', v_tabela, v_constraint);
    execute format(
      'alter table public.%I add constraint %I check (%s department = any (array[''ti'',''marketing'',''comercial'',''rh'',''financeiro'',''producao'',''expedicao'',''educacional'',''qualidade'',''compras'']))',
      v_tabela, v_constraint,
      case when v_permite_nulo then 'department is null or' else '' end
    );
  end loop;
end $$;

-- A guarda que a leva I deixou: se existir no banco um setor fora da lista, esta
-- migration precisa falhar ALTO em vez de o CHECK ser criado e o dado velho ficar
-- inalcançável. Aqui ela roda depois, porque acrescentar valor nunca invalida dado —
-- mas fica, porque a próxima mudança nesta lista pode ser uma REMOÇÃO.
do $$
declare v_fora text;
begin
  select string_agg(distinct department, ', ') into v_fora
    from (
      select department from public.profiles where department is not null
      union all select department from public.tenant_invites where department is not null
      union all select department from public.fin_purchase_requests where department is not null
      union all select department from public.fin_department_budgets
    ) t
   where department <> all (array['ti','marketing','comercial','rh','financeiro','producao','expedicao','educacional','qualidade','compras']);

  if v_fora is not null then
    raise exception 'setor fora da lista dos dez: % — conserte o dado antes de mexer na lista', v_fora;
  end if;
end $$;
