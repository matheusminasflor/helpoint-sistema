import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';

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

/** Uma porcentagem de comissão (`com_comissao_percentuais`, 20270212722110), em % (0,5 = 0,5%), valendo de um mês em diante. */
export interface PercentualDaComissao {
  id: string; tipo: 'carteira' | 'crm'; origem: string; percentual: number; vale_de: string;
}

/** Todas as porcentagens, com o histórico (a tela mostra a que vale hoje e as que já valeram ou vão valer). */
export function usePercentuaisDaComissao() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['com_comissao_percentuais', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<PercentualDaComissao[]> =>
      ((unwrap(await supabase.from('com_comissao_percentuais' as never)
        .select('id, tipo, origem, percentual, vale_de').order('vale_de', { ascending: false })) ?? []) as unknown as PercentualDaComissao[])
        .map((p) => ({ ...p, percentual: Number(p.percentual) })),
  });
}

/**
 * Grava um % novo valendo a partir de um mês (decisão do dono, 2026-11-12: o histórico não muda). No mesmo mês, troca.
 * Quem pode: a aba "Comissão" do perfil de acesso — a policy confere (`pode_alterar_aba('comercial', 'comissao')`).
 */
export function useSalvarPercentualDaComissao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: Omit<PercentualDaComissao, 'id'>) => {
      expectRows(await supabase.from('com_comissao_percentuais' as never)
        .upsert({ ...p, tenant_id: tenantId } as never, { onConflict: 'tenant_id,tipo,origem,vale_de' }).select('id'), 'a porcentagem');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['com_comissao_percentuais', tenantId] });
      qc.invalidateQueries({ queryKey: ['com_comissao', tenantId] });
      toast.success('Porcentagem salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

/** Apaga uma porcentagem (a que foi lançada errada). */
export function useApagarPercentualDaComissao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('com_comissao_percentuais' as never).delete().eq('id', id).select('id'), 'a porcentagem');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['com_comissao_percentuais', tenantId] });
      qc.invalidateQueries({ queryKey: ['com_comissao', tenantId] });
      toast.success('Porcentagem apagada.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
