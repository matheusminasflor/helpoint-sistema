// O resumo da Lyra no topo da fila de chamados. Quem gere a fila vê o SETOR; quem atende vê o que
// está com ele (decisão do dono, 2026-10-04 — a regra mora em `@/lib/resumo-da-fila`).
import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, AlertTriangle, Clock, User, Lightbulb, UserX } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import type { TicketWithDetails } from '@/types/helpdesk';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { resumoDaFila, contagem } from '@/lib/resumo-da-fila';

interface AISecretarySummaryProps {
  tickets: TicketWithDetails[];
  userName?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  currentUserId?: string;
  /** Pode distribuir a fila (transferir chamado para outra pessoa no perfil do setor). */
  gestor?: boolean;
  /** "Marketing", "TI"… — para a fala do gestor. */
  setorNome?: string;
  onSelectTicket?: (ticket: TicketWithDetails) => void;
}

const Num = ({ children, tom = 'text-primary' }: { children: React.ReactNode; tom?: string }) => (
  <span className={`font-semibold font-mono ${tom}`}>{children}</span>
);

export function AISecretarySummary({
  tickets,
  userName = 'Técnico',
  isLoading,
  onRefresh,
  currentUserId,
  gestor = false,
  setorNome = 'setor',
  onSelectTicket,
}: AISecretarySummaryProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const r = useMemo(() => resumoDaFila(tickets, currentUserId, gestor), [tickets, currentUserId, gestor]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  const firstName = userName?.split(' ')[0] || 'Técnico';

  const fala = gestor ? (
    r.pendentes === 0 ? (
      <span className="text-muted-foreground">O setor de {setorNome} não tem chamados pendentes.</span>
    ) : (
      <>
        O setor de {setorNome} tem <Num>{contagem(r.pendentes, 'chamado pendente', 'chamados pendentes')}</Num>
        {r.criticos > 0 && <>, sendo <Num tom="text-destructive">{contagem(r.criticos, 'crítico', 'críticos')}</Num></>}.
        {r.vencidos > 0 && <> <Num tom="text-destructive">{r.vencidos}</Num> com o prazo vencido.</>}
        {r.semResponsavel > 0 && <> <Num tom="text-status-warning">{r.semResponsavel}</Num> sem responsável.</>}
        {' '}Por favor, verifique.
        {r.meus > 0 && <> Destes, <Num>{r.meus}</Num> {r.meus === 1 ? 'está' : 'estão'} com você.</>}
      </>
    )
  ) : r.meus > 0 ? (
    <>
      Você tem <Num>{contagem(r.meus, 'chamado', 'chamados')}</Num> sob sua responsabilidade
      {r.meusCriticos > 0 && <>, sendo <Num tom="text-destructive">{contagem(r.meusCriticos, 'crítico', 'críticos')}</Num></>}.
      {r.meusVencidos > 0 && <> <Num tom="text-destructive">{r.meusVencidos}</Num> com o prazo vencido.</>}
    </>
  ) : (
    <span className="text-muted-foreground">Nenhum chamado com você agora.</span>
  );

  return (
    <div className="flex items-start gap-4 mx-4 mt-4 p-4 rounded-lg border border-border bg-surface-1">
      <LyraAvatar size="lg" animated={isLoading} className="flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-semibold text-foreground-bright">{greeting}, {firstName}!</span>
          {' '}{fala}
        </p>

        {r.comecePor && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <Lightbulb className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
            {gestor ? 'O mais urgente é o' : 'Comece pelo'}{' '}
            <button
              type="button"
              className="font-mono text-primary hover:underline"
              onClick={() => r.comecePor && onSelectTicket?.(r.comecePor)}
            >
              #{r.comecePor.ticket_number}
            </button>
            {' '}({r.comecePor.title.length > 40 ? `${r.comecePor.title.slice(0, 40)}…` : r.comecePor.title})
            {r.comecePorVencido && <span className="text-destructive font-medium">· prazo vencido</span>}
            {gestor && r.comecePor.assignee?.full_name && <span>· com {r.comecePor.assignee.full_name.split(' ')[0]}</span>}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          {gestor && (
            <Badge variant="outline" className="text-[12px] gap-1 font-mono border-border/50 text-muted-foreground">
              <Clock className="w-3 h-3" aria-hidden="true" />
              {r.pendentes} no setor
            </Badge>
          )}
          {(gestor ? r.vencidos : r.meusVencidos) > 0 && (
            <Badge className="text-[12px] gap-1 font-mono bg-destructive/10 text-destructive border-0 hover:bg-destructive/15">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {gestor ? r.vencidos : r.meusVencidos} prazo vencido
            </Badge>
          )}
          {gestor && r.semResponsavel > 0 && (
            <Badge variant="outline" className="text-[12px] gap-1 font-mono border-border/50 text-muted-foreground">
              <UserX className="w-3 h-3" aria-hidden="true" />
              {r.semResponsavel} sem responsável
            </Badge>
          )}
          <Badge variant="outline" className="text-[12px] gap-1 font-mono text-primary border-primary/20">
            <User className="w-3 h-3" aria-hidden="true" />
            {r.meus} meus
          </Badge>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Button variant="ghost" size="icon" aria-label="Atualizar resumo" onClick={onRefresh} disabled={isLoading} className="h-9 w-9 text-muted-foreground hover:text-foreground hover:bg-surface-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </Button>
        <Button onClick={() => navigate(tenantPath('/nova-solicitacao'))} size="sm" className="gap-1.5 h-8">
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
          Nova
        </Button>
      </div>
    </div>
  );
}
