import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { BrainCircuit, Copy, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { friendlyAIError } from '@/hooks/useTenantAICredentials';

interface AIIndicatorAnalysisProps {
  open: boolean;
  onClose: () => void;
  metrics: Record<string, unknown>;
  period: string;
}

export function AIIndicatorAnalysis({ open, onClose, metrics, period }: AIIndicatorAnalysisProps) {
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleAnalyze = async () => {
    setIsLoading(true);
    setAnalysis(null);
    try {
      const { data, error } = await supabase.functions.invoke('ai-analyze-indicators', {
        body: { metrics, period },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (err: any) {
      console.error('AI analysis error:', err);
      toast.error(friendlyAIError(err, 'Erro ao gerar análise. Tente novamente.'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!analysis) return;
    await navigator.clipboard.writeText(analysis);
    setCopied(true);
    toast.success('Análise copiada');
    setTimeout(() => setCopied(false), 2000);
  };

  // Auto-trigger analysis when opened
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      onClose();
      return;
    }
    if (!analysis && !isLoading) {
      handleAnalyze();
    }
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BrainCircuit className="h-5 w-5 text-primary" />
            Análise IA — Indicadores TI
          </SheetTitle>
          <SheetDescription>
            Análise executiva gerada com base nos indicadores do período selecionado.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {isLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Analisando indicadores...</p>
            </div>
          )}

          {analysis && (
            <>
              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={handleCopy} className="text-xs gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              <div className="bg-muted/30 rounded-xl p-5 border border-border/50">
                <MarkdownRenderer content={analysis} />
              </div>
              <Button variant="outline" size="sm" onClick={handleAnalyze} className="w-full text-xs">
                <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
                Gerar nova análise
              </Button>
            </>
          )}

          {!isLoading && !analysis && (
            <div className="flex flex-col items-center justify-center py-16 gap-4">
              <BrainCircuit className="h-12 w-12 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Clique para gerar a análise</p>
              <Button onClick={handleAnalyze} size="sm">
                <BrainCircuit className="mr-1.5 h-4 w-4" />
                Analisar Indicadores
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
