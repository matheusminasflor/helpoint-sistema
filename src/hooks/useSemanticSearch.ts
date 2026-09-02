import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface SemanticSearchResult {
  id: string;
  title: string;
  category: string | null;
  score: number;
  reason: string;
}

export function useSemanticSearch() {
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SemanticSearchResult[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Abort previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setIsSearching(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await supabase.functions.invoke('ai-semantic-search', {
        body: { query },
        headers: session?.access_token 
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (response.data?.results) {
        setResults(response.data.results);
      } else {
        setResults([]);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      
      console.error('Semantic search error:', err);
      setError('Erro na busca semântica');
      
      // Don't show toast for rate limits - they're handled by fallback
      if (!(err as Error).message?.includes('429')) {
        // Silent fail - user can still use regular search
      }
    } finally {
      setIsSearching(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return {
    search,
    clearResults,
    isSearching,
    results,
    error,
    hasResults: results.length > 0,
  };
}
