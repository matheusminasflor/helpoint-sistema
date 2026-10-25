// O Comercial acompanhando os distribuidores (Portal do Distribuidor, etapa 6; migration 20270204030000): o painel
// com um número de cada coisa, e a ficha com os salões (sem o contato — LGPD), o estoque, os pedidos e os carrinhos.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { rpc } from '@/hooks/useDistribuidor';
import type { LinhaDoEstoque, Salao } from '@/hooks/usePortalDoDistribuidor';
import type { PedidoConecta, SacolaConecta } from '@/hooks/useConectaDoPortal';

export interface DistribuidorNoPainel {
  id: string; razao_social: string; cidade: string | null; uf: string | null; com_cliente_codigo: string | null; tabela: string | null;
  saloes: number; clientes: number; testando: number; vendas_30_dias: number; ultima_venda: string | null;
  ultimo_pedido_em: string | null; ultimo_pedido_situacao: string | null; carrinhos_abertos: number | null; produtos_acabando: number;
}

export function usePainelDeDistribuidores() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'distribuidores', tenantId], enabled: !!tenantId,
    queryFn: () => rpc<DistribuidorNoPainel[]>('dist_painel_comercial', {}),
  });
}

export function useFichaDoDistribuidor(id: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'distribuidor', tenantId, id], enabled: !!tenantId && !!id,
    queryFn: async () => {
      const d = unwrap(await supabase.from('dist_distribuidores' as never).select('id, razao_social, cnpj, cidade, uf, com_cliente_codigo')
        .eq('id' as never, id as never).maybeSingle()) as unknown as { id: string; razao_social: string; cnpj: string; cidade: string | null; uf: string | null; com_cliente_codigo: string | null } | null;
      if (!d) return null;
      const saloes = unwrap(await supabase.from('dist_saloes' as never).select('*').eq('distribuidor_id' as never, id as never)
        .order('nome')) as unknown as Salao[];
      const estoque = await rpc<LinhaDoEstoque[]>('dist_estoque', { p_distribuidor: id });
      const pedidos = unwrap(await supabase.from('conecta_pedidos' as never)
        .select('conta, id, situacao, valor_pagamento, link, criado_em, situacao_em, produtos').eq('cnpj' as never, d.cnpj as never)
        .order('criado_em', { ascending: false }).limit(20)) as unknown as PedidoConecta[];
      const sacolas = unwrap(await supabase.from('conecta_sacolas' as never)
        .select('conta, id, valor_total, link, sacola_em, produtos').eq('cnpj' as never, d.cnpj as never)
        .gt('sacola_em' as never, new Date(Date.now() - 30 * 86400000).toISOString() as never)
        .order('sacola_em', { ascending: false }).limit(10)) as unknown as SacolaConecta[];
      // A mesma regra do painel (`dist_painel_comercial`): carrinho dos últimos 30 dias que não teve pedido depois dele.
      const abertas = sacolas.filter((s) => !pedidos.some((p) => p.criado_em && s.sacola_em && p.criado_em > s.sacola_em));
      return { distribuidor: d, saloes, estoque, pedidos, sacolas: abertas };
    },
  });
}
