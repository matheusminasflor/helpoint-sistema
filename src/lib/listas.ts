import type { PostgrestError } from '@supabase/supabase-js';
import { unwrap } from '@/lib/supabase-result';

/** Teto padrão de uma lista buscada com `buscarComTeto`. */
export const TETO_DE_LISTA = 500;

export interface ConsultaComLimite<T> {
  limit(n: number): PromiseLike<{ data: T[] | null; error: PostgrestError | Error | null }>;
}

/**
 * Busca com teto e diz se cortou.
 *
 * O PostgREST corta toda consulta sem `.limit()` em 1000 linhas, em silêncio
 * — não é erro, é `data.length === 1000` como se fosse a lista inteira. Isso
 * já derrubou os lançamentos mais novos do Financeiro e, no CRM, faria uma
 * lista de 3.000 contatos terminar no "M" sem nenhum aviso.
 *
 * Pôr `.limit(teto)` sozinho troca um corte silencioso por outro. Por isso
 * esta função pede um a mais que o teto (`teto + 1`): se voltar `teto + 1`
 * linhas, é porque havia mais do que o teto, e quem chamou pode avisar a
 * tela em vez de apresentar o pedaço como se fosse o todo.
 */
export async function buscarComTeto<T>(
  query: ConsultaComLimite<T>,
  teto: number = TETO_DE_LISTA,
): Promise<{ linhas: T[]; cortou: boolean }> {
  const linhas = unwrap(await query.limit(teto + 1));
  const cortou = linhas.length > teto;
  return { linhas: cortou ? linhas.slice(0, teto) : linhas, cortou };
}
