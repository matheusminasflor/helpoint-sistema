import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Wand2, Loader2, Check, X } from 'lucide-react';
import { useAIRefine } from '@/hooks/useAISecretary';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

interface AIRefineButtonProps {
  text: string;
  context: 'ticket_title' | 'ticket_description' | 'comment' | 'resolution' | 'checklist_description';
  onRefine: (refined: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AIRefineButton({
  text,
  context,
  onRefine,
  disabled = false,
  className,
}: AIRefineButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [refinedText, setRefinedText] = useState('');
  const { refineText, isRefining } = useAIRefine();

  const handleRefine = async () => {
    if (!text.trim()) return;
    
    setIsOpen(true);
    const result = await refineText(text, context);
    setRefinedText(result);
  };

  const handleApply = () => {
    onRefine(refinedText);
    setIsOpen(false);
    setRefinedText('');
  };

  const handleCancel = () => {
    setIsOpen(false);
    setRefinedText('');
  };

  const hasChanges = refinedText && refinedText !== text;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRefine}
        disabled={disabled || !text.trim() || isRefining}
        className={cn(
          "h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary",
          "border border-transparent hover:border-border",
          "transition-all duration-200",
          className
        )}
        title="Refinar com IA"
      >
        {isRefining ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}
        <span className="hidden sm:inline">Refinar</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-xl border border-border shadow-lg">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-mono uppercase tracking-wider">
              <Wand2 className="h-5 w-5" />
              Refinamento com IA
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Original text */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Texto Original
              </label>
              <div className="p-3 bg-muted/50 border border-border text-sm font-mono">
                {text || '(vazio)'}
              </div>
            </div>

            {/* Refined text */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Texto Refinado
                {isRefining && (
                  <span className="text-primary animate-pulse">processando...</span>
                )}
              </label>
              <div className={cn(
                "p-3 border border-border text-sm font-mono min-h-[80px]",
                "transition-all duration-300",
                isRefining ? "bg-muted/30 animate-pulse" : "bg-background",
                hasChanges && "border-primary/50 bg-primary/5"
              )}>
                {isRefining ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analisando e refinando texto...
                  </div>
                ) : refinedText ? (
                  <MarkdownRenderer content={refinedText} />
                ) : (
                  '(aguardando...)'
                )}
              </div>
            </div>

            {/* Changes indicator */}
            {!isRefining && refinedText && (
              <div className={cn(
                "text-xs font-mono p-2 border",
                hasChanges 
                  ? "border-primary/30 bg-primary/5 text-primary" 
                  : "border-muted bg-muted/30 text-muted-foreground"
              )}>
                {hasChanges 
                  ? "Sugestões de melhoria encontradas"
                  : "○ Texto já está adequado"}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border pt-4 gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              className="rounded-lg gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>
            <Button
              onClick={handleApply}
              disabled={isRefining || !hasChanges}
              className="rounded-lg gap-2"
            >
              <Check className="h-4 w-4" />
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
