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

  // ── O expediente do setor (decisões do dono, 2026-10-04) ─────────────────────────────────────
  // O relógio do prazo só anda no expediente, de segunda a sexta (salvo se a pausa do fim de semana
  // estiver desligada), fora feriados. Sem linha em `sla_regras_do_setor` = o padrão do setor, o
  // mesmo de `prazo_do_chamado` no banco. Vale para os chamados que nascerem depois.
  const { data: regra } = useQuery({
    queryKey: ['sla-regras-do-setor', tenantId, module],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase
      .from('sla_regras_do_setor')
      .select('id, pausa_fim_de_semana, inicio_expediente, fim_expediente')
      .eq('module', module)
      .maybeSingle()),
  });
  const pausaFimDeSemana = regra?.pausa_fim_de_semana ?? true;
  // Horas nulas numa linha gravada = o dia inteiro (setor 24 horas).
  const expediente: Expediente = regra
    ? { inicio: regra.inicio_expediente?.slice(0, 5) ?? null, fim: regra.fim_expediente?.slice(0, 5) ?? null }
    : expedientePadrao(module);

  /** Grava a regra inteira: a linha nova nunca nasce com as horas em branco sem querer. */
  const salvarRegra = useMutation({
    mutationFn: async (v: { pausa: boolean; expediente: Expediente }) => {
      if (!tenantId) throw new Error('Empresa não identificada.');
      expectRows(await supabase
        .from('sla_regras_do_setor')
        .upsert({
          tenant_id: tenantId, module, pausa_fim_de_semana: v.pausa,
          inicio_expediente: v.expediente.inicio, fim_expediente: v.expediente.fim,
        }, { onConflict: 'tenant_id,module' })
        .select('id'), 'a regra do prazo do setor');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sla-regras-do-setor'] });
      toast.success('Regra do prazo do setor salva');
    },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  return { prazos, isLoading, salvarDoSetor, voltarAoPadrao, pausaFimDeSemana, expediente, salvarRegra };
}

/** Início e fim do expediente ("08:00"). Os dois nulos = o dia inteiro. */
export interface Expediente { inicio: string | null; fim: string | null }

/** O expediente de quem ainda não gravou o seu — repete `expediente_padrao` do banco (20261203050000). */
export function expedientePadrao(module: string): Expediente {
  return ['producao', 'expedicao', 'qualidade'].includes(module)
    ? { inicio: '07:00', fim: '17:00' }
    : { inicio: '08:00', fim: '18:00' };
}

/** Minutos de um dia de expediente (o dia inteiro quando o expediente está em branco). */
export function minutosDoDia(e: Expediente): number {
  if (!e.inicio || !e.fim) return 1440;
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(e.fim) - m(e.inicio);
}

/** Feriados do ano: os nacionais (vêm do banco) e os que a empresa cadastrou. */
export function useFeriados(ano: number) {
  const { tenantId } = useAuth();
  const queryClient = useQueryClient();

  const { data: nacionais = [] } = useQuery({
    queryKey: ['feriados-nacionais', tenantId, ano],
    queryFn: async () => unwrap(await supabase.rpc('feriados_nacionais', { p_ano: ano })) ?? [],
  });

  const { data: daEmpresa = [] } = useQuery({
    queryKey: ['feriados-da-empresa', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async () => unwrap(await supabase
      .from('feriados_da_empresa')
      .select('id, data, nome')
      .gte('data', `${ano}-01-01`)
      .lte('data', `${ano}-12-31`)
      .order('data')) ?? [],
  });

  const invalidar = () => queryClient.invalidateQueries({ queryKey: ['feriados-da-empresa'] });

  const adicionar = useMutation({
    mutationFn: async (v: { data: string; nome: string }) => {
      expectRows(await supabase.from('feriados_da_empresa').insert({ data: v.data, nome: v.nome.trim() }).select('id'),
        'o feriado');
    },
    onSuccess: () => { invalidar(); toast.success('Feriado cadastrado'); },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('feriados_da_empresa').delete().eq('id', id).select('id'), 'o feriado');
    },
    onSuccess: () => { invalidar(); toast.success('Feriado removido'); },
    onError: (e: unknown) => toast.error(mensagemDeErro(e)),
  });

  return { nacionais, daEmpresa, adicionar, remover };
}
