-- Os tipos de aviso das movimentações do chamado (decisão do dono, 2026-10-02).
--
-- Arquivo próprio porque `alter type ... add value` não pode ser usado na mesma transação que o
-- cria: a regra que usa estes valores está em `20261121020000_avisos_do_chamado.sql`.
-- Já existiam `ticket_created`, `ticket_assigned` e `ticket_reply`.
alter type public.notification_type add value if not exists 'ticket_transferred';
alter type public.notification_type add value if not exists 'ticket_updated';
alter type public.notification_type add value if not exists 'ticket_waiting';
alter type public.notification_type add value if not exists 'ticket_resolved';
alter type public.notification_type add value if not exists 'ticket_closed';
