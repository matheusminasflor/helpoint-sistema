// Converte o JSON que o MCP do Supabase devolve em `generate_typescript_types`
// no arquivo `src/integrations/supabase/types.ts`.
//
//   node scripts/tipos-do-banco.mjs <caminho-do-json>
//
// Existe porque o resultado da ferramenta vem grande demais para caber na
// conversa, e o que ela entrega é `{"types": "<o arquivo inteiro>"}`.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origem = process.argv[2];
if (!origem) {
  console.error('uso: node scripts/tipos-do-banco.mjs <caminho-do-json>');
  process.exit(1);
}

const bruto = JSON.parse(readFileSync(origem, 'utf8'));
const tipos = bruto?.types;
if (typeof tipos !== 'string' || !tipos.includes('export type Database')) {
  console.error('o arquivo não parece ser a resposta de generate_typescript_types');
  process.exit(1);
}

const destino = resolve('src/integrations/supabase/types.ts');
writeFileSync(destino, tipos.endsWith('\n') ? tipos : `${tipos}\n`, 'utf8');
console.log(`tipos gravados em ${destino} (${tipos.length} caracteres)`);
