// Estoque do Marketing (dono, 2026-10-19; migration 20270128010000). Cadastro próprio do Marketing (brindes, amostras,
// material gráfico…), separado dos suprimentos de Compras. A compra registrada de um produto ligado ao Catálogo de
// Compras entra no banco; daqui entram a entrada manual e a retirada (data e hora, quem retirou, motivo). O saldo não
// fica negativo (o banco recusa) e cruzar o mínimo avisa o Marketing.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

export interface ProdutoMkt {
  id: string;
  nome: string;
  unidade: string;
  categoria: string | null;
  local: string | null;
  estoque_minimo: number;
  compras_produto_id: string | null;
  ativo: boolean;
}

export interface MovimentoMkt {
  id: string;
  produto_id: string;
  tipo: 'entrada' | 'saida';
  quantidade: number;
  quando: string;
  retirado_por: string | null;
  motivo: string | null;
  purchase_request_id: string | null;
}

export function useProdutosMkt() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['estoque-mkt', 'produtos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ProdutoMkt[]> =>
      ((unwrap(await supabase.from('mkt_estoque_produtos' as never)
        .select('id, nome, unidade, categoria, local, estoque_minimo, compras_produto_id, ativo')
        .order('nome')) ?? []) as unknown as ProdutoMkt[])
        .map((p) => ({ ...p, estoque_minimo: Number(p.estoque_minimo) })),
  });
}

export function useMovimentosMkt() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['estoque-mkt', 'movimentos', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<MovimentoMkt[]> =>
      ((unwrap(await supabase.from('mkt_estoque_movimentos' as never)
        .select('id, produto_id, tipo, quantidade, quando, retirado_por, motivo, purchase_request_id')
        .order('quando', { ascending: false })
        .limit(1000)) ?? []) as unknown as MovimentoMkt[])
        .map((m) => ({ ...m, quantidade: Number(m.quantidade) })),
  });
}

/** O Catálogo de Compras, para ligar um item do estoque ao produto que se compra (a compra registrada entra sozinha). */
export function useCatalogoDeCompras() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['estoque-mkt', 'catalogo', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ id: string; name: string }[]> =>
      (unwrap(await supabase.from('compras_produtos').select('id, name').eq('is_active', true).order('name')) ?? []) as { id: string; name: string }[],
  });
}

export type ProdutoMktParaSalvar = Omit<ProdutoMkt, 'id'> & { id?: string };

export function useSalvarProdutoMkt() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...p }: ProdutoMktParaSalvar) => {
      const dados = {
        nome: p.nome.trim(), unidade: p.unidade.trim() || 'un', categoria: p.categoria?.trim() || null,
        local: p.local?.trim() || null, estoque_minimo: p.estoque_minimo, compras_produto_id: p.compras_produto_id || null,
        ativo: p.ativo,
      };
      const tabela = supabase.from('mkt_estoque_produtos' as never);
      expectRows(
        id
          ? await tabela.update(dados as never).eq('id', id).select('id')
          : await tabela.insert(dados as never).select('id'),
        'o produto do estoque',
      );
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estoque-mkt', 'produtos', tenantId] }); toast.success('Produto salvo.'); },
    onError: (e: Error) => toast.error(e.message.includes('mkt_estoque_produto_nome_unico')
      ? 'Já existe um produto com este nome.'
      : e.message.includes('mkt_estoque_um_por_produto_de_compra')
        ? 'Este produto do Catálogo de Compras já está ligado a outro item do estoque.'
        : e.message),
  });
}

export function useLancarNoEstoqueMkt() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      produto_id: string; tipo: 'entrada' | 'saida'; quantidade: number; quando: string;
      retirado_por?: string | null; motivo: string;
    }) => {
      expectRows(
        await supabase.from('mkt_estoque_movimentos' as never)
          .insert({
            produto_id: input.produto_id, tipo: input.tipo, quantidade: input.quantidade, quando: input.quando,
            retirado_por: input.retirado_por || null, motivo: input.motivo.trim(), created_by: user?.id,
          } as never)
          .select('id'),
        'o lançamento no estoque',
      );
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['estoque-mkt', 'movimentos', tenantId] });
      toast.success(v.tipo === 'saida' ? 'Retirada registrada.' : 'Entrada registrada.');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApagarDoEstoqueMkt() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('mkt_estoque_movimentos' as never).delete().eq('id', id).select('id'), 'o lançamento');
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estoque-mkt', 'movimentos', tenantId] }); toast.success('Lançamento apagado.'); },
    onError: (e: Error) => toast.error(`Não apagou: ${e.message}`),
  });
}
