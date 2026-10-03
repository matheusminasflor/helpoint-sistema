-- Tipo do aviso "Fulano entra de férias: repasse as demandas dele" (20261127020000). Em arquivo
-- próprio: valor novo de enum não pode ser usado na mesma transação que o cria.
alter type public.notification_type add value if not exists 'ferias_repassar';
