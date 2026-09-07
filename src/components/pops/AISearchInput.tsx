import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Sparkles, Star, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { POP } from '@/hooks/usePOPs';
import { cn } from '@/lib/utils';

interface AISearchResult {
  pop: POP;
  confidence: number;
  matchedKeywords: string[];
}

interface AISearchInputProps {
  onSelectPOP: (pop: POP) => void;
  className?: string;
}

export function AISearchInput({ onSelectPOP, className }: AISearchInputProps) {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<AISearchResult[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setHasSearched(true);
    
    try {
      const { session } = unwrap(await supabase.auth.getSession());
      if (!session) {
        console.error('No session');
        return;
      }

      const response = await supabase.functions.invoke('ai-match-pop', {
        body: {
          title: query,
          description: query,
          useAI: true, // Flag to use AI matching
        },
      });

      if (response.error) {
        console.error('Error searching:', response.error);
        setResults([]);
        return;
      }

      const data = response.data;
      
      if (data.matches && Array.isArray(data.matches)) {
        setResults(data.matches.map((match: any) => ({
          pop: match.pop,
          confidence: match.confidence,
          matchedKeywords: match.keywords || [],
        })));
      } else if (data.match && data.pop) {
        // Single match response
        setResults([{
          pop: data.pop,
          confidence: data.pop.confidence,
          matchedKeywords: data.pop.keywords || [],
        }]);
      } else {
        setResults([]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className={cn("space-y-3", className)}>
      <div className="space-y-2">
        <Textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Descreva seu problema em detalhes...&#10;Ex: Não consigo imprimir documentos, a impressora não aparece na lista"
          className="min-h-[80px] resize-none"
          disabled={isSearching}
        />
        <Button
          onClick={handleSearch}
          disabled={isSearching || !query.trim()}
          className="w-full gap-2"
        >
          {isSearching ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando com IA...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Buscar Tutoriais com IA
            </>
          )}
        </Button>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-2">
          {results.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Tutoriais sugeridos pela IA:
              </p>
              {results.map((result, index) => (
                <Card 
                  key={result.pop.id}
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary hover:shadow-sm",
                    index === 0 && "ring-1 ring-primary/50 border-primary/30"
                  )}
                  onClick={() => onSelectPOP(result.pop)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          {index === 0 && (
                            <Badge variant="default" className="text-[10px] px-1.5 py-0 gap-0.5">
                              <Star className="h-2.5 w-2.5 fill-current" />
                              Melhor
                            </Badge>
                          )}
                          <h4 className="text-sm font-medium truncate">
                            {result.pop.title}
                          </h4>
                        </div>
                        {result.matchedKeywords.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.matchedKeywords.slice(0, 4).map((kw) => (
                              <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">
                                {kw}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant={result.confidence >= 0.7 ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {Math.round(result.confidence * 100)}%
                        </Badge>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          ) : (
            <Card className="border-dashed">
              <CardContent className="p-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhum tutorial encontrado para sua busca.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tente descrever o problema de outra forma ou abra um chamado.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
