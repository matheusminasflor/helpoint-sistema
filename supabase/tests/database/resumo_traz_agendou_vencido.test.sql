-- O resumo do Início leva a marca de quem agendou com o prazo vencido (migration 20270212330000).
begin;

select plan(2);

select ok(pg_get_function_result('public.chamados_do_meu_resumo()'::regprocedure) like '%agendou_vencido boolean%',
          'o resumo devolve agendou_vencido');
select ok(not has_function_privilege('anon', 'public.chamados_do_meu_resumo()', 'execute'), 'anon continua sem acesso');

select * from finish();
rollback;
