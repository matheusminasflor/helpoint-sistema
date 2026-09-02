import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useAISuggestReply } from '@/hooks/useAISuggestReply';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

interface ResolveTicketDialogProps {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onResolve: () => void;
  isBlocked?: boolean;
  blockedMessage?: string;
}

export function ResolveTicketDialog({ 
  ticket, 
  open, 
  onClose, 
  onResolve,
  isBlocked = false,
  blockedMessage = 'Não é possível encerrar: existem itens pendentes no Checklist de Conformidade.'
}: ResolveTicketDialogProps) {
  const { resolveTicket, isLoading } = useTicketActions();
  const { generateSuggestion, isGenerating } = useAISuggestReply();
  const [resolutionNotes, setResolutionNotes] = useState('');

  const handleSuggestResolution = async () => {
    const suggestion = await generateSuggestion(ticket.id, 'resolution');
    if (suggestion) setResolutionNotes(suggestion);
  };

  const handleSubmit = async () => {
    if (isBlocked) {
      toast.warning(blockedMessage);
      return;
    }

    if (!resolutionNotes.trim()) {
      toast.error('Descreva a resolução do chamado');
      return;
    }

    try {
      await resolveTicket(ticket.id, resolutionNotes);
      toast.success('Chamado resolvido com sucesso');
      onResolve();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao resolver chamado');
    }
  };

  const handleClose = () => {
    setResolutionNotes('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            Resolver Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isBlocked && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">{blockedMessage}</p>
            </div>
          )}

          <div className="p-3 bg-status-success/10 border border-status-success/30 rounded-lg">
            <p className="text-sm text-status-success">
              Ao resolver o chamado, o solicitante será notificado e poderá avaliar o atendimento.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="resolution">Descrição da resolução *</Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSuggestResolution}
                  disabled={isBlocked || isGenerating}
                  className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary"
                >
                  {isGenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  <span className="hidden sm:inline">Sugerir com IA</span>
                </Button>
                <AIRefineButton
                  text={resolutionNotes}
                  context="resolution"
                  onRefine={(refined) => setResolutionNotes(refined)}
                  disabled={isBlocked || !resolutionNotes.trim()}
                />
              </div>
            </div>
            <Textarea
              id="resolution"
              placeholder="Descreva como o problema foi resolvido..."
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
              disabled={isBlocked || isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Esta descrição ficará visível para o solicitante.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button 
            variant="success"
            onClick={handleSubmit} 
            disabled={isLoading || isBlocked || !resolutionNotes.trim()}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resolvendo...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Resolver Chamado
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
