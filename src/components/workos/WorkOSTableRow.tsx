import { useState } from 'react';
import { dataHora, haQuantoTempo } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { StatusCell } from './StatusCell';
import { PriorityCell } from './PriorityCell';
import { categoriaDoChamado, getSLATimeRemaining } from '@/types/helpdesk';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { AlertTriangle, HardDrive, UserPlus, ShoppingCart } from 'lucide-react';
import { TicketContextMenu } from '@/components/helpdesk/TicketContextMenu';
import { useTicketActions } from '@/hooks/useTicketActions';
import { usePodeNoChamado } from '@/hooks/useAccessProfiles';
import { concessaoDoModulo, useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';
import { useAuth } from '@/contexts/AuthContext';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { feitoComDesfazer } from '@/lib/desfazer';
import type { TicketWithDetails } from '@/types/helpdesk';

/** A faixa da prioridade na borda esquerda da linha (as cores dos antigos grupos da fila). */
const FAIXA_DA_PRIORIDADE: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-emerald-500',
};

/** A altura da linha da fila, em px (a tabela usa a mesma no esqueleto de carregamento). */
// Altura MÍNIMA (dono, 2026-10-14: "está cortando meus chamados"): com a letra maior (9e487f5b) o título e a
// categoria não cabiam nos 44 px fixos. A linha cresce se o texto pedir.
export const ALTURA_DA_LINHA = 56;

interface WorkOSTableRowProps {
  ticket: TicketWithDetails;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate?: () => void;
  gridCols?: string;
  simplified?: boolean;
  /** Abaixo de 768px a linha vira cartão empilhado */
  asCard?: boolean;
}

