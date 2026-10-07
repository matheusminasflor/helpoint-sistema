-- O STATUS "AGENDADO" E O SEU AVISO (decisão do dono, 2026-10-07).
--
-- Arquivo próprio de propósito: o valor novo de um enum não pode ser USADO na mesma transação em
-- que foi criado (`alter type ... add value`). A regra que usa os dois vem em 20261214020000.
alter type public.ticket_status add value if not exists 'scheduled';
alter type public.notification_type add value if not exists 'ticket_scheduled';
