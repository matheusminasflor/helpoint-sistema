// Carteiras e metas do Comercial (L6d). Ver
// .scratch/plano-l6d-metas-e-carteiras.md e
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §14/§15.
//
// A conta mora no banco (regra do CLAUDE.md): realizado por carteira,
// cobertura e peso vêm de `com_metas_x_realizado`; a conciliação, de
// `com_conciliacao`. `com_metas` e `com_carteiras` são pequenas (uma dúzia de
// linhas por tenant) — leitura direta pela tabela, sem RPC.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type { Carteira, Conciliacao, MetaComercial, MetaXRealizado, Filial } from '@/types/comercial';

/** As carteiras do tenant — dado do dono, pequeno, sem teto. */
export function useCarteiras() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'carteiras', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Carteira[]> =>
      unwrap(await supabase
        .from('com_carteiras')
        .select('id, nome, ativa')
        .order('nome')) as unknown as Carteira[],
  });
}

/** As metas de um ano — inclui a linha total (carteira_id nulo) e uma por carteira/mês que já foi definida. */
export function useMetasDoAno(ano: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas', tenantId, ano],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaComercial[]> =>
      unwrap(await supabase
        .from('com_metas')
        .select('id, ano, mes, carteira_id, valor')
        .eq('ano', ano)) as unknown as MetaComercial[],
  });
}

/** Por (competência, carteira) — realizado, meta, cobertura e peso, os 12 meses do ano. */
export function useMetasXRealizado(ano: number, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'metas-x-realizado', tenantId, ano, filial],
    enabled: !!tenantId,
    queryFn: async (): Promise<MetaXRealizado[]> =>
      unwrap(await supabase.rpc('com_metas_x_realizado', {
        p_ano: ano, p_filial: filial,
      })) as unknown as MetaXRealizado[],
  });
}

/**
 * O quadro de conciliação (§15) — só calcula quando `apresentacao` é
 * informado (o diretor a digita; a tela nunca a deriva). `enabled` some
 * junto: sem o valor, não há por que consultar.
 */
export function useConciliacao(ano: number, filial: Filial | null, apresentacao: number | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'conciliacao', tenantId, ano, filial, apresentacao],
    enabled: !!tenantId,
    queryFn: async (): Promise<Conciliacao> => {
      const linhas = unwrap(await supabase.rpc('com_conciliacao', {
        p_ano: ano, p_filial: filial, p_apresentacao: apresentacao,
      })) as unknown as Conciliacao[];
      return linhas[0] ?? { venda_liquida: 0, bonificacao: 0, soma: 0, diferenca: null };
    },
  });
}

function invalidarCarteirasEMetas(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'carteiras', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'metas-x-realizado', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'buscar-clientes', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'clientes-a-trabalhar', tenantId] });
}

export interface AtribuirCarteiraInput {
  carteiraId: string | null;
  codigos?: string[];
  tabelaBase?: string;
}

/** Atribuição em lote (§4 da migration) — por código ou por tabela de preço, nunca derivada sozinha. */
export function useAtribuirCarteira() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AtribuirCarteiraInput): Promise<number> =>
      unwrap(await supabase.rpc('com_atribuir_carteira', {
        p_carteira_id: input.carteiraId,
        p_codigos: input.codigos ?? null,
        p_tabela_base: input.tabelaBase ?? null,
      })) as unknown as number,
    onSuccess: (quantidade) => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success(`${quantidade} ${quantidade === 1 ? 'cliente' : 'clientes'} atualizado(s).`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

export interface SalvarMetaInput {
  id?: string;
  ano: number;
  mes: number;
  carteiraId: string | null;
  valor: number;
}

/**
 * Cria ou edita uma meta. `com_metas_unica` é um índice de EXPRESSÃO
 * (`coalesce(carteira_id, sentinela)`) — o `.upsert()` do PostgREST só
 * mira coluna, não expressão, então o caminho é o mesmo de `com_faixas_
 * cashback` (`useSalvarFaixaCashback`): sabendo o `id` (a tela já leu a
 * meta existente), edita; sem `id`, insere. Escrita provada com
 * `.select('id')` + `expectRows` (regra 2 das cinco).
 */
export function useSalvarMeta() {
  const { tenantId, user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SalvarMetaInput): Promise<string> => {
      if (input.id) {
        expectRows(
          await supabase.from('com_metas').update({ valor: input.valor }).eq('id', input.id).select('id'),
          'a meta',
        );
        return input.id;
      }
      const rows = expectRows(
        await supabase.from('com_metas').insert({
          tenant_id: tenantId!,
          ano: input.ano,
          mes: input.mes,
          carteira_id: input.carteiraId,
          valor: input.valor,
          definida_por: user?.id ?? null,
        }).select('id'),
        'a meta',
      );
      return rows[0].id;
    },
    onSuccess: () => {
      invalidarCarteirasEMetas(qc, tenantId ?? undefined);
      toast.success('Meta salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
