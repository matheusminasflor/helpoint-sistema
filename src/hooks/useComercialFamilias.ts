// Famílias de produto e o histórico do cliente por família (decisão do dono, 2026-10-03).
//
// O banco sugere a família pelo nome (`com_sugerir_familia`, migration 20261202010000) e o
// Comercial confirma ou corrige em Configurações › Famílias de produto. Quem pode gravar é o
// banco que decide (`pode_alterar_aba('comercial', 'familias')`); a tela só esconde o botão.
//
// E o "Informado × Faturado" do Insights (migration 20261202020000): a conta e o corte moram no
// banco; aqui só se lê.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { buscarComTeto } from '@/lib/listas';
import { useAuth } from '@/contexts/AuthContext';
import type { Filial } from '@/types/comercial';

// O PostgREST corta em 1000 sem avisar; 999 + 1 cabe no corte e ainda diz se havia mais.
const TETO = 999;

export interface Familia { id: string; nome: string; ordem: number; ativo: boolean }
export interface ProdutoComFamilia {
  id: string; codigo: string; nome: string; familia_id: string | null; familia_confirmada: boolean;
}

export function useFamilias() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'familias', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Familia[]> =>
      unwrap(await supabase.from('com_familias').select('id, nome, ordem, ativo').order('ordem').order('nome')),
  });
}

export function useProdutosComFamilia() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'produtos-familia', tenantId],
    enabled: !!tenantId,
    queryFn: async () =>
      buscarComTeto<ProdutoComFamilia>(
        supabase.from('com_produtos').select('id, codigo, nome, familia_id, familia_confirmada').order('nome'),
        TETO,
      ),
  });
}

function invalidarFamilias(qc: ReturnType<typeof useQueryClient>, tenantId: string | null) {
  qc.invalidateQueries({ queryKey: ['comercial', 'familias', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'produtos-familia', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'historico-familia', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'compras-cliente', tenantId] });
}

/**
 * Grava a família de um ou mais produtos, JÁ CONFIRMADA. Sem `familiaId`, só confirma a sugestão
 * que já está lá ("Confirmar sugestões"). Toda escrita prova que gravou (regra 2): menos linhas
 * do que produtos pedidos é recusa da policy, e vira erro com nome.
 */
