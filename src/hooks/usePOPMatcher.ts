import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { POP } from './usePOPs';
import { unwrap } from '@/lib/supabase-result';

interface MatchPOPResult {
  match: boolean;
  pop?: {
    id: string;
    title: string;
    content: string;
    preview: string;
    confidence: number;
    keywords: string[];
  };
}

export function usePOPMatcher() {
  const [isChecking, setIsChecking] = useState(false);
  const [matchedPOP, setMatchedPOP] = useState<POP | null>(null);

  const checkForPOP = useCallback(async (
    title: string,
    description?: string,
    category?: string
  ): Promise<POP | null> => {
    if (!title.trim() || title.length < 5) {
      setMatchedPOP(null);
      return null;
    }

    setIsChecking(true);
    try {
      const { session } = unwrap(await supabase.auth.getSession());
      if (!session?.access_token) {
        setMatchedPOP(null);
        return null;
      }

      const response = await supabase.functions.invoke('ai-match-pop', {
        body: { title, description, category },
      });

      if (response.error) {
        console.error('Error matching POP:', response.error);
        setMatchedPOP(null);
        return null;
      }

      const result = response.data as MatchPOPResult;

      if (result.match && result.pop) {
        const pop: POP = {
          id: result.pop.id,
          tenant_id: '',
          title: result.pop.title,
          content: result.pop.content,
          category: null,
          subcategory: null,
          keywords: result.pop.keywords || [],
          related_pattern_id: null,
          views_count: 0,
          solved_count: 0,
          avg_rating: null,
          is_active: true,
          created_by: null,
          created_at: '',
          updated_at: '',
          visibility_type: 'all',
          visibility_departments: [],
          audience: 'staff',
        };
        setMatchedPOP(pop);
        return pop;
      }

      setMatchedPOP(null);
      return null;
    } catch (error) {
      console.error('Error in POP matcher:', error);
      setMatchedPOP(null);
      return null;
    } finally {
      setIsChecking(false);
    }
  }, []);

  const clearMatch = useCallback(() => {
    setMatchedPOP(null);
  }, []);

  return {
    isChecking,
    matchedPOP,
    checkForPOP,
    clearMatch,
  };
}
