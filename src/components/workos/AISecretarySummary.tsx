import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Plus, AlertTriangle, Clock, User, Lightbulb, Timer } from 'lucide-react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { getSLATimeRemaining } from '@/types/helpdesk';
import type { TicketWithDetails } from '@/types/helpdesk';
import { LyraAvatar } from '@/components/ai/LyraAvatar';

interface AISecretarySummaryProps {
  tickets: TicketWithDetails[];
  userName?: string;
  isLoading?: boolean;
  onRefresh?: () => void;
  currentUserId?: string;
}

export function AISecretarySummary({ 
  tickets, 
  userName = 'Técnico', 
  isLoading,
  onRefresh,
  currentUserId
}: AISecretarySummaryProps) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  
  const stats = useMemo(() => {
    const critical = tickets.filter(t => t.priority === 'critical');
    const slaAtRisk = tickets.filter(t => {
      const sla = getSLATimeRemaining(t.sla_due_at, t);
      return !sla.isFrozen && (sla.isOverdue || sla.percentage >= 80);
    });
    const mine = currentUserId 
      ? tickets.filter(t => t.assigned_to === currentUserId) 
      : [];
    const unassigned = tickets.filter(t => !t.assigned_to);
    
    return {
      total: tickets.length,
      critical: critical.length,
      slaAtRisk: slaAtRisk.length,
      mine: mine.length,
      unassigned: unassigned.length,
      highestPriority: critical[0] || tickets.find(t => t.priority === 'high') || tickets[0],
    };
  }, [tickets, currentUserId]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Bom dia';
    if (hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }, []);

  const firstName = userName?.split(' ')[0] || 'Técnico';

  return (
    <div className="flex items-start gap-4 mx-4 mt-4 p-4 rounded-lg border border-border bg-surface-1">
      <LyraAvatar size="lg" animated={isLoading} className="flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <span className="font-semibold text-foreground-bright">{greeting}, {firstName}!</span>
          {' '}
          {stats.total > 0 ? (
            <>
              Você tem <span className="font-semibold text-primary font-mono">{stats.total} chamados</span> pendentes
              {stats.critical > 0 && (
                <>, sendo <span className="font-semibold text-destructive font-mono">{stats.critical} críticos</span></>
              )}.
            </>
          ) : (
            <span className="text-muted-foreground">Não há chamados pendentes. Ótimo trabalho!</span>
          )}
        </p>
        
        {stats.highestPriority && (
          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5 flex-wrap">
            <Lightbulb className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
            Recomendo iniciar pelo{' '}
            <button className="font-mono text-primary hover:underline">
              #{stats.highestPriority.ticket_number}
            </button>
            {' '}({stats.highestPriority.title.slice(0, 40)}...)
          </p>
        )}
        
        <div className="flex flex-wrap items-center gap-2 mt-2.5">
          <Badge variant="outline" className="text-[11px] gap-1 font-mono border-border/50 text-muted-foreground">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {stats.total} Total
          </Badge>
          
          {stats.critical > 0 && (
            <Badge className="text-[11px] gap-1 font-mono bg-destructive/10 text-destructive border-0 hover:bg-destructive/15">
              <AlertTriangle className="w-3 h-3" aria-hidden="true" />
              {stats.critical} Críticos
            </Badge>
          )}
          
          {stats.slaAtRisk > 0 && (
            <Badge className="text-[11px] gap-1 font-mono bg-status-warning/20 text-foreground border-0 hover:bg-status-warning/30">
              <Timer className="w-3 h-3" aria-hidden="true" />
              {stats.slaAtRisk} SLA em Risco
            </Badge>
          )}
          
          {stats.unassigned > 0 && (
            <Badge variant="outline" className="text-[11px] gap-1 font-mono border-border/50 text-muted-foreground">
              {stats.unassigned} Não Atribuídos
            </Badge>
          )}
          
          <Badge variant="outline" className="text-[11px] gap-1 font-mono text-primary border-primary/20">
            <User className="w-3 h-3" aria-hidden="true" />
            {stats.mine} Meus
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