import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { toLocalISODate } from '@/lib/dates';
import type { Database } from '@/integrations/supabase/types';

/**
 * Metas (OKR-1). Um objetivo, o que se mede embaixo dele, e a medição mês a mês.
 *
 * A empresa escolhe o vocabulário em Configurações (`metas_modo()`): no modo
 * **okr** o que se mede chama "Resultado-chave" e aparece como barra de 0 a
 * 100%; no modo **indicadores** chama "Indicador" e aparece com farol e
 * histórico. É a mesma coisa gravada — trocar de modo não perde nada.
 */

export type MetaRow = Database['public']['Tables']['goals']['Row'];
export type MedicaoRow = Database['public']['Tables']['goal_checkins']['Row'];

export type ModoMetas = 'okr' | 'indicadores';

export interface Meta extends MetaRow {
  /** Nome de quem responde pela meta, já resolvido. */
  responsavel: string | null;
  /** Só nos objetivos: o que se mede embaixo deles. */
  filhos: Meta[];
}

/** Verde bateu, amarelo quase, vermelho longe. `null` = ainda sem medição. */
export type Farol = 'verde' | 'amarelo' | 'vermelho' | null;

export function farolDe(progresso: number | null): Farol {
  if (progresso === null || progresso === undefined) return null;
  if (progresso >= 1) return 'verde';
  if (progresso >= 0.8) return 'amarelo';
  return 'vermelho';
}

/** Como o número se lê na tela: 90%, R$ 1.200, 42. */
export function formatarValor(valor: number, unit: string): string {
  if (unit === 'percent') return `${Number(valor.toFixed(2))}%`;
  if (unit === 'currency') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  return Number(valor.toFixed(2)).toLocaleString('pt-BR');
}

/**
 * O período que uma medição representa, sempre no primeiro dia dele: março de
 * 2026 é `2026-03-01`, o 3º trimestre é `2026-07-01`. Guardar o período e não o
 * dia do lançamento é o que deixa corrigir o número de março em abril sem criar
 * uma segunda linha de março.
 */
export function periodoDe(data: Date, frequency: string): string {
  const d = new Date(data.getFullYear(), data.getMonth(), 1);
  if (frequency === 'quarterly') d.setMonth(Math.floor(d.getMonth() / 3) * 3);
  if (frequency === 'yearly') d.setMonth(0);
  return toLocalISODate(d);
}

export function rotuloPeriodo(iso: string, frequency: string): string {
  const [ano, mes] = iso.split('-').map(Number);
  if (frequency === 'yearly') return String(ano);
  if (frequency === 'quarterly') return `${Math.floor((mes - 1) / 3) + 1}º tri ${ano}`;
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  return `${nomes[mes - 1]}/${ano}`;
}

export function useModoMetas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['metas-modo', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<ModoMetas> => {
      const modo = unwrap(await supabase.rpc('metas_modo'));
      return modo === 'okr' ? 'okr' : 'indicadores';
    },
  });
}

/** Os objetivos da empresa, cada um com o que se mede embaixo dele. */
export function useMetas() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['metas', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Meta[]> => {
      const linhas = unwrap(
        await supabase.from('goals').select('*').order('created_at', { ascending: true }),
      );

      // O nome de quem responde vem numa segunda consulta, e não por junção: a
      // chave estrangeira do responsável é composta (pessoa + empresa), e pedir
      // junção por chave composta é onde o PostgREST fica ambíguo.
      const donos = [...new Set(linhas.map(l => l.assigned_to).filter((x): x is string => !!x))];
      const nomes = new Map<string, string | null>();
      if (donos.length) {
        const perfis = unwrap(
          await supabase.from('profiles').select('id, full_name, email').in('id', donos),
        );
        perfis.forEach(p => nomes.set(p.id, p.full_name || p.email));
      }

      const comNome = linhas.map((l): Meta => ({
        ...l,
        responsavel: l.assigned_to ? nomes.get(l.assigned_to) ?? null : null,
        filhos: [],
      }));

      const porId = new Map(comNome.map(m => [m.id, m]));
      const raizes: Meta[] = [];
      comNome.forEach(m => {
        if (m.parent_goal_id) porId.get(m.parent_goal_id)?.filhos.push(m);
        else raizes.push(m);
      });
      return raizes;
    },
  });
}

