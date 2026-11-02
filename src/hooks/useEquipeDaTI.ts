// TI › Indicadores › bloco "Equipe" (dono, 2026-11-01; migration 20270212150000): o FSENSE e as interrupções. As metas
// são as de `dir_metas_dos_setores` (setor 'ti'), lidas e gravadas pelos hooks da Diretoria.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { META_DA_TI, metaEmVigor } from '@/config/metas-da-ti';
import { useMetasDosSetores } from '@/hooks/useDiretoria';
import { toLocalISODate } from '@/lib/dates';
import type { IntervaloDeDias } from '@/lib/period';
import {
  dentro, diasDoPeriodo, farol, horasParadas, mediaAnteriorDosMesmos, mediaDaEquipe, metaDoPeriodo, periodoAnterior,
  periodoDoIntervalo, piorFarol, porColaborador,
  type DoColaborador, type Farol, type LinhaColada, type Periodo,
} from '@/lib/ti-equipe';

export interface LinhaFsenseDoBanco extends LinhaColada {
  id: string;
  data: string;
  confirmado_em: string | null;
}

export type TipoDeInterrupcao = 'luz' | 'internet' | 'sistema' | 'intranet' | 'outra';
export const TIPOS_DE_INTERRUPCAO: Record<TipoDeInterrupcao, string> = {
  luz: 'Luz', internet: 'Internet', sistema: 'Sistema', intranet: 'Intranet', outra: 'Outra',
};

export interface InterrupcaoDoBanco {
  id: string;
  tipo: TipoDeInterrupcao;
  inicio: string;
  fim: string | null;
  sem_horario: boolean;
  observacao: string | null;
}

/** Tudo de `de` até `ate` (o painel pede do começo do período anterior ao fim do atual). */
export function useFsense({ de, ate }: Periodo) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-fsense', tenantId, de, ate],
    enabled: !!tenantId,
    queryFn: async () => ((unwrap(await supabase.from('ti_fsense' as never)
      .select('id, data, colaborador, horas, trabalho, bloqueada, ocioso, suspenso, confirmado_em')
      .gte('data', de).lt('data', ate).order('data').order('colaborador'))) ?? []) as unknown as LinhaFsenseDoBanco[],
  });
}

/** A última semana lançada antes de `antesDe`: os nomes (e os números, apagados) que a grade de lançamento já traz. */
export function useUltimaSemanaDoFsense(antesDe: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-fsense-ultima', tenantId, antesDe],
    enabled: !!tenantId && !!antesDe,
    queryFn: async () => {
      const linhas = ((unwrap(await supabase.from('ti_fsense' as never)
        .select('id, data, colaborador, horas, trabalho, bloqueada, ocioso, suspenso, confirmado_em')
        .lt('data', antesDe).order('data', { ascending: false }).limit(80))) ?? []) as unknown as LinhaFsenseDoBanco[];
      return linhas.filter((l) => l.data === linhas[0]?.data).sort((a, b) => a.colaborador.localeCompare(b.colaborador));
    },
  });
}

/**
 * As semanas lançadas e ainda a confirmar (o dia que fecha cada uma), para a faixa "Atenção agora" (rodada 2): sem
 * confirmar, a reunião de segunda mostra "Sem dado". Quem não vê a produtividade por pessoa recebe lista vazia (RLS).
 */
export function useSemanasDoFsenseAConfirmar() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-fsense', tenantId, 'a-confirmar'],
    enabled: !!tenantId,
    queryFn: async () => {
      const linhas = ((unwrap(await supabase.from('ti_fsense' as never)
        .select('data').is('confirmado_em', null).order('data', { ascending: false }).limit(200))) ?? []) as unknown as { data: string }[];
      return [...new Set(linhas.map((l) => l.data))];
    },
  });
}

export function useInterrupcoes({ de, ate }: Periodo) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['ti-interrupcoes', tenantId, de, ate],
    enabled: !!tenantId,
    // O fim do dia é local: o período vem em datas do Brasil.
    queryFn: async () => ((unwrap(await supabase.from('ti_interrupcoes' as never)
      .select('id, tipo, inicio, fim, sem_horario, observacao')
      .gte('inicio', new Date(`${de}T00:00:00`).toISOString()).lt('inicio', new Date(`${ate}T00:00:00`).toISOString())
      .order('inicio', { ascending: false }))) ?? []) as unknown as InterrupcaoDoBanco[],
  });
}

function useInvalidar(chave: string) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: [chave, tenantId] });
}

/** Grava a semana colada ou digitada; quem já estava na semana é atualizado e a semana volta a "a confirmar". */
export function useLancarFsense() {
  const invalidar = useInvalidar('ti-fsense');
  return useMutation({
    mutationFn: async ({ data, linhas }: { data: string; linhas: LinhaColada[] }) => {
      const n = unwrap(await supabase.rpc('ti_fsense_lancar' as never, { p_data: data, p_linhas: linhas } as never)) as unknown as number;
      if (n !== linhas.length) throw new Error(`Gravou ${n} de ${linhas.length} linhas. Confira e cole de novo.`);
    },
    onSuccess: invalidar,
  });
}

/** "Confirmar semana": só agora o painel conta essas linhas. O carimbo (quem e quando) é do banco. */
export function useConfirmarFsense() {
  const invalidar = useInvalidar('ti-fsense');
  return useMutation({
    mutationFn: async (data: string) => {
      expectRows(await supabase.from('ti_fsense' as never).update({ confirmado_em: new Date().toISOString() } as never)
        .eq('data', data).is('confirmado_em', null).select('id'), 'a semana');
    },
    onSuccess: invalidar,
  });
}

