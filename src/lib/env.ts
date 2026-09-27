/**
 * As variáveis de ambiente, lidas de um jeito que funciona no Vite E no Next
 * (leva L, passo 1 — 2026-09-26).
 *
 * POR QUE ISTO EXISTE. O sistema lia `import.meta.env.VITE_SUPABASE_URL` em oito
 * arquivos. Isso é sintaxe do **Vite**: ele substitui a expressão pelo valor na
 * hora do build. Sob o Next (webpack), `import.meta.env` é `undefined` — então a
 * URL do Supabase viraria `undefined/functions/v1` e o sistema subiria sem
 * backend, **sem erro de build**. É o pior formato de defeito: o porte
 * "funcionaria" e nada carregaria.
 *
 * Então o seam é este arquivo, e os oito lugares passam por ele. É o mesmo
 * raciocínio de `setores.ts` e `documento.ts`: uma regra, um lugar.
 *
 * COMO LÊ, na ordem:
 *
 *   1. `process.env.NEXT_PUBLIC_*` — o que o Next injeta no cliente;
 *   2. `import.meta.env.VITE_*` — o que o Vite injeta.
 *
 * Os dois acessos são protegidos porque cada um **não existe** no outro mundo:
 * `process` não existe no navegador sob Vite, e `import.meta.env` não existe sob
 * webpack. Sem a proteção, o arquivo derruba a aplicação inteira no import — antes
 * de qualquer tela.
 *
 * O `.env` ganha as duas grafias da mesma chave enquanto os dois builds
 * coexistirem; `.env.example` documenta isso.
 */

function doNext(nome: string): string | undefined {
  try {
    // `process` não existe no navegador sob Vite.
    if (typeof process !== 'undefined' && process.env) {
      return process.env[`NEXT_PUBLIC_${nome}`];
    }
  } catch {
    /* sem process: segue para o Vite */
  }
  return undefined;
}

function doVite(nome: string): string | undefined {
  try {
    // `import.meta.env` é `undefined` sob webpack; o `?.` cobre isso, e o `try`
    // cobre um bundler que reclame da sintaxe.
    const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
    return env?.[`VITE_${nome}`];
  } catch {
    return undefined;
  }
}

/**
 * O valor da variável, sem o prefixo (`SUPABASE_URL`, não `VITE_SUPABASE_URL`).
 * Devolve `undefined` quando não existe em nenhum dos dois — quem chama decide se
 * isso é fatal.
 */
export function env(nome: string): string | undefined {
  return doNext(nome) ?? doVite(nome);
}

/** A URL do projeto Supabase. Sem ela o sistema não tem backend. */
export const SUPABASE_URL = env('SUPABASE_URL');

/** A chave publishable — a única que pode viver em arquivo (ver CLAUDE.md). */
export const SUPABASE_PUBLISHABLE_KEY = env('SUPABASE_PUBLISHABLE_KEY');

/** Endereço das edge functions, montado uma vez. */
export const FUNCTIONS_URL = `${SUPABASE_URL ?? ''}/functions/v1`;
