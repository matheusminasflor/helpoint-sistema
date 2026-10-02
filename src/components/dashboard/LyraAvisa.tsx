// "Lyra avisa" — as movimentações dos chamados na tela inicial (decisão do dono, 2026-10-02).
//
// O dono pediu uma área de notificações na Home ("Chamado #1234 foi respondido.", "…aguarda seu
// retorno.") e que a Lyra informe as ações importantes, clicáveis. É a MESMA lista do sino
// (`useNotifications`), filtrada nos avisos de chamado não lidos: nada novo no banco, e ler aqui
// é ler lá. Quem recebe e quem pode ver, o banco já decidiu (`notify_ticket`, 20261121020000).
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useAssistantName } from '@/hooks/useAssistantName';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useMarkNotificationRead, useNotifications } from '@/hooks/useNotifications';

/** Os que pedem ação de quem lê vêm primeiro. */
const PEDE_ACAO = new Set(['ticket_waiting', 'ticket_assigned', 'ticket_reply']);

export function LyraAvisa() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const assistantName = useAssistantName();
  const { notifications = [] } = useNotifications();
  const marcarLido = useMarkNotificationRead();

  const avisos = notifications
    .filter((n) => n.reference_type === 'ticket' && !n.is_read && n.reference_id)
    .sort((a, b) => Number(PEDE_ACAO.has(b.type)) - Number(PEDE_ACAO.has(a.type)))
    .slice(0, 6);
  if (avisos.length === 0) return null;

  const abrir = (id: string, ticketId: string) => {
    marcarLido.mutate(id);
    navigate(tenantPath(`/helpdesk/${ticketId}`));
  };
  const lerTodos = () => avisos.forEach((a) => marcarLido.mutate(a.id));

  return (
    <section className="mx-4 mt-4 rounded-lg border border-primary/20 bg-primary/5 p-3" aria-label={`${assistantName} avisa`}>
      <div className="flex items-center gap-2 mb-2">
        <LyraAvatar size="sm" />
        <h3 className="text-[13px] font-semibold text-foreground flex-1">{assistantName} avisa</h3>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-[12px] text-muted-foreground" onClick={lerTodos}>
          <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" /> Marcar como lidos
        </Button>
      </div>
      <ul className="space-y-1">
        {avisos.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => abrir(a.id, a.reference_id)}
              className="w-full text-left rounded-md px-2 py-1.5 hover:bg-background/70 transition-colors">
              <span className={`text-[13px] ${PEDE_ACAO.has(a.type) ? 'font-semibold text-foreground' : 'text-foreground'}`}>
                {a.title}
              </span>
              <span className="block text-[11px] text-muted-foreground truncate">
                {a.message ? `${a.message} · ` : ''}{formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