/** Corrigir uma pessoa à mão (o FSENSE veio errado). Semana confirmada continua confirmada: quem corrige é gente. */
export function useEditarFsense() {
  const invalidar = useInvalidar('ti-fsense');
  return useMutation({
    mutationFn: async ({ id, ...campos }: LinhaColada & { id: string }) => {
      expectRows(await supabase.from('ti_fsense' as never).update({ ...campos, colaborador: campos.colaborador.trim() } as never)
        .eq('id', id).select('id'), 'a linha');
    },
    onSuccess: invalidar,
  });
}

export function useApagarFsense() {
  const invalidar = useInvalidar('ti-fsense');
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('ti_fsense' as never).delete().eq('id', id).select('id'), 'a linha');
    },
    onSuccess: invalidar,
  });
}

export function useSalvarInterrupcao() {
  const { tenantId } = useAuth();
  const invalidar = useInvalidar('ti-interrupcoes');
  return useMutation({
    mutationFn: async (i: Omit<InterrupcaoDoBanco, 'sem_horario' | 'id'> & { id?: string }) => {
      const { id, ...campos } = i;
      const tabela = supabase.from('ti_interrupcoes' as never);
      expectRows(await (id
        ? tabela.update(campos as never).eq('id', id)
        : tabela.insert({ ...campos, tenant_id: tenantId } as never)).select('id'), 'a interrupção');
    },
    onSuccess: invalidar,
  });
}

export function useApagarInterrupcao() {
  const invalidar = useInvalidar('ti-interrupcoes');
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('ti_interrupcoes' as never).delete().eq('id', id).select('id'), 'a interrupção');
    },
    onSuccess: invalidar,
  });
}

// ─── O período inteiro da Equipe, numa conta só (rodada 2, 2026-11-02) ────────────────────────────────
// O bloco da tela, o modo apresentação e o PDF mostram os mesmos números: daqui.

export interface NumeroDaEquipe {
  chave: 'fsense_trabalho' | 'fsense_ocioso' | 'interrupcoes';
  nome: string;
  atual: number | null;
  anterior: number | null;
  /** A meta já no período (a de interrupções é proporcional) e o texto dela: "60%", "0,5 no período (2 por mês)". */
  meta: number | undefined;
  metaTexto: string | undefined;
  farol: Farol;
  extra?: string;
}

const num = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

export function useEquipeDoPeriodo(intervalo: IntervaloDeDias, podeVerEquipe: boolean) {
  const atual = periodoDoIntervalo(intervalo);
  const anterior = periodoAnterior(atual);
  const dias = diasDoPeriodo(atual);
  const fsense = useFsense({ de: anterior.de, ate: atual.ate });
  const interrupcoes = useInterrupcoes({ de: anterior.de, ate: atual.ate });
  const metas = useMetasDosSetores();

  // O FSENSE conta pela semana lançada (o dia que a fecha cai no período) e só depois de confirmada.
  const confirmadas = (fsense.data ?? []).filter((l) => l.confirmado_em);
  const doAtual = porColaborador(confirmadas, atual);
  const doAnterior = porColaborador(confirmadas, anterior);
  const lista = interrupcoes.data ?? [];
  const doPeriodo = (p: Periodo) => lista.filter((i) => dentro(toLocalISODate(new Date(i.inicio)), p));
  const horas = horasParadas(lista, atual);
  const metaTrabalho = metaEmVigor(metas.data, 'fsense_trabalho');
  const metaOcioso = metaEmVigor(metas.data, 'fsense_ocioso');

  const numero = (chave: NumeroDaEquipe['chave'], nome: string, valor: number | null, antes: number | null, extra?: string): NumeroDaEquipe => {
    const def = META_DA_TI[chave];
    const mensal = metaEmVigor(metas.data, chave);
    const meta = metaDoPeriodo(mensal, dias, !!def.proporcional);
    const fmt = (v: number) => (def.percentual ? `${num(v)}%` : num(v));
    const metaTexto = meta === undefined ? undefined
      : def.proporcional && meta !== mensal ? `${num(meta)} no período (${num(mensal!)}${def.unidade})` : fmt(meta);
    return { chave, nome, atual: valor, anterior: antes, meta, metaTexto, farol: farol(valor, meta, def.sentido, def.percentual), extra };
  };

  const numeros: NumeroDaEquipe[] = [
    ...(podeVerEquipe ? [
      numero('fsense_trabalho', '% Trabalho da equipe', mediaDaEquipe(doAtual, 'trabalho'), mediaAnteriorDosMesmos(doAtual, doAnterior, 'trabalho')),
      numero('fsense_ocioso', '% Ocioso da equipe', mediaDaEquipe(doAtual, 'ocioso'), mediaAnteriorDosMesmos(doAtual, doAnterior, 'ocioso')),
    ] : []),
    numero('interrupcoes', 'Interrupções', doPeriodo(atual).length, doPeriodo(anterior).length, horas > 0 ? `${num(horas)} h paradas` : undefined),
  ];

  /** O status da pessoa: o pior entre trabalho e ocioso (2026-11-02: 3% de trabalho não fica verde). */
  const statusDa = (c: DoColaborador) => piorFarol(farol(c.trabalho, metaTrabalho, 'mais', true), farol(c.ocioso, metaOcioso, 'menos', true));

  return {
    doAtual, doAnterior, numeros, statusDa, metaTrabalho, metaOcioso,
    lancamentos: (fsense.data ?? []).filter((l) => dentro(l.data, atual)),
    interrupcoesDoPeriodo: doPeriodo(atual),
  };
}
