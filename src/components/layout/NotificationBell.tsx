import { Bell, CheckCheck, AlertTriangle, Clock, FileText, Key, AtSign, MessageSquare, UserPlus, Users, Ticket, CheckCircle2, ShoppingCart, Star, Send, Zap, BadgeDollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead, NotificationType } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  sla_warning: <Clock className="h-4 w-4 text-amber-500" />,
  sla_violation: <AlertTriangle className="h-4 w-4 text-red-500" />,
  contract_expiring: <FileText className="h-4 w-4 text-blue-500" />,
  license_expiring: <Key className="h-4 w-4 text-blue-500" />,
  deadline_expired: <AlertTriangle className="h-4 w-4 text-red-500" />,
  reminder: <Bell className="h-4 w-4 text-primary" />,
  mention: <AtSign className="h-4 w-4 text-primary" />,
  ticket_reply: <MessageSquare className="h-4 w-4 text-emerald-500" />,
  ticket_assigned: <UserPlus className="h-4 w-4 text-primary" />,
  ticket_created: <Ticket className="h-4 w-4 text-blue-500" />,
  card_mention: <AtSign className="h-4 w-4 text-orange-500" />,
  card_member: <Users className="h-4 w-4 text-primary" />,
  request_decided: <CheckCircle2 className="h-4 w-4 text-primary" />,
  purchase_requested: <ShoppingCart className="h-4 w-4 text-primary" />,
  purchase_decided: <CheckCircle2 className="h-4 w-4 text-primary" />,
  sac_customer_reply: <MessageSquare className="h-4 w-4 text-emerald-500" />,
  // Só token semântico daqui em diante (helpoint/cor-fixa, L0b).
  sac_customer_rated: <Star className="h-4 w-4 text-primary" />,
  document_available: <FileText className="h-4 w-4 text-primary" />,
  bill_due: <Clock className="h-4 w-4 text-primary" />,
  post_published: <Send className="h-4 w-4 text-primary" />,
  post_failed: <AlertTriangle className="h-4 w-4 text-destructive" />,
  automation: <Zap className="h-4 w-4 text-primary" />,
  crm_new_lead: <UserPlus className="h-4 w-4 text-primary" />,
  order_paid: <BadgeDollarSign className="h-4 w-4 text-primary" />,
  order_accepted: <CheckCircle2 className="h-4 w-4 text-primary" />,
};

const TYPE_STATUS: Record<string, 'success' | 'warning' | 'error' | 'info'> = {
  sla_warning: 'warning',
  sla_violation: 'error',
  contract_expiring: 'info',
  license_expiring: 'warning',
  deadline_expired: 'error',
  reminder: 'info',
  mention: 'info',
  ticket_reply: 'success',
  ticket_assigned: 'info',
  ticket_created: 'info',
  card_mention: 'info',
  card_member: 'info',
  request_decided: 'success',
  purchase_requested: 'info',
  purchase_decided: 'success',
  sac_customer_reply: 'success',
  sac_customer_rated: 'success',
  document_available: 'info',
  bill_due: 'warning',
  post_published: 'success',
  post_failed: 'error',
  automation: 'info',
  crm_new_lead: 'info',
  order_paid: 'success',
  order_accepted: 'success',
};

const STATUS_ACCENT: Record<string, string> = {
  success: 'border-l-emerald-500',
  warning: 'border-l-amber-500',
  error: 'border-l-red-500',
  info: 'border-l-primary',
};

const TYPE_ROUTES: Record<string, string> = {
  ticket: '/ti/chamados',
  contract: '/ti/contratos',
  license: '/ti/licencas',
  card: '/kanban',
  calendar_event: '/agenda',
  // Decisão de RH sem chamado espelho, holerite e documento do cofre.
  rh_request: '/meu-rh',
  // Conta a pagar vencendo (check-alerts).
  fin_entry: '/financeiro/contas-a-pagar',
};

export function NotificationBell() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { notifications, unreadCount, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const handleNotificationClick = (notification: typeof notifications[number]) => {
    if (!notification.is_read) {
      markRead.mutate(notification.id);
    }
    if (notification.reference_type === 'ticket' && notification.reference_id) {
      navigate(tenantPath(`/helpdesk/${notification.reference_id}`));
      return;
    }
    if (notification.reference_type === 'sac_ticket' && notification.reference_id) {
      navigate(tenantPath(`/qualidade/sacs/${notification.reference_id}`));
      return;
    }
    if (notification.reference_type === 'crm_deal' && notification.reference_id) {
      navigate(tenantPath(`/comercial/negocios/${notification.reference_id}`));
      return;
    }
    const route = TYPE_ROUTES[notification.reference_type];
    if (route) navigate(tenantPath(route));
  };

  return (
    <Drawer direction="right">
      <DrawerTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notificações" className="relative h-9 w-9">
          <Bell className="h-4 w-4 text-muted-foreground" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center font-semibold leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="fixed inset-y-0 right-0 w-[380px] h-full rounded-none border-l border-border bg-card [&>div:first-child]:hidden">
        <DrawerHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between">
            <DrawerTitle className="text-base font-semibold text-foreground">Notificações</DrawerTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto py-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
              >
                <CheckCheck className="h-3 w-3 mr-1" />
                Marcar todas
              </Button>
            )}
          </div>
        </DrawerHeader>

        <ScrollArea className="flex-1 h-[calc(100vh-72px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <div className="text-center">
                <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin mx-auto mb-2" />
                <p className="text-xs">Carregando...</p>
              </div>
            </div>
          ) : notifications && notifications.length > 0 ? (
            <div>
              {notifications.map((notification) => {
                const status = TYPE_STATUS[notification.type] || 'info';
                return (
                  <button
                    key={notification.id}
                    onClick={() => handleNotificationClick(notification)}
                    className={cn(
                      "w-full text-left px-5 py-3.5 border-b border-border hover:bg-surface-2 transition-colors flex gap-3 border-l-2",
                      STATUS_ACCENT[status],
                      !notification.is_read && "bg-primary/5"
                    )}
                  >
                    <div className="flex-shrink-0 mt-0.5 p-1.5 rounded-lg bg-surface-2">
                      {TYPE_ICONS[notification.type]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm text-foreground truncate",
                        !notification.is_read && "font-semibold"
                      )}>
                        {notification.title}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5 leading-relaxed">
                        {notification.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-1.5 font-medium">
                        {formatDistanceToNow(new Date(notification.created_at), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    {!notification.is_read && (
                      <div className="flex-shrink-0 mt-1.5">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <Bell className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">Nenhuma notificação</p>
              <p className="text-xs mt-1">Você está em dia!</p>
            </div>
          )}
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}