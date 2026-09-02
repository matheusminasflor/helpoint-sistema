import { useTenantPath } from '@/hooks/useTenantPath';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Sparkles, FileText, Save, AlertCircle, Loader2, Trash2 } from 'lucide-react';
import {
  useTicketPatterns,
  useAnalyzePatterns,
  useSavePattern,
  useDeletePattern,
  type DetectedPattern,
} from '@/hooks/useTicketPatterns';
import { useState } from 'react';

interface PatternsAnalysisProps {
  module?: string;
}

export function PatternsAnalysis({ module }: PatternsAnalysisProps = {}) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: savedPatterns, isLoading } = useTicketPatterns();
  const analyze = useAnalyzePatterns(module);
  const savePattern = useSavePattern();
  const deletePattern = useDeletePattern();
  const [detected, setDetected] = useState<DetectedPattern[]>([]);

  const handleAnalyze = async () => {
    const result = await analyze.mutateAsync();
    setDetected(result.patterns || []);
  };

  const createPopFromPattern = (params: {
    title: string;
    keywords: string[];
    category: string | null;
    suggestion: string;
    occurrences: number;
  }) => {
    const content = [
      `# ${params.title}`,
      '',
      `> Artigo sugerido a partir de **${params.occurrences} chamados recorrentes** detectados pela IA.`,
      '',
      '## Problema',
      params.suggestion,
      '',
      '## Solução passo a passo',
      '1. _Descreva aqui o primeiro passo_',
      '2. _Descreva aqui o segundo passo_',
      '3. _Descreva aqui o terceiro passo_',
      '',
      '## Observações',
      '_Adicione dicas, links úteis e prints._',
    ].join('\n');

    navigate(tenantPath('/ti/pops/novo'), {
      state: {
        title: params.title,
        content,
        keywords: params.keywords,
        category: params.category || '',
      },
    });
  };

  return (
    <div className="space-y-6 mt-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Padrões detectados pela IA
            </CardTitle>
            <CardDescription>
              Analisa os chamados dos últimos 30 dias e identifica problemas recorrentes
              que podem virar artigos da base de conhecimento.
            </CardDescription>
          </div>
          <Button onClick={handleAnalyze} disabled={analyze.isPending}>
            {analyze.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analisando...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Analisar agora
              </>
            )}
          </Button>
        </CardHeader>
        <CardContent>
          {detected.length === 0 && !analyze.isPending && (
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              Nenhuma análise recente. Clique em "Analisar agora" para identificar padrões.
            </div>
          )}
          {detected.length > 0 && (
            <div className="space-y-3">
              {detected.map((p, i) => (
                <div
                  key={`${p.pattern_name}-${i}`}
                  className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.pattern_name}</span>
                      <Badge variant="secondary">{p.occurrence_count} ocorrências</Badge>
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => savePattern.mutate(p)}
                      disabled={savePattern.isPending}
                    >
                      <Save className="h-4 w-4 mr-1" />
                      Salvar
                    </Button>
                    <Button
                      size="sm"
                      onClick={() =>
                        createPopFromPattern({
                          title: `Como resolver: ${p.pattern_name}`,
                          keywords: p.keywords,
                          category: p.category,
                          suggestion: p.suggested_pop,
                          occurrences: p.occurrence_count,
                        })
                      }
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Criar artigo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Padrões salvos</CardTitle>
          <CardDescription>
            Padrões que você marcou para acompanhar. Crie um artigo para reduzir o volume.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <Skeleton className="h-20 w-full" />}
          {!isLoading && (!savedPatterns || savedPatterns.length === 0) && (
            <p className="text-sm text-muted-foreground">Nenhum padrão salvo ainda.</p>
          )}
          {!isLoading && savedPatterns && savedPatterns.length > 0 && (
            <div className="space-y-3">
              {savedPatterns.map((p) => (
                <div
                  key={p.id}
                  className="border rounded-lg p-4 flex flex-col md:flex-row md:items-center gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{p.pattern_name}</span>
                      <Badge variant="secondary">{p.occurrence_count} ocorrências</Badge>
                      {p.category && <Badge variant="outline">{p.category}</Badge>}
                      {p.is_reviewed && <Badge>Revisado</Badge>}
                    </div>
                    {p.description && (
                      <p className="text-sm text-muted-foreground mt-1">{p.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      onClick={() =>
                        createPopFromPattern({
                          title: `Como resolver: ${p.pattern_name}`,
                          keywords: p.keywords || [],
                          category: p.category,
                          suggestion: p.description || '',
                          occurrences: p.occurrence_count,
                        })
                      }
                    >
                      <FileText className="h-4 w-4 mr-1" />
                      Criar artigo
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deletePattern.mutate(p.id)}
                      disabled={deletePattern.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
