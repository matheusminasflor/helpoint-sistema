-- Os contadores de POP passam a contar todo mundo.
--
-- O DEFEITO. `usePOPs.ts` chamava a RPC `increment_pop_views`, que **nunca existiu
-- no banco** (conferido em `pg_proc` em 2026-09-27). A chamada falhava sempre e caía
-- num `UPDATE pops` direto — e a única policy de UPDATE de `pops` é
-- `Supervisors can update POPs`. Para `member` e `viewer`, que são a maioria de quem
-- LÊ um POP, o UPDATE afetava **zero linhas sem erro**: o PostgREST responde 200
-- quando a policy não casa.
--
-- Resultado: `views_count` e `solved_count` só subiam quando um supervisor lia.
-- "Visualizações", "Problemas resolvidos", "Artigos populares", `resolutionRate` e
-- `topPOPs` subcontavam — todos plausíveis, nenhum certo. É a mesma família de
-- defeito silencioso da regra 2 das cinco.
--
-- ONDE A REGRA MORA: aqui. Contar leitura é do sistema, não de quem tem cargo, e
-- por isso as duas funções são `security definer` — elas escrevem o que o usuário
-- não pode escrever a dedo, e é exatamente para isso que `security definer` serve.
--
-- ponytail: SIMPLIFICAÇÃO DELIBERADA, com o teto nomeado. A função exige que o POP
-- seja da empresa de quem chama, e **não** reavalia a regra de visibilidade do POP
-- (que tem quatro ramos: `all`, `viewers_only`, `departments`, mais supervisor).
-- Então alguém da própria empresa poderia inflar o contador de um POP que não
-- enxerga. O teto é esse, e o que se perde é a precisão de uma MÉTRICA — nenhum dado
-- vaza, porque a função devolve `void` e não lê nada de volta. A saída, se um dia
-- importar: extrair a condição da policy `Users can view visible POPs` para uma
-- função `pop_visivel(uuid)` e chamá-la aqui e lá. Duplicar os quatro ramos agora
-- seria criar duas verdades sobre visibilidade para proteger um número de leitura.

create or replace function public.increment_pop_views(pop_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.pops
     set views_count = coalesce(views_count, 0) + 1
   where id = pop_id
     and tenant_id = public.get_user_tenant_id();
$$;

comment on function public.increment_pop_views(uuid) is
  'Conta uma leitura do POP. security definer porque contar leitura e do sistema: a policy de UPDATE de pops e so de supervisor, e sem isto o contador so subia quando um supervisor lia. Restrito a empresa de quem chama.';

create or replace function public.increment_pop_solved(pop_id uuid)
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.pops
     set solved_count = coalesce(solved_count, 0) + 1
   where id = pop_id
     and tenant_id = public.get_user_tenant_id();
$$;

comment on function public.increment_pop_solved(uuid) is
  'Conta um "resolveu meu problema" no POP. Mesma razao de increment_pop_views.';

-- Regra 14 do pgTAP: `create or replace` preserva a ACL, mas estas duas NASCEM
-- agora — então herdam o padrão do schema, que inclui `execute` para PUBLIC, e
-- `anon` é público. Fechar é obrigatório: função `security definer` alcançável por
-- `anon` é porta aberta. Ver `anon_so_nas_portas_publicas.test.sql`, que compara a
-- lista de funções alcançáveis por `anon` com a escrita lá.
revoke all on function public.increment_pop_views(uuid) from public, anon;
revoke all on function public.increment_pop_solved(uuid) from public, anon;
grant execute on function public.increment_pop_views(uuid) to authenticated;
grant execute on function public.increment_pop_solved(uuid) to authenticated;
