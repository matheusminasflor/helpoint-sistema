import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
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
import { Input } from '@/components/ui/input';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useAISuggestReply } from '@/hooks/useAISuggestReply';
import { useIALigada } from '@/hooks/useAssistantName';
import { AIRefineButton } from '@/components/ai/AIRefineButton';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, Sparkles } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';
import { fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/dates';
import { outrosAbertos, useChamadosDaQueda } from '@/hooks/useChamadosDaQueda';
import { QuemResolve, prepararParaResolver, usePrecisaPerguntarQuemResolve, type ModoDeResolver } from './QuemResolve';

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
  const iaLigada = useIALigada();
  const [resolutionNotes, setResolutionNotes] = useState('');
  const perguntar = usePrecisaPerguntarQuemResolve(ticket);
  const [modo, setModo] = useState<ModoDeResolver>('assumir');
  // A queda fecha no último chamado dela: é esse que responde "voltou às".
  const { data: daQueda = [] } = useChamadosDaQueda(open ? ticket.interrupcao_id : null);
  const abertos = outrosAbertos(daQueda, ticket.id).length;
  const perguntaVolta = !!ticket.interrupcao_id && abertos === 0;
  const [voltou, setVoltou] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  // "Transformar em tutorial" ao resolver (etapa 4 · Chamados, 2026-10-24): o que resolveu um chamado vira
  // tutorial para o próximo, já com o problema e a solução escritos. Só para quem escreve tutoriais.
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const escreveTutorial = useDepartmentPermissions('ti').can('knowledge', 'create');

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
      if (perguntar) await prepararParaResolver(ticket.id, modo);
      await resolveTicket(ticket.id, resolutionNotes, perguntar && modo === 'assumir',
        perguntaVolta && voltou ? fromLocalDateTimeInput(voltou) : undefined);
      const notas = resolutionNotes;
      toast.success('Chamado resolvido com sucesso', escreveTutorial ? {
        duration: 10000,
        action: {
          label: 'Transformar em tutorial',
          onClick: () => navigate(tenantPath('/ti/pops/novo'), { state: {
            title: ticket.title,
            content: `Problema

${ticket.description ?? ''}

Como resolver

${notas}`,
          } }),
        },
      } : undefined);
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
            <CheckCircle2 className="w-5 h-5 text-status-success" />
            Resolver Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isBlocked && (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">{blockedMessage}</p>
            </div>
          )}

          {perguntar && (
            <QuemResolve dono={ticket.assignee?.full_name || 'outra pessoa'} modo={modo} onChange={setModo} />
          )}

          {perguntaVolta && (
            <div className="space-y-2">
              <Label htmlFor="voltou-as">Voltou às</Label>
              <Input id="voltou-as" type="datetime-local" value={voltou} onChange={(e) => setVoltou(e.target.value)} />
              <p className="text-xs text-muted-foreground">É a hora que fecha a interrupção nos Indicadores.</p>
            </div>
          )}
          {!!ticket.interrupcao_id && abertos > 0 && (
            <p className="text-xs text-muted-foreground">A interrupção continua aberta: há mais {abertos} chamado{abertos === 1 ? '' : 's'} nesta queda.</p>
          )}

          <div className="p-3 bg-status-success/10 border border-status-success/30 rounded-lg">
            <p className="text-sm text-status-success">
              Ao resolver o chamado, quem abriu é avisado e pode avaliar o atendimento.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="resolution">Descrição da resolução *</Label>
              <div className="flex items-center gap-1">
                {iaLigada && (
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
                )}
                <AIRefineButton
                  text={resolutionNotes}
                  apoio={ticket?.title}
                  context="resolution"
                  onRefine={(refined) => setResolutionNotes(refined)}
                  disabled={isBlocked || !resolutionNotes.trim()}
                />
              </div>
            </div>
            <Textarea
              id="resolution"
              placeholder="Descreva como o problema foi resolvido…"
              value={resolutionNotes}
              onChange={(e) => setResolutionNotes(e.target.value)}
              rows={4}
              disabled={isBlocked || isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Esta descrição fica visível para quem abriu o chamado.
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
                Resolvendo…
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
