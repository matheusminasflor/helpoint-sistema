// As metas dos Indicadores, por setor (`metas_degraus`; TI na rodada 3, 2026-11-02; Marketing em 2026-11-03,
// 20270212220000). Sem meta gravada, vale a padrão de `config/metas-da-ti`.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import type { Degrau, DegrausGravados } from '@/config/metas-da-ti';

export type SetorDasMetas = 'ti' | 'marketing';

export function useMetasDaTI(setor: SetorDasMetas = 'ti') {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['metas-degraus', tenantId, setor],
    enabled: !!tenantId,
    queryFn: async (): Promise<DegrausGravados> => {
      const linhas = ((unwrap(await supabase.from('metas_degraus' as never)
        .select('indicador, a_partir_de, meta').eq('setor', setor).order('a_partir_de'))) ?? []) as unknown as { indicador: string; a_partir_de: string; meta: number }[];
      const porIndicador: DegrausGravados = new Map();
      for (const l of linhas) porIndicador.set(l.indicador, [...(porIndicador.get(l.indicador) ?? []), { a_partir_de: l.a_partir_de, meta: Number(l.meta) }]);
      return porIndicador;
    },
  });
}

/** Grava a escada inteira de um indicador; lista vazia volta à meta padrão. A função devolve quantos degraus gravou. */
export function useSalvarEscadaDaTI(setor: SetorDasMetas = 'ti') {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ indicador, degraus }: { indicador: string; degraus: Degrau[] }) => {
      const n = unwrap(await supabase.rpc('metas_salvar' as never, { p_setor: setor, p_indicador: indicador, p_degraus: degraus } as never)) as unknown as number;
      if (n !== degraus.length) throw new Error(`Gravou ${n} de ${degraus.length} degraus. Confira e salve de novo.`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['metas-degraus', tenantId, setor] }),
  });
}
