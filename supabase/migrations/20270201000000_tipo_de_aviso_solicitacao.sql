-- O tipo de aviso das solicitações (20270201010000). Num arquivo próprio: valor novo de enum não pode ser usado na
-- mesma transação que o cria, e a função `solicitacao_avisa` (linguagem sql) o lê ao ser criada.
alter type public.notification_type add value if not exists 'solicitacao';
