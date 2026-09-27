// O cliente do Supabase — a única porta do navegador para o banco.
//
// O cabeçalho dizia "automatically generated. Do not edit it directly", herdado
// do Lovable. Não é mais verdade: `npm run types:gen` regenera `types.ts`, não
// este arquivo, e a leitura do ambiente passou a vir de `@/lib/env` na leva L
// (porte para Next, passo 1) — `import.meta.env` é sintaxe do Vite e vira
// `undefined` sob o Next, o que faria a URL virar `undefined/...` e o sistema
// subir sem backend, sem erro de build.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from '@/lib/env';

// Falha ALTO e cedo, em vez de deixar o `createClient` receber `undefined` e a
// primeira consulta morrer com "Failed to fetch" — que não diz o que fazer.
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Faltam as variáveis do Supabase. No Vite: VITE_SUPABASE_URL e ' +
    'VITE_SUPABASE_PUBLISHABLE_KEY. No Next: as mesmas com prefixo NEXT_PUBLIC_. ' +
    'Ver .env.example.',
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
