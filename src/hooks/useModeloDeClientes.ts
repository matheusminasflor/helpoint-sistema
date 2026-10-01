// O modelo único de clientes (2026-10-01): baixar o cadastro no modelo e importar de volta.
// A função do banco é uma só (`com_importar_modelo_de_clientes`): com `confirmar: false` é a PRÉVIA,
// com `true` grava — a mesma conta nas duas, então o que a tela mostra antes é o que acontece depois.
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { mensagemDeErro } from '@/hooks/useComercialImport';
import type { Json } from '@/integrations/supabase/types';
import type { ClienteDoModeloUnico, LinhaDoModeloUnico } from '@/lib/modelo-de-clientes';
import type { ResultadoDaCarteira } from '@/hooks/useComercialCarteirasMetas';

/** Todos os clientes do cadastro, nas colunas do modelo (o PostgREST devolve 1000 por vez). */
export async function buscarClientesDoModeloUnico(): Promise<ClienteDoModeloUnico[]> {
  const PAGINA = 1000;
  const todos: ClienteDoModeloUnico[] = [];
  for (let de = 0; ; de += PAGINA) {
    const pagina = unwrap(await supabase
      .from('com_clientes')
      .select('codigo, ativo, razao_social, fantasia, tabela_preco, documento, endereco, cep, cidade, estado, email, telefone, carteira, grupo')
      .order('codigo')
      .range(de, de + PAGINA - 1)) as ClienteDoModeloUnico[];
    todos.push(...pagina);
    if (pagina.length < PAGINA) return todos;
  }
}

export interface MudancaDoCliente {
  codigo: string;
  nome: string;
  campos: { campo: string; de: string | null; para: string }[];
}

/** O que a função devolve — os mesmos números na prévia e na gravação. */
export interface ResultadoDoModelo {
  novos: { codigo: string; nome: string }[];
  mudam: MudancaDoCliente[];
  /** Código novo sem razão social: não dá para criar o cliente. */
  sem_razao: string[];
  /** CNPJ/CPF que já é de outro código: fica de fora. */
  documentos_em_conflito: string[];
  tabelas_alteradas: number;
  carteiras: ResultadoDaCarteira[];
  /** A pessoa não gere carteiras: CARTEIRA e GRUPO foram ignoradas. */
  carteiras_ignoradas: boolean;
}

export function useImportarModeloDeClientes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      arquivo: string;
      linhas: LinhaDoModeloUnico[];
      responsaveis: { carteira: string; responsavel: string }[];
      confirmar: boolean;
    }) => unwrap(await supabase.rpc('com_importar_modelo_de_clientes', {
      p_file_name: input.arquivo,
      p_linhas: input.linhas as unknown as Json,
      p_responsaveis: input.responsaveis as unknown as Json,
      p_confirmar: input.confirmar,
    })) as unknown as ResultadoDoModelo,
    onSuccess: (r, input) => {
      if (!input.confirmar) return;
      // Cliente, tabela, ficha e carteira aparecem no Cadastro, nas Carteiras, nos Lançamentos, no
      // painel e no histórico de importações — todas as chaves começam com 'comercial'.
      qc.invalidateQueries({ queryKey: ['comercial'] });
      toast.success(`${r.novos.length} ${r.novos.length === 1 ? 'cliente novo' : 'clientes novos'} e `
        + `${r.mudam.length} ${r.mudam.length === 1 ? 'atualizado' : 'atualizados'}.`);
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });
}
