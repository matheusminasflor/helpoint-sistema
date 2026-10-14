-- O tipo de aviso "Atualização do sistema" (dono, 2026-10-14). Sozinho na migration: valor novo de enum não pode
-- ser usado na mesma transação em que nasce (o uso vem em 20270111020000).
alter type public.notification_type add value if not exists 'system_update';
