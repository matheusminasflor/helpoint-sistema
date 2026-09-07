import type { PostgrestError } from '@supabase/supabase-js';

/**
 * Regra 1 de escrita (CLAUDE.md): erro do banco não se engole.
 *
 * `const { data } = await supabase...` transforma QUALQUER falha — policy que
 * não casa, coluna que não existe, embed sem FK — em `data = null`, e o hook
 * devolve lista vazia como se estivesse tudo bem. Foi assim que o RH ficou
 * quebrado por meses sem ninguém perceber. `unwrap` lança o erro; dentro de
 * `useQuery` isso vira estado de erro na tela, dentro de `useMutation` vira o
 * `onError`. Nos dois casos, visível.
 */
export function unwrap<T>(result: { data: T; error: PostgrestError | Error | null }): T {
  if (result.error) throw result.error;
  return result.data;
}

/**
 * Regra 2 de escrita: escrita sem `.select()` não prova que gravou.
 *
 * O PostgREST responde 200 com zero linhas quando a policy de UPDATE/INSERT
 * não casa — não é erro. O front comemorava ("Obrigado pela sua avaliação") e
 * nada tinha sido gravado. Use `.select('id')` na escrita e passe o resultado
 * aqui: zero linhas vira erro com nome, em vez de silêncio.
 */
export function expectRows<T>(
  result: { data: T[] | null; error: PostgrestError | Error | null },
  what = 'a gravação',
): T[] {
  const rows = unwrap(result);
  if (!rows || rows.length === 0) {
    throw new Error(`${what} não afetou nenhuma linha — sem permissão, ou o registro não existe mais`);
  }
  return rows;
}
