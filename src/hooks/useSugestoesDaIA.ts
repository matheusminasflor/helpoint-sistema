import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { invokeEdge } from '@/lib/edge-function';
import { expectRows, unwrap } from '@/lib/supabase-result';

export interface SugestaoDaIA {
  id: string;
  tipo: 'categoria_nova' | 'categoria_errada' | 'tutorial';
  titulo: string;
  motivo: string;
  dados: {
    nome?: string;
    parent_id?: string | null;
    tutorial?: { title: string; content: string; keywords: string[] };
  };
  chamados: { id: string; numero: number; titulo: string }[];
}

// A tabela é nova e ainda não está nos tipos gerados do Supabase.
const tabela = () => supabase.from('ia_sugestoes' as 'profiles');

/** Só lê o que já foi gerado: abrir a tela não usa IA. */
export function useSugestoesDaIA(ligado: boolean) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ia-sugestoes', tenantId],
    enabled: ligado && !!tenantId,
    queryFn: async (): Promise<SugestaoDaIA[]> =>
      unwrap(await tabela().select('id, tipo, titulo, motivo, dados, chamados').eq('status' as never, 'pendente' as never)
        .order('created_at' as never)) as unknown as SugestaoDaIA[],
  });
}

export function useGerarSugestoes() {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (periodo: { de: string; ate: string }) => invokeEdge<{ total: number }>('ai-analyze-indicators', periodo),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ia-sugestoes', tenantId] }),
  });
}

export function useDecidirSugestao() {
  const { tenantId, user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'aprovada' | 'recusada' }) =>
      expectRows(await tabela()
        .update({ status, decidida_por: user?.id, decidida_em: new Date().toISOString() } as never)
        .eq('id', id).select('id'), 'a sugestão'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ia-sugestoes', tenantId] }),
  });
}
