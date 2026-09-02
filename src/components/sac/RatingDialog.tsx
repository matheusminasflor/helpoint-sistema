import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Star } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  ticketId: string;
  protocol?: string;
  onClose: () => void;
  onSaved?: () => void;
}

type Resolved = 'yes' | 'partial' | 'no' | '';

export function RatingDialog({ open, ticketId, protocol, onClose, onSaved }: Props) {
  const [rating, setRating] = useState<number>(0);
  const [hover, setHover] = useState<number>(0);
  const [resolved, setResolved] = useState<Resolved>('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);

  const needsComment = rating > 0 && (rating <= 3 || resolved === 'no' || resolved === 'partial');

  const submit = async () => {
    if (!rating) return toast.error('Dê uma nota de 1 a 5 estrelas.');
    if (!resolved) return toast.error('Diga se o problema foi resolvido.');
    if (needsComment && comment.trim().length < 5) {
      return toast.error('Conte rapidinho o motivo (mín. 5 caracteres).');
    }
    setSaving(true);
    const { error } = await supabase
      .from('sac_tickets')
      .update({
        satisfaction_rating: rating,
        satisfaction_resolved: resolved,
        satisfaction_comment: comment.trim() || null,
        satisfaction_rated_at: new Date().toISOString(),
      })
      .eq('id', ticketId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success('Obrigado pela sua avaliação');
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Como foi o seu atendimento?</DialogTitle>
          {protocol && (
            <p className="text-xs text-muted-foreground font-mono">{protocol}</p>
          )}
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Sua nota geral
            </label>
            <div className="flex items-center gap-1 mt-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1"
                  aria-label={`${n} estrelas`}
                >
                  <Star
                    className={cn(
                      'w-7 h-7 transition',
                      (hover || rating) >= n
                        ? 'fill-yellow-400 text-yellow-500'
                        : 'text-muted-foreground/40',
                    )}
                  />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              O seu problema foi resolvido?
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { v: 'yes', label: 'Sim' },
                { v: 'partial', label: 'Parcialmente' },
                { v: 'no', label: 'Não' },
              ].map((o) => (
                <Button
                  key={o.v}
                  type="button"
                  size="sm"
                  variant={resolved === o.v ? 'default' : 'outline'}
                  onClick={() => setResolved(o.v as Resolved)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              Comentário {needsComment && <span className="text-destructive">*</span>}
            </label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder={
                needsComment
                  ? 'Conte o que aconteceu para podermos melhorar.'
                  : 'Opcional — algum comentário?'
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Agora não
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Enviando…' : 'Enviar avaliação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
