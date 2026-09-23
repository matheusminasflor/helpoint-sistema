// As duas mutações de importação do Painel Comercial (L6a). Toda escrita
// passa pela RPC, que já faz a conferência (§4.3) e devolve o resumo — o
// retorno é conferido (regra 2 das cinco, do lado do RPC): se voltar
// `gravadas: 0`, a tela não pode dizer "importado com sucesso".
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useAuth } from '@/contexts/AuthContext';
import type { ItemVenda, ClienteCadastro } from '@/lib/comercial-import';
import type { Filial, ResumoCompetencia, ResumoImportacaoClientes, ResumoImportacaoVendas } from '@/types/comercial';
import type { Json } from '@/integrations/supabase/types';

// Exportada: `useComercialCashback.ts` reaproveita em vez de duplicar
// (achado 6.5 da auditoria da L6c).
export function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function invalidarPainel(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'faturamento', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'painel-totais', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'ranking-clientes', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'cfop-fora-da-curva', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'importacoes', tenantId] });
  // Achado 10.2 da auditoria: faltava esta — sem invalidar, o aviso de
  // "competência já importada" (`useCompetenciasImportadas`) ficava velho
  // depois de uma importação, e a próxima prévia não via o mês recém-gravado.
  qc.invalidateQueries({ queryKey: ['comercial', 'competencias-importadas', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'anos-com-venda', tenantId] });
}

// ═══════════════════════════════════════════════════════════════════════════
// Frente 1 — importar qualquer período. A importação de vendas virou três
// tempos (início reserva a competência → N lotes gravam na espera → fim só
// publica se a espera bater exatamente com o esperado), para um arquivo de
// centenas de milhares de linhas não precisar caber numa chamada só.
// `ImportarVendasDialog` é quem orquestra os três; nenhum dos três dá toast
// de erro por conta própria — quem decide o que fazer com a falha (parar,
// oferecer descartar) é a tela, não o hook.
// ═══════════════════════════════════════════════════════════════════════════

export interface IniciarImportacaoVendasInput {
  filial: Filial;
  fileName: string;
  linhasLidas: number;
  descartes: Record<string, number>;
  competencias: ResumoCompetencia[];
  itensEsperados: number;
  substituir: boolean;
  totalImpresso: number | null;
}

/** Abre a importação e reserva a(s) competência(s); devolve o id que os lotes e o fim usam. */
export function useIniciarImportacaoVendas() {
  return useMutation({
    mutationFn: async (input: IniciarImportacaoVendasInput): Promise<string> =>
      unwrap(await supabase.rpc('com_importar_vendas_inicio', {
        p_filial: input.filial,
        p_file_name: input.fileName,
        p_linhas_lidas: input.linhasLidas,
        p_descartes: input.descartes as unknown as Json,
        p_competencias: input.competencias as unknown as Json,
        p_itens_esperados: input.itensEsperados,
        p_substituir: input.substituir,
        p_total_impresso: input.totalImpresso,
      })) as unknown as string,
  });
}

export interface ImportarLoteVendasInput {
  importacaoId: string;
  itens: ItemVenda[];
}

/** Um lote de itens, gravado na espera — nunca em `com_vendas_itens` direto. */
export function useImportarLoteVendas() {
  return useMutation({
    mutationFn: async (input: ImportarLoteVendasInput): Promise<number> => {
      const gravadas = unwrap(await supabase.rpc('com_importar_vendas_lote', {
        p_importacao_id: input.importacaoId,
        p_itens: input.itens as unknown as Json,
      })) as unknown as number;
      if (gravadas !== input.itens.length) {
        throw new Error(`Gravei ${gravadas} itens no lote mas o lote tinha ${input.itens.length}.`);
      }
      return gravadas;
    },
  });
}

/** Fecha a importação: só publica se a espera bater com o esperado (§3 do plano). */
export function useFinalizarImportacaoVendas() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string): Promise<ResumoImportacaoVendas> => {
      const resumo = unwrap(await supabase.rpc('com_importar_vendas_fim', {
        p_importacao_id: importacaoId,
      })) as unknown as ResumoImportacaoVendas;
      if (!resumo || resumo.gravadas === 0) {
        throw new Error('A importação não gravou nenhum item — nada foi salvo.');
      }
      return resumo;
    },
    onSuccess: () => invalidarPainel(qc, tenantId ?? undefined),
  });
}

/** Cancela uma importação "em_andamento": devolve a competência reservada, sem publicar nada. */
export function useDescartarImportacaoVendas() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (importacaoId: string): Promise<void> => {
      unwrap(await supabase.rpc('com_descartar_importacao', { p_id: importacaoId }));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comercial', 'competencias-importadas', tenantId] });
      qc.invalidateQueries({ queryKey: ['comercial', 'importacoes', tenantId] });
    },
  });
}

export interface ImportarClientesInput {
  fileName: string;
  clientes: ClienteCadastro[];
}

export function useImportarClientes() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportarClientesInput): Promise<ResumoImportacaoClientes> => {
      const resumo = unwrap(await supabase.rpc('com_importar_clientes', {
        p_file_name: input.fileName,
        p_linhas: input.clientes as unknown as Json,
      })) as unknown as ResumoImportacaoClientes;
      // Achado 10.1 da auditoria: a irmã (vendas) já exige `gravadas > 0`;
      // esta aceitava `{criados: 0, atualizados: 0}` como sucesso. Mesma
      // regra 2 das cinco, do lado da RPC: escrita sem linha afetada não é
      // "importado com sucesso".
      if (!resumo || (resumo.criados === 0 && resumo.atualizados === 0)) {
        throw new Error('A importação não criou nem atualizou nenhum cliente — nada foi salvo.');
      }
      return resumo;
    },
    onSuccess: () => invalidarPainel(qc, tenantId ?? undefined),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
