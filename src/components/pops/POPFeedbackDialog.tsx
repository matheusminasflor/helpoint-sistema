import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Star, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react';
import { useCreatePOPFeedback } from '@/hooks/usePOPFeedback';
import { cn } from '@/lib/utils';

interface POPFeedbackDialogProps {
  popId: string;
  popTitle: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function POPFeedbackDialog({ 
  popId, 
  popTitle, 
  open, 
  onOpenChange,
  onComplete 
}: POPFeedbackDialogProps) {
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [isHelpful, setIsHelpful] = useState<boolean | null>(null);
  const [suggestion, setSuggestion] = useState('');
  
  const createFeedback = useCreatePOPFeedback();

  const handleSubmit = async () => {
    if (rating === 0) return;

    await createFeedback.mutateAsync({
      pop_id: popId,
      rating,
      is_helpful: isHelpful ?? undefined,
      suggestion: suggestion.trim() || undefined,
    });

    // Reset form
    setRating(0);
    setIsHelpful(null);
    setSuggestion('');
    onOpenChange(false);
    onComplete?.();
  };

  const displayRating = hoveredRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Como foi sua experiência?</DialogTitle>
          <DialogDescription>
            Avalie este tutorial: "{popTitle}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Star Rating */}
          <div className="space-y-2">
            <Label>Avaliação *</Label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={cn(
                      "h-8 w-8 transition-colors",
                      star <= displayRating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    )}
                  />
                </button>
              ))}
              {rating > 0 && (
                <span className="ml-2 text-sm text-muted-foreground">
                  {rating === 1 && "Muito ruim"}
                  {rating === 2 && "Ruim"}
                  {rating === 3 && "Regular"}
                  {rating === 4 && "Bom"}
                  {rating === 5 && "Excelente"}
                </span>
              )}
            </div>
          </div>

          {/* Helpful Toggle */}
          <div className="space-y-2">
            <Label>Este tutorial foi útil?</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={isHelpful === true ? "default" : "outline"}
                size="sm"
                onClick={() => setIsHelpful(true)}
                className="gap-2"
              >
                <ThumbsUp className="h-4 w-4" />
                Sim
              </Button>
              <Button
                type="button"
                variant={isHelpful === false ? "destructive" : "outline"}
                size="sm"
                onClick={() => setIsHelpful(false)}
                className="gap-2"
              >
                <ThumbsDown className="h-4 w-4" />
                Não
              </Button>
            </div>
          </div>

          {/* Suggestion */}
          <div className="space-y-2">
            <Label htmlFor="suggestion">Sugestão de melhoria (opcional)</Label>
            <Textarea
              id="suggestion"
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="O que poderia ser melhor neste tutorial?"
              className="min-h-[80px] resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Pular
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={rating === 0 || createFeedback.isPending}
          >
            {createFeedback.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Enviar Feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
