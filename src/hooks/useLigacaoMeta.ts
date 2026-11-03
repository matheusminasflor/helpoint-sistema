// A ligação do Marketing com a Meta para os Indicadores (2026-11-03; `mkt_meta_ligacao`, 20270212240000): as páginas,
// contas do Instagram e contas de anúncios que a pessoa liberou ao conectar. A credencial nunca chega à tela.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

export interface ContaDaMeta { tipo: 'pagina' | 'instagram' | 'anuncios'; id: string; nome: string }
export interface LigacaoMeta { contas: ContaDaMeta[]; conectado_em: string; ultimo_erro: string | null; atualizado_em: string | null; coletado_em: string | null }

export function useLigacaoMeta() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['mkt-meta-ligacao', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<LigacaoMeta | null> =>
      (unwrap(await supabase.from('mkt_meta_ligacao' as never)
        .select('contas, conectado_em, ultimo_erro, atualizado_em, coletado_em').maybeSingle()) ?? null) as unknown as LigacaoMeta | null,
  });
}
