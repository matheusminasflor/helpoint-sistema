-- Tipo do aviso "lead sem resposta" (parte 4.4 do projeto Kommo). Sozinho no arquivo: valor novo de enum não pode ser
-- usado na mesma transação em que nasce (20270212700100 usa).
alter type public.notification_type add value if not exists 'lead_sem_resposta';
