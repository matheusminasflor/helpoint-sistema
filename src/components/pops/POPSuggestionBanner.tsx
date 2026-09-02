import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, ExternalLink, CheckCircle2, ArrowRight, X, Loader2, Star } from 'lucide-react';
import { useIncrementPOPViews, useIncrementPOPSolved, useRecordPOPInteraction, POP } from '@/hooks/usePOPs';
import { POPFeedbackDialog } from './POPFeedbackDialog';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { cn } from '@/lib/utils';

interface POPSuggestionBannerProps {
  pop: POP;
  onProceed: () => void;
  onSolved: () => void;
  isLoading?: boolean;
}

export function POPSuggestionBanner({ pop, onProceed, onSolved, isLoading }: POPSuggestionBannerProps) {
  const [showDialog, setShowDialog] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  
  const incrementViews = useIncrementPOPViews();
  const incrementSolved = useIncrementPOPSolved();
  const recordInteraction = useRecordPOPInteraction();

  if (dismissed) return null;

  const handleViewTutorial = () => {
    setShowDialog(true);
    incrementViews.mutate(pop.id);
    recordInteraction.mutate({ pop_id: pop.id, action: 'viewed' });
  };

  const handleSolved = () => {
    incrementSolved.mutate(pop.id);
    recordInteraction.mutate({ pop_id: pop.id, action: 'solved' });
    setShowDialog(false);
    setShowFeedback(true);
  };

  const handleFeedbackComplete = () => {
    setShowFeedback(false);
    onSolved();
  };

  const handleProceed = () => {
    recordInteraction.mutate({ pop_id: pop.id, action: 'proceeded' });
    setShowDialog(false);
    onProceed();
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  const previewText = pop.content.slice(0, 150).replace(/[#*_]/g, '') + (pop.content.length > 150 ? '...' : '');

  return (
    <>
      {/* Floating AI Suggestion Card */}
      <div className="relative bg-card border border-primary/20 rounded-2xl shadow-[0_8px_30px_rgba(99,102,241,0.12)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-300">
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l-2xl" />
        
        <div className="p-5 pl-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
              <Lightbulb className="h-5 w-5 text-primary" />
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="font-semibold text-sm text-primary">
                  Encontramos um tutorial que pode ajudar!
                </h4>
                <Badge variant="secondary" className="text-xs rounded-full bg-surface-1 text-muted-foreground">
                  Tutorial
                </Badge>
                {pop.avg_rating && pop.avg_rating > 0 && (
                  <div className="flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                    {pop.avg_rating.toFixed(1)}
                  </div>
                )}
              </div>
              
              <p className="font-medium text-sm text-slate-900 mb-1">{pop.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2">{previewText}</p>
              
              <div className="flex items-center gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleViewTutorial}
                  className="gap-2 rounded-xl "
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ver solução sugerida
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleProceed}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                >
                  Isso não resolveu meu problema
                </Button>
              </div>
            </div>

            <Button
              size="icon"
              variant="ghost"
              className="flex-shrink-0 h-8 w-8 text-muted-foreground hover:text-muted-foreground"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Full Tutorial Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              {pop.title}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2">
              Tutorial para resolver seu problema
              {pop.category && (
                <Badge variant="outline" className="rounded-full">{pop.category}</Badge>
              )}
              {pop.avg_rating && pop.avg_rating > 0 && (
                <div className="flex items-center gap-0.5 text-xs">
                  <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                  {pop.avg_rating.toFixed(1)}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[400px] pr-4">
            <MarkdownRenderer content={pop.content} />
          </ScrollArea>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={handleProceed}
              className="gap-2 rounded-xl"
            >
              Não resolveu, abrir chamado
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              onClick={handleSolved}
              className="gap-2 rounded-xl"
            >
              <CheckCircle2 className="h-4 w-4" />
              Isso resolveu meu problema!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Feedback Dialog */}
      <POPFeedbackDialog
        popId={pop.id}
        popTitle={pop.title}
        open={showFeedback}
        onOpenChange={setShowFeedback}
        onComplete={handleFeedbackComplete}
      />
    </>
  );
}

export function POPSuggestionLoading() {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm text-muted-foreground">
          Buscando tutoriais relevantes...
        </span>
      </div>
    </div>
  );
}
