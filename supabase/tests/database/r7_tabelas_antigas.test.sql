-- R7: as tabelas sem tela saíram, a cópia ficou num esquema que a API não alcança, e nenhuma função
-- ficou apontando para elas (migration 20270210010000).
begin;
select plan(4);

select ok(
  to_regclass('public.mkt_assets') is null and to_regclass('public.mkt_events') is null
  and to_regclass('public.mkt_quotations') is null and to_regclass('public.mkt_ai_generations') is null
  and to_regclass('public.ti_access_profiles') is null and to_regclass('public.ti_user_profiles') is null
  and to_regclass('public.qualidade_access_profiles') is null and to_regclass('public.qualidade_user_profiles') is null,
  'as oito tabelas antigas saíram do public'
);

select ok(
  to_regclass('arquivo.r7_mkt_assets') is not null and to_regclass('arquivo.r7_qualidade_user_profiles') is not null,
  'a cópia ficou no esquema arquivo'
);

select ok(
  not has_schema_privilege('anon', 'arquivo', 'usage') and not has_schema_privilege('authenticated', 'arquivo', 'usage'),
  'ninguém de fora enxerga o esquema arquivo'
);

select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosrc ~ '\m(mkt_assets|mkt_events|mkt_quotations|mkt_ai_generations|ti_access_profiles|ti_user_profiles|qualidade_access_profiles|qualidade_user_profiles)\M'),
  0,
  'nenhuma função ficou lendo ou escrevendo as tabelas que saíram'
);

select * from finish();
rollback;
