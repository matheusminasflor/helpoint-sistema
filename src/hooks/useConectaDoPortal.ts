// Portal do Distribuidor, parte 3 (etapa 6; migration 20270204030000): o que vem do Conecta Venda — os catálogos da
// tabela dele, os pedidos e os carrinhos pelo CNPJ, e o catálogo da Minasflor com o preço dele. Tudo lido pelo robô
// `conecta-sync` a cada 10 minutos; o pedido mesmo é feito no catálogo do Conecta (decisão do dono, 2026-10-21).
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { rpc } from '@/hooks/useDistribuidor';

export type ContaConecta = 'MF' | 'INBRAS';
export interface CatalogoDoPortal { conta: ContaConecta; descricao: string | null; link: string; tabela_preco: string | null }
export interface ItemConecta { referencia: string | null; produto: string | null; variacao: string | null; quantidade: number | null; valor_unitario: number | null }
export interface PedidoConecta {
  conta: ContaConecta; id: number; situacao: string | null; valor_pagamento: number | null; link: string | null;
  criado_em: string | null; situacao_em: string | null; produtos: ItemConecta[];
}
export interface SacolaConecta { conta: ContaConecta; id: number; valor_total: number | null; link: string | null; sacola_em: string | null; produtos: ItemConecta[] }

/** As situações do Conecta, em palavras (pedidos/editar, lido em 2026-10-25). */
export const SITUACAO_DO_PEDIDO: Record<string, string> = {
  em_aberto: 'Recebido', em_analise: 'Em análise', em_producao: 'Separando', pago: 'Pago', enviado: 'Enviado',
  entregue: 'Entregue', finalizado: 'Finalizado', cancelado: 'Cancelado',
};

const usePortalQuery = <T>(nome: string, funcao: string) => {
  const { user } = useAuth();
  return useQuery({ queryKey: ['distribuidor', 'portal', nome, user?.id], enabled: !!user?.id, queryFn: () => rpc<T>(funcao, {}) });
};

export const useCatalogosDoPortal = () => usePortalQuery<CatalogoDoPortal[]>('catalogos', 'dist_catalogos');
export const useMeusPedidosConecta = () => usePortalQuery<PedidoConecta[]>('pedidos-conecta', 'dist_meus_pedidos');
export const useMinhasSacolas = () => usePortalQuery<SacolaConecta[]>('sacolas', 'dist_minhas_sacolas');
