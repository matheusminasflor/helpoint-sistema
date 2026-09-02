-- Adicionar novos tipos ao enum notification_type
-- Chamados
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ticket_reply';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'ticket_assigned';

-- Kanban (preparacao futura)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'card_mention';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'card_member';