export function WorkOSTableRow({ 
  ticket, 
  isSelected, 
  onSelect,
  onUpdate,
  gridCols = 'grid-cols-[60px_1fr_100px_80px_100px_90px]',
  simplified = false,
  asCard = false,
}: WorkOSTableRowProps) {
  const sla = getSLATimeRemaining(ticket.sla_due_at, ticket);
  const { assignToMe, atribuirA } = useTicketActions();
  // Quem a tela já mostra enquanto o banco espera os 8 s do "Desfazer" (regra 1, 2026-10-24).
  const [otimista, setOtimista] = useState<string | null>(null);
  const assignee = otimista ? { full_name: otimista } : ticket.assignee;
  // O Gestor (quem pode transferir) escolhe a pessoa do setor; os outros só pegam para si (dono, 2026-10-19).
  const { user } = useAuth();
  const { pode } = usePodeNoChamado(ticket.module);
  const escolhePessoa = !simplified && !ticket.assigned_to && pode('transfer');
  const [menuAberto, setMenuAberto] = useState(false);
  const { data: membros = [] } = useMembrosDoSetor(menuAberto ? concessaoDoModulo(ticket.module ?? 'tickets') : undefined);

  const handleAssign = (e: { stopPropagation(): void }, pessoa?: { id: string; nome: string }) => {
    e.stopPropagation();
    const outro = !!pessoa && pessoa.id !== user?.id;
    setOtimista(outro ? pessoa!.nome : (user?.user_metadata?.full_name || 'Você'));
    feitoComDesfazer({
      chave: `chamado:${ticket.id}`,
      mensagem: `Chamado #${ticket.ticket_number} atribuído a ${outro ? pessoa!.nome : 'você'}`,
      gravar: () => (outro ? atribuirA(ticket.id, pessoa!.id, pessoa!.nome) : assignToMe(ticket.id)),
      aoDesfazer: () => setOtimista(null),
      depois: (err) => {
        // Gravou: o nome fica até a lista recarregar (é o mesmo). Falhou: volta ao que o banco diz.
        if (err) {
          toast.error(err instanceof Error ? err.message : 'Não foi possível atribuir o chamado');
          setOtimista(null);
        }
        onUpdate?.();
      },
    });
  };

  const faixa = !simplified && cn('border-l-[3px]', FAIXA_DA_PRIORIDADE[ticket.priority] ?? 'border-l-transparent');
  const slaLabel = sla.hasSLA ? sla.label : 'Sem prazo definido';
  /** Só destaca em vermelho quando o relógio ainda está correndo. */
  const slaAlert = sla.isOverdue && !sla.isFrozen;

  const CardContent = (
    <div
      onClick={onSelect}
      className={cn(
        'flex flex-col gap-2 px-4 py-3 cursor-pointer bg-card border-b border-border transition-colors',
        faixa,
        isSelected && 'workos-row-selected',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-xs text-primary font-bold">#{ticket.ticket_number}</span>
        <StatusCell status={ticket.status} module={ticket.module} size="sm" />
      </div>
      <p className="text-sm font-medium text-foreground">{ticket.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className={cn(
          'flex items-center gap-1 font-mono text-[12px] text-muted-foreground',
          slaAlert && 'text-monday-red font-bold',
        )}>
          {slaAlert && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
          <span>{slaLabel}</span>
        </div>
        {!simplified && <PriorityCell priority={ticket.priority} size="sm" />}
      </div>
    </div>
  );

  const isPurchase = (ticket.category || '').toLowerCase().includes('compra');

  const RowContent = (
    <div 
      onClick={onSelect}
      style={{ minHeight: ALTURA_DA_LINHA }}
      className={cn(
        "workos-row px-4 py-2 transition-colors",
        gridCols,
        faixa,
        isSelected && "workos-row-selected"
      )}
    >
      {/* ID */}
      <span className="font-mono text-xs text-primary font-bold">
        #{ticket.ticket_number}
      </span>
      
      {/* Title + Category/Requester */}
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium truncate text-foreground">
          {isPurchase && (
            <span
              className="badge-warning mr-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[12px] font-bold align-middle"
              title="Solicitação de compra"
            >
              <ShoppingCart className="w-3 h-3" aria-hidden="true" />
              Compra
            </span>
          )}
          {/* Chamado que eu atendo junto, de qualquer setor (dono, 2026-10-19). */}
          {ticket.atendo_junto && (
            <span className="badge-purple mr-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[12px] font-bold align-middle"
              title="Você aceitou atender este chamado junto">
              Atendo junto{(() => { const s = setorDoModulo(ticket.module ?? 'tickets'); return s ? ` · ${DEPARTMENT_SCHEMAS[s].label}` : ''; })()}
            </span>
          )}
          {ticket.title}
        </p>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground mt-0.5">
          {simplified ? (
            <span className="truncate">{categoriaDoChamado(ticket)}</span>
          ) : (
            <>
              <span className="truncate">{ticket.requester?.full_name || 'Usuário'}</span>
              {ticket.requester?.department && (
                <>
                  <span className="text-border">•</span>
                  <span className="truncate">{ticket.requester.department}</span>
                </>
              )}
              {/* Idade e última resposta (etapa 4 · Chamados, 2026-10-24). */}
              <span className="text-border">•</span>
              <span className="shrink-0 tabular-nums" title={`Aberto em ${dataHora(ticket.created_at)}`}>aberto há {haQuantoTempo(ticket.created_at)}</span>
              {ticket.ultima?.quando && (
                <>
                  <span className="text-border">•</span>
                  <span className="shrink-0 tabular-nums" title={`Última resposta em ${dataHora(ticket.ultima.quando)}`}>resposta há {haQuantoTempo(ticket.ultima.quando)}</span>
                </>
              )}
              {ticket.asset && (
                <>
                  <span className="text-border">•</span>
                  <span className="flex items-center gap-1 font-mono text-primary/60">
                    <HardDrive className="w-3 h-3" />
                    {ticket.asset.asset_tag}
                  </span>
                </>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Status */}
      <StatusCell status={ticket.status} module={ticket.module} size="sm" />
      
      {/* Meus chamados (etapa 4 · Chamados, 2026-10-24): quem pediu vê quem atende e o prazo, só para ler. */}
      {simplified && (
        <>
          <span className="text-center text-xs truncate">{assignee?.full_name?.split(' ')[0] ?? <span className="text-muted-foreground">na fila</span>}</span>
          <span className={cn('text-center text-[12px] tabular-nums truncate', slaAlert ? 'text-status-danger font-semibold' : 'text-muted-foreground')}>
            {sla.hasSLA ? sla.label : 'sem prazo'}
          </span>
        </>
      )}

      {/* Technician columns */}
      {!simplified && (
        <>
          <PriorityCell priority={ticket.priority} size="sm" />
          
          {/* Assignee */}
          <div className="text-center">
            {assignee ? (
              <div className="flex items-center justify-center gap-1.5">
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center text-[12px] font-bold text-primary">
                  {assignee.full_name?.charAt(0)}
                </div>
                <span className="text-xs text-foreground truncate">
                  {assignee.full_name?.split(' ')[0]}
                </span>
              </div>
            ) : escolhePessoa ? (
              <DropdownMenu open={menuAberto} onOpenChange={setMenuAberto}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs font-medium text-primary hover:bg-muted disabled:opacity-60"
                  >
                    <UserPlus className="w-3 h-3" aria-hidden="true" />
                    Atribuir
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem onSelect={(e) => handleAssign(e)}>Para mim</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Pessoas do setor</DropdownMenuLabel>
                  {membros.filter((m) => m.id !== user?.id).map((m) => (
                    <DropdownMenuItem key={m.id} onSelect={(e) => handleAssign(e, { id: m.id, nome: m.full_name || m.email })}>
                      {m.full_name || m.email}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <button
                type="button"
                onClick={handleAssign}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border bg-card text-xs font-medium text-primary hover:bg-muted disabled:opacity-60"
              >
                <UserPlus className="w-3 h-3" aria-hidden="true" />
                Atribuir
              </button>
            )}
          </div>
          
          {/* SLA — sinal sempre explícito, nunca só pela cor */}
          <div className={cn(
            "flex items-center justify-center gap-1 font-mono text-[12px] text-muted-foreground",
            slaAlert && "text-monday-red font-bold"
          )}>
            {slaAlert && <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />}
            <span className="truncate">
              {sla.hasSLA ? sla.label : 'Sem SLA'}
            </span>
          </div>
        </>
      )}
    </div>
  );

  const Content = asCard ? CardContent : RowContent;

  if (simplified) {
    return Content;
  }

  return (
    <TicketContextMenu ticket={ticket} onUpdate={onUpdate}>
      {Content}
    </TicketContextMenu>
  );
}
