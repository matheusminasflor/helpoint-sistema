// Cashback e a ficha do cliente (L6c). Ver docs/instrucoes-painel-comercial.md
// (INSTRUCOES v7) §12. Leitura pelas RPCs (a conta mora no banco: soma,
// faixa e apuração nunca são refeitas aqui — regra do CLAUDE.md), escrita
// direta em `com_faixas_cashback` (a grade é dado do dono, editável pela
// tela de configuração).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { buscarComTeto, type ConsultaComLimite } from '@/lib/listas';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type {
  CashbackIndicadores, CashbackMensal, CashbackResumo, CriterioCurva, FaixaCashback, FichaCliente, Filial,
} from '@/types/comercial';

/**
 * A apuração mês a mês — a base da "evolução mês a mês" da seção. Passa por
 * `buscarComTeto`: cliente × mês pode passar de `TETO_DE_LISTA` (500) linhas
 * numa empresa com muitos clientes ativos, e o PostgREST corta em silêncio
 * (§4.7 do plano do Painel Comercial) — achado 6.3 da auditoria da L6c: o
 * comentário dizia "1000", e o teto real é 500.
 */
export function useCashbackMensal(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cashback-mensal', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: CashbackMensal[]; cortou: boolean }> =>
      buscarComTeto<CashbackMensal>(supabase.rpc('com_cashback_mensal', {
        p_ano: ano, p_filial: filial,
      }) as unknown as ConsultaComLimite<CashbackMensal>),
  });
}

/**
 * Um cliente por linha, resumido no recorte — "com direito" e "não
 * atingiram" vêm daqui, filtrados na tela. Mesmo teto da mensal: uma linha
 * por cliente ainda pode passar de 1000 numa empresa grande.
 */
export function useCashbackResumo(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cashback-resumo', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: CashbackResumo[]; cortou: boolean }> =>
      buscarComTeto<CashbackResumo>(supabase.rpc('com_cashback_resumo', {
        p_ano: ano, p_filial: filial,
      }) as unknown as ConsultaComLimite<CashbackResumo>),
  });
}

/** Os cinco indicadores do topo, já somados no banco (achado 3 da auditoria da L6c: `clientes_sem_tabela` entrou separado de `clientes_sem_programa`). */
export function useCashbackIndicadores(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'cashback-indicadores', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<CashbackIndicadores> => {
      const linhas = unwrap(await supabase.rpc('com_cashback_indicadores', {
        p_ano: ano, p_filial: filial,
      })) as unknown as CashbackIndicadores[];
      return linhas[0] ?? {
        cashback_total: 0, comprado_total: 0, percentual: null,
        clientes_nao_atingiram: 0, clientes_sem_programa: 0, clientes_sem_tabela: 0,
      };
    },
  });
}

/** A grade de cashback — pequena (uma dúzia de linhas por tabela), sem teto: é a "legenda das faixas" e o que a configuração edita. */
export function useFaixasCashback() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'faixas-cashback', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<FaixaCashback[]> =>
      unwrap(await supabase
        .from('com_faixas_cashback')
        .select('id, tabela_base, valor_minimo, percentual')
        .order('tabela_base')
        .order('valor_minimo')) as unknown as FaixaCashback[],
  });
}

/**
 * A ficha do cliente completa (Frente 5a, §11) — nove blocos num `jsonb`
 * só. `filial` recalcula a ficha inteira para aquela empresa — `null`
 * continua sendo "as duas" (achado 4 da auditoria da L6c: ao filtrar por
 * empresa, o painel INTEIRO recalcula, fichas inclusive — §1a/§11).
 * `criterio` é o seletor do TOPO da página (mix por faixa e a curva do
 * cliente seguem ele) — não um segundo seletor dentro da ficha.
 */
export function useFichaCliente(
  codigo: string | null, de: string, ate: string, filial: Filial | null, criterio: CriterioCurva,
) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'ficha-cliente', tenantId, codigo, de, ate, filial, criterio],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<FichaCliente> =>
      unwrap(await supabase.rpc('com_ficha_cliente', {
        p_codigo: codigo!, p_de: de, p_ate: ate, p_filial: filial, p_criterio: criterio,
      })) as unknown as FichaCliente,
  });
}

function invalidarCashback(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'faixas-cashback', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'cashback-mensal', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'cashback-resumo', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'cashback-indicadores', tenantId] });
}

export interface FaixaCashbackInput {
  id?: string;
  tabela_base: string;
  valor_minimo: number;
  percentual: number;
}

/** Cria ou edita um degrau da grade. Escrita provada com `.select('id')` + `expectRows` (regra 2 das cinco). */
export function useSalvarFaixaCashback() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: FaixaCashbackInput): Promise<string> => {
      const row = { tabela_base: input.tabela_base, valor_minimo: input.valor_minimo, percentual: input.percentual };
      if (input.id) {
        expectRows(await supabase.from('com_faixas_cashback').update(row).eq('id', input.id).select('id'), 'o degrau');
        return input.id;
      }
      // `tenant_id` é injetado pelo trigger (molde de `crm_price_tables`),
      // não por default de coluna — o tipo gerado do Supabase só reconhece
      // default de coluna como opcional, então o insert precisa do valor
      // explícito aqui; o trigger e a RLS continuam sendo quem decide.
      const rows = expectRows(
        await supabase.from('com_faixas_cashback').insert({ ...row, tenant_id: tenantId! }).select('id'),
        'o degrau',
      );
      return rows[0].id;
    },
    onSuccess: () => {
      invalidarCashback(qc, tenantId ?? undefined);
      toast.success('Grade de cashback salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

/** Apaga um degrau da grade. */
export function useApagarFaixaCashback() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      expectRows(await supabase.from('com_faixas_cashback').delete().eq('id', id).select('id'), 'o degrau');
    },
    onSuccess: () => {
      invalidarCashback(qc, tenantId ?? undefined);
      toast.success('Degrau removido.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
