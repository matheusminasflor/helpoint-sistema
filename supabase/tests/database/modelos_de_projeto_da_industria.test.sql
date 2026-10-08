-- OS 12 MODELOS DE PROJETO DA INDÚSTRIA (migration 20261217010000; dono, 2026-10-08).
--   1    a empresa sem o modelo antigo ganha os 11 novos (o Grau 1 nasce do "Lançamento de produto");
--   2    o "Lançamento de produto" antigo vira "— Grau 1 (notificação)" e ganha as 3 atividades novas;
--   3    rodar de novo não duplica nada (modelos nem atividades);
--   4-5  o Grau 2 tem as 7 fases e as 25 atividades, e os setores derivados das atividades;
--   6    todo modelo semeado é modelo (e_modelo), nunca projeto comum;
--   7-9  as funções de semente não são chamáveis por anon nem por quem está logado.
begin;
\ir _helpers.psql

select plan(9);

create temporary table f on commit drop as
select tests.create_tenant('pgtap-modelos-ind', 'Modelos da industria') as tenant;

-- O modelo antigo, como o 20261215030000 deixou: 6 fases e uma atividade na fase 1.
create temporary table velho on commit drop as
with p as (
  insert into public.projects (tenant_id, name, status, e_modelo)
  values ((select tenant from f), 'Lançamento de produto', 'planned', true) returning id
) select id from p;
insert into public.project_fases (tenant_id, project_id, nome, ordem)
select (select tenant from f), (select id from velho), 'Fase ' || n, n from generate_series(1, 6) n;
insert into public.tasks (tenant_id, project_id, fase_id, title, setor, status, position, priority)
select (select tenant from f), (select id from velho), id, 'Briefing', 'marketing', 'pending', 1, 3
  from public.project_fases where project_id = (select id from velho) and ordem = 1;

select public.semear_modelos_da_industria((select tenant from f));

select is((select count(*)::int from public.projects where tenant_id = (select tenant from f) and e_modelo), 12,
  'a empresa fica com 12 modelos: os 11 novos e o Grau 1');
select is((select count(*)::int from public.tasks where project_id = (select id from velho)), 4,
  'o modelo antigo vira Grau 1 e ganha Anvisa, Forteplus e lote piloto (1 + 3 atividades)');

select public.semear_modelos_da_industria((select tenant from f));
select is((select count(*)::int from public.tasks t join public.projects p on p.id = t.project_id
            where p.tenant_id = (select tenant from f) and p.e_modelo),
          -- Grau 1 (4) + Grau 2 (25) + extensão (12) + reformulação (12) + embalagem (8) + fornecedor (7)
          -- + norma (8) + descontinuação (8) + evento (9) + campanha (8) + treinamento (8) + lote (11)
          (select 4 + 25 + 12 + 12 + 8 + 7 + 8 + 8 + 9 + 8 + 8 + 11),
  'rodar de novo nao duplica modelos nem atividades');

select is((select count(*)::int || '|' || (select count(*) from public.tasks t where t.project_id = p.id)
             from public.project_fases pf join public.projects p on p.id = pf.project_id
            where p.tenant_id = (select tenant from f) and p.name = 'Lançamento de produto — Grau 2 (registro)'
            group by p.id),
  '7|25', 'o Grau 2 tem 7 fases e 25 atividades');
select is((select array_agg(s.setor order by s.setor) from public.project_setores s join public.projects p on p.id = s.project_id
            where p.tenant_id = (select tenant from f) and p.name = 'Lançamento de produto — Grau 2 (registro)'),
  array['comercial', 'compras', 'educacional', 'marketing', 'producao', 'qualidade'],
  'os setores do Grau 2 sao os das atividades');
select is((select count(*)::int from public.projects where tenant_id = (select tenant from f) and not e_modelo), 0,
  'nenhum modelo vira projeto comum');

select ok(not has_function_privilege('anon', 'public.semear_modelos_da_industria(uuid)', 'execute'), 'anon nao semeia');
select ok(not has_function_privilege('authenticated', 'public.semear_modelos_da_industria(uuid)', 'execute'), 'quem esta logado nao semeia');
select ok(not has_function_privilege('authenticated', 'public.semear_modelo_de_projeto(uuid, text, text, jsonb)', 'execute'),
  'a semente de um modelo tambem nao e chamavel');

select * from finish();
rollback;
