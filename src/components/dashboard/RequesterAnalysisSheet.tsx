import { useState, useCallback } from 'react';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { RequesterMetric, useRequesterTickets } from '@/hooks/useRequesterMetrics';
import { MetricsFilter } from '@/hooks/useHelpdeskMetrics';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { Building2, AlertTriangle, Sparkles, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAssistantName } from '@/hooks/useAssistantName';

interface RequesterAnalysisSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requester: RequesterMetric | null;
  filter?: MetricsFilter;
}

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-700 dark:text-red-400',
  high: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  medium: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  low: 'bg-green-500/10 text-green-700 dark:text-green-400',
};

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  resolved: 'Resolvido',
  closed: 'Fechado',
};

export function RequesterAnalysisSheet({ open, onOpenChange, requester, filter }: RequesterAnalysisSheetProps) {
  const assistantName = useAssistantName();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: tickets, isLoading } = useRequesterTickets(requester?.id || null, filter);
  const [analysis, setAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);

  const handleAnalyze = useCallback(async () => {
    if (!tickets || tickets.length === 0 || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysis('');
    setAnalyzed(true);

    try {
      const { session } = unwrap(await supabase.auth.getSession());
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada');

      const ticketsSummary = tickets.map(t =>
        `#${t.ticket_number} | ${t.title} | Cat: ${t.category || 'N/A'} | Prioridade: ${t.priority} | Status: ${t.status} | Data: ${format(new Date(t.created_at), 'dd/MM/yyyy')} | Técnico: ${t.assigned_to_name || 'Não atribuído'}`
      ).join('\n');

      const prompt = `Analise brevemente os chamados de "${requester?.full_name || requester?.email}" (${requester?.department || 'sem depto'}).
${tickets.length} chamados | ${requester?.urgent_count || 0} urgentes | Categorias: ${requester?.categories?.join(', ') || 'N/A'}

Chamados:
${ticketsSummary}

Responda de forma TELEGRÁFICA com no máximo 8 bullets curtos, divididos em 3 blocos:
1. **Padrão**: o que se repete e por quê (2-3 bullets)
2. **Causa raiz**: diagnóstico direto — falha de usuário, problema sistêmico ou processo (1-2 bullets)
3. **Ação recomendada**: o que fazer agora (2-3 bullets)

Sem introdução, sem conclusão, sem linguagem motivacional. Apenas dados e ações.`;

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-lyra-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question: prompt,
            conversation_history: [],
            context_data: { tickets: [], kanban_cards: [], tasks: [] },
            user_name: 'Gestor',
          }),
        }
      );

      if (!res.ok) throw new Error(`Erro ${res.status}`);
      if (!res.body) throw new Error('Sem resposta');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              setAnalysis(fullContent);
            }
          } catch { break; }
        }
      }

      if (!fullContent) setAnalysis('Não foi possível gerar a análise. Tente novamente.');
    } catch (err) {
      console.error('Lyra analysis error:', err);
      setAnalysis(err instanceof Error ? err.message : 'Erro ao analisar. Tente novamente.');
    } finally {
      setIsAnalyzing(false);
    }
  }, [tickets, requester, isAnalyzing]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAnalysis('');
      setAnalyzed(false);
    }
    onOpenChange(open);
  };

  if (!requester) return null;

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent side="right" className="sm:max-w-2xl w-full p-0 flex flex-col overflow-hidden">
        <SheetHeader className="p-6 pb-4 border-b">
          <SheetTitle className="text-lg">Análise de Solicitante</SheetTitle>
          <SheetDescription className="sr-only">Detalhes dos chamados e análise da {assistantName}</SheetDescription>

          <div className="flex items-center justify-between mt-2">
            <div>
              <p className="font-semibold text-base">{requester.full_name || requester.email}</p>
              {requester.department && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3 w-3" /> {requester.department}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {requester.urgent_count > 0 && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  {requester.urgent_count} urgentes
                </Badge>
              )}
              <Badge variant="secondary" className="text-xs font-bold">
                {requester.ticket_count} chamados
              </Badge>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0 p-6">
          {/* Tickets table */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold mb-3">Chamados no Período</h3>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : !tickets || tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum chamado encontrado.</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-16">#</TableHead>
                      <TableHead className="text-xs">Título</TableHead>
                      <TableHead className="text-xs">Categoria</TableHead>
                      <TableHead className="text-xs">Prioridade</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tickets.map(ticket => (
                      <TableRow
                        key={ticket.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          onOpenChange(false);
                          navigate(tenantPath(`/ti/chamados/${ticket.id}`), { state: { from: '/ti' } });
                        }}
                      >
                        <TableCell className="text-xs font-mono">{ticket.ticket_number}</TableCell>
                        <TableCell className="text-xs max-w-[200px] truncate">{ticket.title}</TableCell>
                        <TableCell className="text-xs">{ticket.category || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${priorityColors[ticket.priority] || ''}`}>
                            {ticket.priority}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs">{statusLabels[ticket.status] || ticket.status}</TableCell>
                        <TableCell className="text-xs">{format(new Date(ticket.created_at), 'dd/MM', { locale: ptBR })}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* Lyra Analysis */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <LyraAvatar size="sm" />
                <h3 className="text-sm font-semibold">Análise da {assistantName}</h3>
              </div>
              {!analyzed && (
                <Button
                  size="sm"
                  className="whitespace-nowrap flex-shrink-0"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !tickets || tickets.length === 0}
                >
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Analisar com {assistantName}
                </Button>
              )}
            </div>

            {!analyzed && !isAnalyzing && (
              <p className="text-sm text-muted-foreground">
                Clique em "Analisar com {assistantName}" para obter insights sobre o comportamento deste solicitante.
              </p>
            )}

            {isAnalyzing && !analysis && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Analisando padrões dos chamados...
              </div>
            )}

            {analysis && (
              <div className="bg-muted/50 rounded-lg p-4">
                <MarkdownRenderer content={analysis} />
              </div>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
