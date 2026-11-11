import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';

/** Uma linha da comissão (`com_comissao`, 20270212721500; regra em docs/regra-comissao.md). */
export interface LinhaDaComissao {
  pessoa_id: string; pessoa_nome: string;
  /** 'carteira' (ESPECIAL, DEMAIS ESTADOS) ou 'crm' (segmento do Atendimento do CRM). */
  tipo: 'carteira' | 'crm'; origem: string; percentual: number;
  base_garantida: number; base_a_confirmar: number; meta: number | null; falta: number | null;
  garantida: number; a_confirmar: number;
}

/** A comissão do período. Quem gere as carteiras recebe todas as pessoas; os outros, só a própria (o banco recorta). */
export function useComissao(de: string, ate: string) {
  const { tenantId, user } = useAuth();
  return useQuery({
    queryKey: ['com_comissao', tenantId, user?.id, de, ate],
    enabled: !!tenantId && !!user?.id && !!de && !!ate,
    queryFn: async (): Promise<LinhaDaComissao[]> =>
      ((unwrap(await supabase.rpc('com_comissao' as never, { p_de: de, p_ate: ate } as never)) ?? []) as unknown as LinhaDaComissao[])
        .map((l) => ({
          ...l, percentual: Number(l.percentual), base_garantida: Number(l.base_garantida), base_a_confirmar: Number(l.base_a_confirmar),
          meta: l.meta === null ? null : Number(l.meta), falta: l.falta === null ? null : Number(l.falta),
          garantida: Number(l.garantida), a_confirmar: Number(l.a_confirmar),
        })),
  });
}

/** Soma a comissão de uma pessoa (todas as origens). */
export function somaDaComissao(linhas: LinhaDaComissao[], pessoaId: string | null | undefined) {
  const dela = linhas.filter((l) => l.pessoa_id === pessoaId);
  return {
    linhas: dela,
    garantida: dela.reduce((s, l) => s + l.garantida, 0),
    a_confirmar: dela.reduce((s, l) => s + l.a_confirmar, 0),
  };
}