export function useDefinirFamilia() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, familiaId }: { ids: string[]; familiaId?: string }) => {
      if (ids.length === 0) return 0;
      const mudanca = familiaId ? { familia_id: familiaId, familia_confirmada: true } : { familia_confirmada: true };
      const linhas = expectRows(
        await supabase.from('com_produtos').update(mudanca).in('id', ids).select('id'),
        'a família do produto',
      );
      if (linhas.length < ids.length) {
        throw new Error(`Só ${linhas.length} de ${ids.length} produtos foram gravados — sem permissão para os outros.`);
      }
      return linhas.length;
    },
    onSuccess: (n) => {
      invalidarFamilias(qc, tenantId);
      toast.success(n === 1 ? 'Família confirmada.' : `${n} produtos confirmados.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

/** Cria ou renomeia uma família; também liga/desliga (`ativo`). */
export function useSalvarFamilia() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id?: string; nome?: string; ativo?: boolean; ordem?: number }) => {
      const nome = input.nome?.trim();
      if (input.id) {
        const mudanca = { ...(nome ? { nome } : {}), ...(input.ativo !== undefined ? { ativo: input.ativo } : {}) };
        expectRows(
          await supabase.from('com_familias').update({ ...mudanca, updated_at: new Date().toISOString() })
            .eq('id', input.id).select('id'),
          'a família',
        );
        return;
      }
      if (!nome) throw new Error('Dê um nome à família.');
      expectRows(
        await supabase.from('com_familias').insert({ nome, ordem: input.ordem ?? 0, tenant_id: tenantId! }).select('id'),
        'a família',
      );
    },
    onSuccess: () => {
      invalidarFamilias(qc, tenantId);
      toast.success('Família salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

export interface HistoricoFamiliaLinha {
  competencia: string; familia_id: string | null; familia: string; ordem: number; quantidade: number; valor: number;
}

/** Mês × família do cliente, no período da ficha. */
export function useHistoricoPorFamilia(codigo: string, de: string, ate: string, filial: Filial | null) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'historico-familia', tenantId, codigo, de, ate, filial],
    enabled: !!tenantId && !!codigo,
    queryFn: async (): Promise<HistoricoFamiliaLinha[]> => {
      const linhas = unwrap(await supabase.rpc('com_historico_do_cliente', {
        p_codigo: codigo, p_de: de, p_ate: ate, p_filial: filial ?? undefined,
      })) as unknown as Array<Record<string, unknown>>;
      return linhas.map((l) => ({
        competencia: String(l.competencia),
        familia_id: (l.familia_id as string | null) ?? null,
        familia: String(l.familia),
        ordem: Number(l.ordem),
        quantidade: Number(l.quantidade),
        valor: Number(l.valor),
      }));
    },
  });
}

export interface CompraDoCliente {
  emissao: string; documento: string; serie: string; classe: string; produto_codigo: string;
  produto: string; familia: string; quantidade: number; valor: number;
}

/** As compras item a item, a mais recente primeiro. `limite` cresce com o "ver mais". */
export function useComprasDoCliente(codigo: string, de: string, ate: string, filial: Filial | null, limite: number) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'compras-cliente', tenantId, codigo, de, ate, filial, limite],
    enabled: !!tenantId && !!codigo,
    placeholderData: (anterior) => anterior,
    queryFn: async (): Promise<{ linhas: CompraDoCliente[]; total: number }> => {
      const linhas = unwrap(await supabase.rpc('com_compras_do_cliente', {
        p_codigo: codigo, p_de: de, p_ate: ate, p_filial: filial ?? undefined, p_limite: limite,
      })) as unknown as Array<Record<string, unknown>>;
      return {
        total: linhas.length > 0 ? Number(linhas[0].total) : 0,
        linhas: linhas.map((l) => ({
          emissao: String(l.emissao),
          documento: String(l.documento),
          serie: String(l.serie),
          classe: String(l.classe),
          produto_codigo: String(l.produto_codigo),
          produto: String(l.produto),
          familia: String(l.familia),
          quantidade: Number(l.quantidade),
          valor: Number(l.valor),
        })),
      };
    },
  });
}

export interface LinhaLancadoXFaturado {
  vendedor_id: string | null; vendedor_nome: string | null; cliente_codigo: string; cliente_nome: string;
  lancado_ate_corte: number; lancado_previa: number; faturado: number; diferenca: number;
  corte: string | null; compartilhado: boolean;
}

/** Informado × Faturado por (vendedora, cliente) no período. */
export function useLancadoXFaturado(de: string, ate: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'lancado-x-faturado', tenantId, de, ate],
    enabled: !!tenantId,
    queryFn: async (): Promise<{ linhas: LinhaLancadoXFaturado[]; cortou: boolean; corte: string | null }> => {
      const { linhas, cortou } = await buscarComTeto(
        supabase.rpc('com_lancado_x_faturado', { p_de: de, p_ate: ate }),
        TETO,
      );
      const convertidas = linhas.map((l) => ({
        vendedor_id: (l.vendedor_id as string | null) ?? null,
        vendedor_nome: (l.vendedor_nome as string | null) ?? null,
        cliente_codigo: String(l.cliente_codigo),
        cliente_nome: String(l.cliente_nome ?? l.cliente_codigo),
        lancado_ate_corte: Number(l.lancado_ate_corte),
        lancado_previa: Number(l.lancado_previa),
        faturado: Number(l.faturado),
        diferenca: Number(l.diferenca),
        corte: (l.corte as string | null) ?? null,
        compartilhado: Boolean(l.compartilhado),
      }));
      // O corte vem em toda linha; sem linha nenhuma, pergunta direto (a tela diz "nada importado").
      const corte = convertidas[0]?.corte
        ?? (unwrap(await supabase.rpc('com_faturado_importado_ate')) as string | null);
      return { linhas: convertidas, cortou, corte };
    },
  });
}
