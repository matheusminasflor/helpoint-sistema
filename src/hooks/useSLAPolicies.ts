import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows } from '@/lib/supabase-result';

export interface SLAPolicy {
  id: string;
  tenant_id: string;
  /** Nulo = o padrão da empresa. Preenchido = o prazo próprio daquele setor (LEVA P). */
  module: string | null;
  name: string;
  priority: string;
  first_response_time: number;
  resolution_time: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const PRIORIDADES_SLA = ['critical', 'high', 'medium', 'low'] as const;

/** Uma prioridade, com o padrão da empresa e — se houver — o prazo próprio do setor. */
export interface PrazoDaPrioridade {
  priority: string;
  padrao: SLAPolicy | undefined;
  doSetor: SLAPolicy | undefined;
}

/**
 * Prazos de atendimento. Desde a LEVA P (2026-09-28) cada setor pode ter o próprio; o que não
 * tiver usa o padrão da empresa — é a mesma escolha que `calculate_sla_due_at` faz no banco
 * quando o chamado nasce. Sem `module`, a tela é a do padrão da empresa.
 */
export function useSLAPolicies(module?: string | null) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ['sla-policies', tenantId],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase
      .from('sla_policies')
      .select('*')
      .order('resolution_time', { ascending: true })) as SLAPolicy[],
  });

  const prazos: PrazoDaPrioridade[] = PRIORIDADES_SLA.map((priority) => ({
    priority,
    padrao: policies.find((p) => p.priority === priority && p.module === null),
    doSetor: module ? policies.find((p) => p.priority === priority && p.module === module) : undefined,
  }));

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['sla-policies'] });

  const updatePolicy = useMutation({
    mutationFn: async (updates: {
      id: string;
      name?: string;
      first_response_time?: number;
      resolution_time?: number;
      is_active?: boolean;
    }) => {
      const { id, ...rest } = updates;
      expectRows(await supabase.from('sla_policies').update(rest).eq('id', id).select('id'), 'o prazo');
    },
    onSuccess: () => { invalidar(); toast.success('Prazo atualizado'); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Dá ao setor um prazo próprio para a prioridade — cria a linha dele, ou atualiza. */
  const salvarDoSetor = useMutation({
    mutationFn: async (v: { priority: string; first_response_time: number; resolution_time: number; nome: string }) => {
      if (!module || !tenantId) throw new Error('Setor não informado.');
      const existente = policies.find((p) => p.priority === v.priority && p.module === module);
      if (existente) {
        expectRows(await supabase.from('sla_policies')
          .update({ first_response_time: v.first_response_time, resolution_time: v.resolution_time, is_active: true })
          .eq('id', existente.id).select('id'), 'o prazo do setor');
      } else {
        expectRows(await supabase.from('sla_policies').insert({
          tenant_id: tenantId,
          module,
          name: v.nome,
          priority: v.priority as never,
          first_response_time: v.first_response_time,
          resolution_time: v.resolution_time,
        }).select('id'), 'o prazo do setor');
      }
    },
    onSuccess: () => { invalidar(); toast.success('Prazo do setor salvo'); },
    onError: (e: Error) => toast.error(e.message),
  });

  /** Tira o prazo próprio: o setor volta a usar o padrão da empresa. */
  const voltarAoPadrao = useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('sla_policies').delete().eq('id', id).select('id'), 'o prazo do setor');
    },
    onSuccess: () => { invalidar(); toast.success('O setor voltou ao prazo padrão'); },
    onError: (e: Error) => toast.error(e.message),
  });

  return { policies, prazos, isLoading, updatePolicy, salvarDoSetor, voltarAoPadrao };
}
