// Diretrizes comerciais (decisão do dono, 2026-10-04; migration 20261203010000).
//
// A apuração e a trava do "nunca duas vezes" moram no banco: `com_diretrizes_apuracao` diz quem
// atingiu, quem está perto e o que já foi concedido; a concessão grava a quantidade e o valor que o
// BANCO apurou (gatilho), e o `unique` impede a segunda. Quem pode gravar também é o banco que
// decide; a tela só esconde o botão.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { buscarComTeto } from '@/lib/listas';
import { useAuth } from '@/contexts/AuthContext';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import type { LinhaDaApuracao, linhaDaDiretriz } from '@/lib/diretrizes-comerciais';

// O PostgREST corta em 1000 sem avisar; 999 + 1 cabe no corte e ainda diz se havia mais.
const TETO = 999;

export interface Diretriz {
  id: string; nome: string; ativo: boolean; familia_id: string | null; produto_codigo: string | null;
  quantidade_minima: number; tabelas: string[] | null; beneficio_tipo: string; beneficio_valor: number | null;
  bonificacao_produto_codigo: string | null; bonificacao_quantidade: number | null; condicao: string | null;
  vigencia_inicio: string; vigencia_fim: string | null;
}

const CAMPOS = `id, nome, ativo, familia_id, produto_codigo, quantidade_minima, tabelas, beneficio_tipo,
  beneficio_valor, bonificacao_produto_codigo, bonificacao_quantidade, condicao, vigencia_inicio, vigencia_fim`;

export function useDiretrizes() {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'diretrizes', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<Diretriz[]> =>
      unwrap(await supabase.from('com_diretrizes').select(CAMPOS).order('ativo', { ascending: false }).order('nome')),
  });
}

/** Cria ou edita. `dados` vem de `linhaDaDiretriz` (só os campos do tipo escolhido). */
export function useSalvarDiretriz() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      dados?: ReturnType<typeof linhaDaDiretriz> & { tabelas: string[] | null; condicao: string | null };
      ativo?: boolean;
    }) => {
      const mudanca = { ...(input.dados ?? {}), ...(input.ativo !== undefined ? { ativo: input.ativo } : {}) };
      if (input.id) {
        expectRows(await supabase.from('com_diretrizes').update(mudanca).eq('id', input.id).select('id'), 'a diretriz');
        return;
      }
      if (!input.dados) throw new Error('Preencha a diretriz.');
      expectRows(
        await supabase.from('com_diretrizes').insert({ ...input.dados, ativo: input.ativo ?? true, tenant_id: tenantId! }).select('id'),
        'a diretriz',
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comercial', 'diretrizes', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'diretrizes-apuracao', tenantId] });
      toast.success('Diretriz salva.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

/**
 * Quem atingiu, quem está perto e o que foi concedido, nos meses inteiros do período. `cliente`
 * recorta para a ficha do cliente.
 */
export function useApuracaoDiretrizes(de: string, ate: string, cliente?: string) {
  const { tenantId } = useAuth();
  return useQuery({
    queryKey: ['comercial', 'diretrizes-apuracao', tenantId, de, ate, cliente ?? null],
    enabled: !!tenantId && !!de && !!ate,
    queryFn: async (): Promise<{ linhas: LinhaDaApuracao[]; cortou: boolean }> => {
      const { linhas, cortou } = await buscarComTeto<Record<string, unknown>>(
        supabase.rpc('com_diretrizes_apuracao', { p_de: de, p_ate: ate, p_cliente: cliente }) as never,
        TETO,
      );
      const n = (v: unknown) => (v === null || v === undefined ? null : Number(v));
      const s = (v: unknown) => (v === null || v === undefined ? null : String(v));
      return {
        cortou,
        linhas: linhas.map((l) => ({
          diretriz_id: String(l.diretriz_id),
          diretriz: String(l.diretriz),
          cliente_codigo: String(l.cliente_codigo),
          cliente_nome: String(l.cliente_nome ?? l.cliente_codigo),
          tabela_base: s(l.tabela_base),
          competencia: String(l.competencia),
          quantidade: Number(l.quantidade),
          minimo: Number(l.minimo),
          falta: Number(l.falta),
          atingiu: Boolean(l.atingiu),
          perto: Boolean(l.perto),
          valor_comprado: Number(l.valor_comprado),
          beneficio_tipo: String(l.beneficio_tipo),
          beneficio_valor: n(l.beneficio_valor),
          valor_beneficio: n(l.valor_beneficio),
          bonificacao_produto_codigo: s(l.bonificacao_produto_codigo),
          bonificacao_quantidade: n(l.bonificacao_quantidade),
          condicao: s(l.condicao),
          concessao_id: s(l.concessao_id),
          concedido: Boolean(l.concedido),
          concedido_em: s(l.concedido_em),
          concedido_por_nome: s(l.concedido_por_nome),
          pedido: s(l.pedido),
          observacao: s(l.observacao),
        })),
      };
    },
  });
}

/**
 * Quem marca concedido e desfaz: a caixinha "Conceder benefício" do Comercial (2026-10-04) — a
 * mesma conta de `com_pode_conceder_diretriz`, nas policies de `com_diretrizes_concessoes`.
 */
export function usePodeConcederDiretriz() {
  return useDepartmentPermissions('comercial').canComoOBanco('diretrizes_beneficio', 'conceder');
}

function invalidarApuracao(qc: ReturnType<typeof useQueryClient>, tenantId: string | null) {
  qc.invalidateQueries({ queryKey: ['comercial', 'diretrizes-apuracao', tenantId] });
}

/** Marca concedido. Quantidade, valor, quem e quando são do banco; daqui vão só o pedido e a observação. */
export function useConcederDiretriz() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      diretriz_id: string; cliente_codigo: string; competencia: string; pedido: string; observacao: string;
    }) => {
      expectRows(
        await supabase.from('com_diretrizes_concessoes').insert({
          tenant_id: tenantId!,
          diretriz_id: input.diretriz_id,
          cliente_codigo: input.cliente_codigo,
          competencia: input.competencia,
          pedido: input.pedido.trim() || null,
          observacao: input.observacao.trim() || null,
        }).select('id'),
        'a concessão',
      );
    },
    onSuccess: () => {
      invalidarApuracao(qc, tenantId);
      toast.success('Marcado como concedido.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}

/** Desfaz uma concessão marcada por engano: o cliente volta para "a conceder". */
export function useDesfazerConcessao() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (concessaoId: string) => {
      expectRows(
        await supabase.from('com_diretrizes_concessoes').delete().eq('id', concessaoId).select('id'),
        'a concessão',
      );
    },
    onSuccess: () => {
      invalidarApuracao(qc, tenantId);
      toast.success('Concessão desfeita.');
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
