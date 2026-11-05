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
import { useAIRefine, type ContextoDoTexto } from '@/hooks/useAIRefine';
import { useIALigada } from '@/hooks/useAssistantName';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';

interface AIRefineButtonProps {
  text: string;
  context: ContextoDoTexto;
  /** O assunto em volta do texto, para a IA entender a que ele se refere. */
  apoio?: string;
  /** O chamado aberto: a IA lê a conversa dele e, com o campo vazio, escreve o texto. */
  ticketId?: string;
  /** "Melhorar" por padrão; "Sugerir título" quando o texto vem da descrição. */
  rotulo?: string;
  onRefine: (refined: string) => void;
  disabled?: boolean;
  className?: string;
}

export function AIRefineButton({
  text,
  context,
  apoio,
  ticketId,
  rotulo = 'Melhorar',
  onRefine,
  disabled = false,
  className,
}: AIRefineButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [refinedText, setRefinedText] = useState('');
  const { refineText, isRefining } = useAIRefine();
  const iaLigada = useIALigada();
  const vazio = !text.trim();
  const nome = vazio && ticketId ? 'Escrever' : rotulo;

  const handleRefine = async () => {
    if (vazio && !ticketId) return;
    
    setIsOpen(true);
    const result = await refineText(text, context, apoio, ticketId);
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

  if (!iaLigada) return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={handleRefine}
        disabled={disabled || (vazio && !ticketId) || isRefining}
        className={cn(
          "h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-primary",
          "border border-transparent hover:border-border",
          "transition-all duration-200",
          className
        )}
        title={`${nome} com IA`}
      >
        {isRefining ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Wand2 className="h-3 w-3" />
        )}
        <span>{nome}</span>
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[600px] rounded-xl border border-border shadow-lg">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-mono uppercase tracking-wider">
              <Wand2 className="h-5 w-5" />
              {nome} com IA
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Original text */}
            <div className={cn('space-y-2', vazio && 'hidden')}>
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                Como foi escrito
              </label>
              <div className="p-3 bg-muted/50 border border-border text-sm font-mono">
                {text || '(vazio)'}
              </div>
            </div>

            {/* Refined text */}
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Sugestão da IA
                {isRefining && (
                  <span className="text-primary animate-pulse">processando…</span>
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
                    Lendo o chamado e escrevendo…
                  </div>
                ) : refinedText ? (
                  <MarkdownRenderer content={refinedText} />
                ) : (
                  '(aguardando…)'
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
                  ? "Confira antes de usar"
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
              Manter o meu
            </Button>
            <Button
              onClick={handleApply}
              disabled={isRefining || !hasChanges}
              className="rounded-lg gap-2"
            >
              <Check className="h-4 w-4" />
              Usar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
