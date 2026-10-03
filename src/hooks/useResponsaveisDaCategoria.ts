// Responsáveis da categoria (decisão do dono, 2026-10-03): a categoria pode ter uma ou mais pessoas
// que sempre atendem; a subcategoria herda as da categoria de cima. A regra mora no banco
// (`responsaveis_da_categoria` e o trigger `chamado_vai_para_o_responsavel`, 20261126010000).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, mensagemDeErro, unwrap } from '@/lib/supabase-result';
import { toast } from 'sonner';

export interface Responsavel { id: string; full_name: string | null }
interface Vinculo { category_id: string; user_id: string }

const tabela = () => supabase.from('ti_category_responsaveis' as never);

/** Quem atende esta categoria agora — já com a herança e só quem ainda tem o setor. */
export function useResponsaveisDaCategoria(categoryId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['responsaveis-da-categoria', tenantId, categoryId],
    enabled: !!categoryId,
    queryFn: async (): Promise<Responsavel[]> =>
      (unwrap(await supabase.rpc('responsaveis_da_categoria' as never, { p_category: categoryId } as never)) ?? []) as Responsavel[],
  });
}

/** Os vínculos gravados (sem herança), para a tela de configuração das categorias. */
export function useVinculosDeResponsaveis() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['responsaveis-vinculos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Vinculo[]> =>
      (unwrap(await tabela().select('category_id, user_id')) ?? []) as unknown as Vinculo[],
  });
}

/** Grava a lista de responsáveis de uma categoria: tira quem saiu, põe quem entrou. */
export function useSalvarResponsaveis() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ categoryId, antes, depois }: { categoryId: string; antes: string[]; depois: string[] }) => {
      const sai = antes.filter((id) => !depois.includes(id));
      const entra = depois.filter((id) => !antes.includes(id));
      if (sai.length > 0) {
        expectRows(await tabela().delete().eq('category_id' as never, categoryId as never)
          .in('user_id' as never, sai as never).select('id'), 'tirar o responsável');
      }
      if (entra.length > 0) {
        expectRows(await tabela().insert(
          entra.map((user_id) => ({ tenant_id: tenantId, category_id: categoryId, user_id })) as never,
        ).select('id'), 'gravar o responsável');
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['responsaveis-vinculos'] });
      qc.invalidateQueries({ queryKey: ['responsaveis-da-categoria'] });
    },
    onError: (e) => toast.error(`Não foi possível gravar os responsáveis: ${mensagemDeErro(e)}`),
  });
}
