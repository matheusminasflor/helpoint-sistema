-- O aviso "distribuidor pediu cadastro" (Portal do Distribuidor, etapa 6). Em arquivo próprio: valor novo de enum
-- não pode ser usado na mesma transação em que nasce (o CI reprovou assim na 4b, 20270201000000).
alter type public.notification_type add value if not exists 'distribuidor';
