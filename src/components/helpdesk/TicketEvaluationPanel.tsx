import { useState } from 'react';
import { CheckCircle2, RotateCcw, Star, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useTicketActions } from '@/hooks/useTicketActions';
import { cn } from '@/lib/utils';

export const EVALUATION_WINDOW_DAYS = 7;

/** Dias restantes da janela de avaliação/reabertura; 0 quando expirou. */
export function evaluationDaysLeft(resolvedAt: string | null | undefined): number {
  if (!resolvedAt) return 0;
  const resolved = new Date(resolvedAt).getTime();
  if (Number.isNaN(resolved)) return 0;
  const elapsedDays = (Date.now() - resolved) / 86_400_000;
  return Math.max(0, Math.ceil(EVALUATION_WINDOW_DAYS - elapsedDays));
}

/** Chamado resolvido que ainda espera a avaliação do solicitante. */
export function isAwaitingEvaluation(t: { status: string; resolved_at?: string | null }): boolean {
  return t.status === 'resolved' && evaluationDaysLeft(t.resolved_at) > 0;
}

interface Props {
  ticketId: string;
  resolvedAt: string | null | undefined;
  resolutionNotes: string | null | undefined;
  onUpdate?: () => void;
}

export function TicketEvaluationPanel({ ticketId, resolvedAt, resolutionNotes, onUpdate }: Props) {
  const { evaluateTicket, reopenTicket, isLoading } = useTicketActions();
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState('');
  const [reopening, setReopening] = useState(false);
  const [reason, setReason] = useState('');

  const daysLeft = evaluationDaysLeft(resolvedAt);
  const expired = daysLeft === 0;

  const handleEvaluate = async () => {
    if (!rating) {
      toast.error('Escolha uma nota de 1 a 5 antes de encerrar.');
      return;
    }
    try {
      await evaluateTicket(ticketId, rating, comment);
      toast.success('Obrigado pela avaliação. Chamado encerrado.');
      onUpdate?.();
    } catch (e) {
      toast.error(`Não foi possível registrar a avaliação: ${(e as Error).message}`);
    }
  };

  const handleReopen = async () => {
    if (!reason.trim()) {
      toast.error('Explique o que continua pendente para reabrir.');
      return;
    }
    try {
      await reopenTicket(ticketId, reason.trim());
      toast.success('Chamado reaberto. O atendente foi avisado.');
      setReopening(false);
      setReason('');
      onUpdate?.();
    } catch (e) {
      toast.error(`Não foi possível reabrir o chamado: ${(e as Error).message}`);
    }
  };

  return (
    <Card className="p-4 space-y-4 border-primary/40" style={{ backgroundColor: 'hsl(var(--primary) / 0.04)' }}>
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Resolução do atendimento</h2>
          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
            {resolutionNotes?.trim() || 'O atendente marcou este chamado como resolvido.'}
          </p>
        </div>
      </div>

      {expired ? (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5" aria-hidden="true" />
          O prazo de {EVALUATION_WINDOW_DAYS} dias para avaliar ou reabrir terminou. Abra um novo chamado se precisar.
        </p>
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
            Você tem {daysLeft} {daysLeft === 1 ? 'dia' : 'dias'} para avaliar ou reabrir. Depois disso o chamado fecha sozinho.
          </p>

          {reopening ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="reopen-reason">O que continua pendente? *</label>
              <Textarea
                id="reopen-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o que ainda não foi resolvido"
                className="min-h-[80px]"
              />
              <div className="flex gap-2">
                <Button onClick={handleReopen} disabled={isLoading}>Reabrir chamado</Button>
                <Button variant="outline" onClick={() => setReopening(false)}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <span className="text-sm font-medium">Como foi o atendimento?</span>
                <div className="flex items-center gap-1" role="radiogroup" aria-label="Nota do atendimento">
                  {[1, 2, 3, 4, 5].map(n => (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={rating === n}
                      aria-label={`Nota ${n} de 5`}
                      onClick={() => setRating(n)}
                      onMouseEnter={() => setHover(n)}
                      onMouseLeave={() => setHover(0)}
                      className="p-0.5 rounded"
                    >
                      <Star
                        className={cn(
                          'w-6 h-6 transition-colors',
                          (hover || rating) >= n ? 'text-monday-yellow fill-monday-yellow' : 'text-muted-foreground',
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  ))}
                </div>
              </div>

              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Comentário (opcional)"
                className="min-h-[70px]"
                aria-label="Comentário sobre o atendimento"
              />

              <div className="flex flex-wrap gap-2">
                <Button onClick={handleEvaluate} disabled={isLoading}>
                  <CheckCircle2 className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Avaliar e encerrar
                </Button>
                <Button variant="outline" onClick={() => setReopening(true)} disabled={isLoading}>
                  <RotateCcw className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Reabrir chamado
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
