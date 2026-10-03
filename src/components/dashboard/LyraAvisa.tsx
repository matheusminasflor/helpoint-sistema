// "Lyra avisa" — os avisos da pessoa na tela inicial (decisão do dono, 2026-10-02).
//
// Nasceu para as movimentações dos chamados ("Chamado #1234 foi respondido.", "…aguarda seu
// retorno."). No mesmo dia o dono tirou o sino do topo ("ninguém usaria — com o e-mail e o menu
// Home ficou bem melhor") e escolheu que este bloco mostrasse TODOS os avisos: SLA, conta a pagar,
// compra para aprovar, SAC, holerite, menção no chat, meta. Cada um abre a tela certa
// (`destinoDoAviso`). Quem recebe e quem pode ver, o banco já decidiu.
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle, ArrowRightLeft, AtSign, BadgeDollarSign, Bell, CheckCheck, CheckCircle2, Clock,
  FileText, Hourglass, Key, Lock, MessageSquare, Pencil, Plane, Send, ShoppingCart, Star, Target, Ticket,
  UserPlus, Users, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useAssistantName } from '@/hooks/useAssistantName';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarDiretoria } from '@/lib/acesso-diretoria';
import { destinoDoAviso } from '@/lib/destino-do-aviso';
import {
  useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications, type NotificationType,
} from '@/hooks/useNotifications';

const ICONE: Record<NotificationType, ReactNode> = {
  sla_warning: <Clock className="h-4 w-4 text-status-warning" />,
  sla_violation: <AlertTriangle className="h-4 w-4 text-status-danger" />,
  contract_expiring: <FileText className="h-4 w-4 text-status-info" />,
  license_expiring: <Key className="h-4 w-4 text-status-info" />,
  deadline_expired: <AlertTriangle className="h-4 w-4 text-status-danger" />,
  reminder: <Bell className="h-4 w-4 text-primary" />,
  mention: <AtSign className="h-4 w-4 text-primary" />,
  ticket_reply: <MessageSquare className="h-4 w-4 text-status-success" />,
  ticket_assigned: <UserPlus className="h-4 w-4 text-primary" />,
  ticket_created: <Ticket className="h-4 w-4 text-status-info" />,
  ticket_transferred: <ArrowRightLeft className="h-4 w-4 text-primary" />,
  ticket_updated: <Pencil className="h-4 w-4 text-muted-foreground" />,
  ticket_waiting: <Hourglass className="h-4 w-4 text-status-warning" />,
  ticket_resolved: <CheckCircle2 className="h-4 w-4 text-status-success" />,
  ticket_closed: <Lock className="h-4 w-4 text-muted-foreground" />,
  card_mention: <AtSign className="h-4 w-4 text-status-warning" />,
  card_member: <Users className="h-4 w-4 text-primary" />,
  request_decided: <CheckCircle2 className="h-4 w-4 text-primary" />,
  purchase_requested: <ShoppingCart className="h-4 w-4 text-primary" />,
  purchase_decided: <CheckCircle2 className="h-4 w-4 text-primary" />,
  sac_customer_reply: <MessageSquare className="h-4 w-4 text-status-success" />,
  sac_customer_rated: <Star className="h-4 w-4 text-primary" />,
  document_available: <FileText className="h-4 w-4 text-primary" />,
  bill_due: <Clock className="h-4 w-4 text-primary" />,
  post_published: <Send className="h-4 w-4 text-primary" />,
  post_failed: <AlertTriangle className="h-4 w-4 text-destructive" />,
  automation: <Zap className="h-4 w-4 text-primary" />,
  crm_new_lead: <UserPlus className="h-4 w-4 text-primary" />,
  order_paid: <BadgeDollarSign className="h-4 w-4 text-primary" />,
  order_accepted: <CheckCircle2 className="h-4 w-4 text-primary" />,
  meta_definida: <Target className="h-4 w-4 text-primary" />,
  ferias_repassar: <Plane className="h-4 w-4 text-status-warning" />,
};

/** Os que pedem ação de quem lê vêm primeiro (e em negrito). */
const PEDE_ACAO = new Set<NotificationType>([
  'ticket_waiting', 'ticket_assigned', 'ticket_transferred', 'ticket_reply', 'mention',
  'sla_violation', 'sla_warning', 'deadline_expired', 'purchase_requested', 'bill_due', 'sac_customer_reply',
  'ferias_repassar',
]);

const MOSTRA = 8;

export function LyraAvisa() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const assistantName = useAssistantName();
  const { notifications = [] } = useNotifications();
  const marcarLido = useMarkNotificationRead();
  const marcarTodos = useMarkAllNotificationsRead();
  const { showDiretoria, isManagerOrHigher } = useVisibleModules();
  const entraNaDiretoria = podeAcessarDiretoria(showDiretoria, isManagerOrHigher);

  const naoLidos = notifications
    .filter((n) => !n.is_read)
    .sort((a, b) => Number(PEDE_ACAO.has(b.type)) - Number(PEDE_ACAO.has(a.type)));
  if (naoLidos.length === 0) return null;
  const avisos = naoLidos.slice(0, MOSTRA);

  // Ler é ler, mesmo o aviso que não abre tela nenhuma: ele sai do bloco.
  const abrir = (aviso: typeof avisos[number]) => {
    marcarLido.mutate(aviso.id);
    const destino = destinoDoAviso(aviso, entraNaDiretoria);
    if (destino) navigate(tenantPath(destino));
  };

  return (
    <section className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3" aria-label={`${assistantName} avisa`}>
      <div className="flex items-center gap-2 mb-2">
        <LyraAvatar size="sm" />
        <h3 className="text-[13px] font-semibold text-foreground flex-1">
          {assistantName} avisa <span className="font-normal text-muted-foreground">· {naoLidos.length} não lido{naoLidos.length === 1 ? '' : 's'}</span>
        </h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px] text-muted-foreground"
          disabled={marcarTodos.isPending} onClick={() => marcarTodos.mutate()}>
          <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" /> Marcar todos como lidos
        </Button>
      </div>
      <ul className="space-y-1">
        {avisos.map((a) => {
          const navega = destinoDoAviso(a, entraNaDiretoria) !== null;
          return (
            <li key={a.id}>
              <button type="button" onClick={() => abrir(a)}
                aria-label={navega ? undefined : `${a.title} — este aviso não abre nenhuma tela`}
                className={`w-full text-left rounded-md px-2 py-1.5 hover:bg-background/70 transition-colors flex gap-2 ${navega ? 'cursor-pointer' : 'cursor-default'}`}>
                <span className="mt-0.5 shrink-0">{ICONE[a.type] ?? <Bell className="h-4 w-4 text-primary" />}</span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13px] text-foreground ${PEDE_ACAO.has(a.type) ? 'font-semibold' : ''}`}>
                    {a.title}
                  </span>
                  <span className="block text-[11px] text-muted-foreground truncate">
                    {a.message ? `${a.message} · ` : ''}{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {naoLidos.length > MOSTRA && (
        <p className="px-2 pt-1 text-[11px] text-muted-foreground">
          E mais {naoLidos.length - MOSTRA}. Abra ou marque estes como lidos para ver os próximos.
        </p>
      )}
    </section>
  );
}