/** O histórico de um indicador, do mais antigo para o mais novo (é o gráfico). */
export function useMedicoes(goalId: string | undefined) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['metas-medicoes', tenantId, goalId],
    enabled: !!tenantId && !!goalId,
    queryFn: async (): Promise<MedicaoRow[]> =>
      unwrap(
        await supabase.from('goal_checkins').select('*')
          .eq('goal_id', goalId!).order('period_date', { ascending: true }),
      ),
  });
}

export interface MetaInput {
  id?: string;
  parent_goal_id?: string | null;
  title: string;
  description?: string | null;
  scope: 'company' | 'department' | 'individual';
  department?: string | null;
  assigned_to?: string | null;
  unit?: 'number' | 'percent' | 'currency';
  direction?: 'up' | 'down';
  baseline?: number | null;
  target_value: number;
  frequency: 'monthly' | 'quarterly' | 'yearly';
  start_date: string;
  end_date: string;
  status?: 'active' | 'done' | 'cancelled';
}

export function useSalvarMeta() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MetaInput) => {
      const payload = {
        parent_goal_id: input.parent_goal_id ?? null,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        scope: input.scope,
        department: input.department ?? null,
        assigned_to: input.assigned_to ?? null,
        unit: input.unit ?? 'number',
        direction: input.direction ?? 'up',
        baseline: input.baseline ?? null,
        target_value: input.target_value,
        frequency: input.frequency,
        start_date: input.start_date,
        end_date: input.end_date,
        status: input.status ?? 'active',
      };
      if (input.id) {
        return expectRows(
          await supabase.from('goals').update(payload)
            .eq('id', input.id).eq('tenant_id', tenantId!).select('id'),
          'a meta',
        );
      }
      return expectRows(
        await supabase.from('goals')
          .insert({ ...payload, tenant_id: tenantId!, created_by: user!.id }).select('id'),
        'a meta',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', tenantId] });
      toast.success('Meta salva.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useApagarMeta() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(
        await supabase.from('goals').delete().eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'a meta',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas', tenantId] });
      toast.success('Meta removida.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export interface MedicaoInput {
  goal_id: string;
  period_date: string;
  value: number;
  note?: string | null;
}

/**
 * Lançar o número do período. É `upsert` de propósito: corrigir o número de
 * março é editar a linha de março, não criar uma segunda — o banco tem uma
 * única medição por período e recusaria a segunda.
 */
export function useLancarMedicao() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: MedicaoInput) => {
      return expectRows(
        await supabase.from('goal_checkins')
          .upsert({
            tenant_id: tenantId!,
            goal_id: input.goal_id,
            period_date: input.period_date,
            value: input.value,
            note: input.note?.trim() || null,
            author_id: user!.id,
          }, { onConflict: 'goal_id,period_date' })
          .select('id'),
        'a medição',
      );
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['metas', tenantId] });
      qc.invalidateQueries({ queryKey: ['metas-medicoes', tenantId, input.goal_id] });
      toast.success('Número lançado.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useApagarMedicao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string; goal_id: string }) => {
      expectRows(
        await supabase.from('goal_checkins').delete()
          .eq('id', id).eq('tenant_id', tenantId!).select('id'),
        'a medição',
      );
    },
    onSuccess: (_r, input) => {
      qc.invalidateQueries({ queryKey: ['metas', tenantId] });
      qc.invalidateQueries({ queryKey: ['metas-medicoes', tenantId, input.goal_id] });
      toast.success('Medição removida.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

export function useSalvarModoMetas() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (modo: ModoMetas) => {
      unwrap(await supabase.rpc('tenant_set_config', {
        p_scope: 'metas', p_key: 'modo', p_value: modo,
      }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['metas-modo', tenantId] });
      toast.success('Jeito de acompanhar as metas alterado.');
    },
    onError: (e) => toast.error(traduzir(e)),
  });
}

/** O erro do banco em português de quem usa o sistema. */
function traduzir(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('goal_checkins_um_por_periodo')) return 'Esse período já tem número lançado — edite o que está lá.';
  if (msg.includes('goals_periodo_check')) return 'A meta não pode terminar antes de começar.';
  if (msg.includes('goals_parent_fkey')) return 'O objetivo escolhido não existe mais.';
  if (msg.includes('row-level security') || msg.includes('42501')) return 'Você não tem permissão para isso — fale com um gestor.';
  return msg;
}
