-- Os avisos do módulo Projetos (docs/plano-projetos.md). Arquivo só com os valores novos: o Postgres não
-- deixa usar um valor de enum na mesma transação que o criou.
alter type public.notification_type add value if not exists 'projeto_setor_chamado';
alter type public.notification_type add value if not exists 'projeto_atividade';
alter type public.notification_type add value if not exists 'projeto_prazo';
alter type public.notification_type add value if not exists 'projeto_dependencia';
