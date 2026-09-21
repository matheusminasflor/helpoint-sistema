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
import type { Filial, ResumoImportacaoClientes, ResumoImportacaoVendas } from '@/types/comercial';
import type { Json } from '@/integrations/supabase/types';

function mensagemDeErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function invalidarPainel(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  qc.invalidateQueries({ queryKey: ['comercial', 'faturamento', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'ranking-clientes', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'cfop-fora-da-curva', tenantId] });
  qc.invalidateQueries({ queryKey: ['comercial', 'importacoes', tenantId] });
}

export interface ImportarVendasInput {
  filial: Filial;
  fileName: string;
  linhasLidas: number;
  descartes: Record<string, number>;
  itens: ItemVenda[];
  substituir: boolean;
}

export function useImportarVendas() {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: ImportarVendasInput): Promise<ResumoImportacaoVendas> => {
      const resumo = unwrap(await supabase.rpc('com_importar_vendas', {
        p_filial: input.filial,
        p_file_name: input.fileName,
        p_linhas_lidas: input.linhasLidas,
        p_descartes: input.descartes as unknown as Json,
        p_itens: input.itens as unknown as Json,
        p_substituir: input.substituir,
      })) as unknown as ResumoImportacaoVendas;
      if (!resumo || resumo.gravadas === 0) {
        throw new Error('A importação não gravou nenhum item — nada foi salvo.');
      }
      return resumo;
    },
    onSuccess: () => invalidarPainel(qc, tenantId ?? undefined),
    onError: (e) => toast.error(mensagemDeErro(e)),
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
    mutationFn: async (input: ImportarClientesInput): Promise<ResumoImportacaoClientes> =>
      unwrap(await supabase.rpc('com_importar_clientes', {
        p_file_name: input.fileName,
        p_linhas: input.clientes as unknown as Json,
      })) as unknown as ResumoImportacaoClientes,
    onSuccess: () => invalidarPainel(qc, tenantId ?? undefined),
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
