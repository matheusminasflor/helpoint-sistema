import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';

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
export type PrioridadeSLA = (typeof PRIORIDADES_SLA)[number];

/** Uma prioridade, com o padrão da empresa e — se houver — o prazo próprio do setor. */
export interface PrazoDaPrioridade {
  priority: PrioridadeSLA;
  padrao: SLAPolicy | undefined;
  doSetor: SLAPolicy | undefined;
}

/**
 * Prazos de atendimento de um setor. Desde a LEVA P (2026-09-28) cada setor pode ter o próprio; o
 * que não tiver usa o padrão da empresa — é a mesma escolha que `calculate_sla_due_at` faz no banco
 * quando o chamado nasce. O padrão em si não se edita pela tela desde 2026-09-29 (o dono tirou a
 * tela separada por redundante); ele é o ponto de partida de todo setor.
 */
export function useSLAPolicies(module: string) {
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
    // `is_active`, como `calculate_sla_due_at`: linha do setor desligada não vale, e a tela não pode
    // dizer "Do setor" para um prazo que o banco ignora (revisão de 2026-09-29).
    doSetor: policies.find((p) => p.priority === priority && p.module === module && p.is_active),
  }));

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['sla-policies'] });

  /** Dá ao setor um prazo próprio para a prioridade — cria a linha dele, ou atualiza. */
  const salvarDoSetor = useMutation({
    mutationFn: async (v: { priority: PrioridadeSLA; first_response_time: number; resolution_time: number; nome: string }) => {
      if (!tenantId) throw new Error('Empresa não identificada.');
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
          priority: v.priority,
          first_response_time: v.first_response_time,
          resolution_time: v.resolution_time,
        }).select('id'), 'o prazo do setor');
      }
    },
    onSuccess: () => { invalidar(); toast.success('Prazo do setor salvo'); },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  /** Tira o prazo próprio: o setor volta a usar o padrão da empresa. */
  const voltarAoPadrao = useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('sla_policies').delete().eq('id', id).select('id'), 'o prazo do setor');
    },
    onSuccess: () => { invalidar(); toast.success('O setor voltou ao prazo padrão'); },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  // ── Sábado e domingo no prazo (decisão do dono, 2026-10-04) ──────────────────────────────────
  // Sem linha em `sla_regras_do_setor` = pausa LIGADA (o padrão do dono): é o mesmo `coalesce(…,
  // true)` que `prazo_do_chamado` faz no banco. A chave vale para os chamados que nascerem depois.
  const { data: regra } = useQuery({
    queryKey: ['sla-regras-do-setor', tenantId, module],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase
      .from('sla_regras_do_setor')
      .select('id, pausa_fim_de_semana')
      .eq('module', module)
      .maybeSingle()),
  });
  const pausaFimDeSemana = regra?.pausa_fim_de_semana ?? true;

  const mudarPausaFimDeSemana = useMutation({
    mutationFn: async (pausa: boolean) => {
      if (!tenantId) throw new Error('Empresa não identificada.');
      expectRows(await supabase
        .from('sla_regras_do_setor')
        .upsert({ tenant_id: tenantId, module, pausa_fim_de_semana: pausa }, { onConflict: 'tenant_id,module' })
        .select('id'), 'a regra do prazo do setor');
    },
    onSuccess: (_d, pausa) => {
      queryClient.invalidateQueries({ queryKey: ['sla-regras-do-setor'] });
      toast.success(pausa ? 'Sábado e domingo não contam mais no prazo' : 'Sábado e domingo voltam a contar no prazo');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  return { prazos, isLoading, salvarDoSetor, voltarAoPadrao, pausaFimDeSemana, mudarPausaFimDeSemana };
}
