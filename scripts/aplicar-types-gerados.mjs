// Script de uso único (executor, correção da lacuna 1/2 da leva
// metas-e-carteiras): o MCP do Supabase devolve os tipos gerados como JSON
// ({"types": "..."}), grande demais para o limite de tokens da ferramenta —
// por isso precisa ser lido do arquivo salvo e regravado como TypeScript de
// verdade, com newlines reais. `node -e` está bloqueado pelo hook; este
// arquivo é o script exigido no lugar dele.
//
// Uso: node scripts/aplicar-types-gerados.mjs <arquivo-json-de-entrada> <destino.ts>
import { readFileSync, writeFileSync } from 'node:fs';

const [entrada, destino] = process.argv.slice(2);
if (!entrada || !destino) {
  console.error('uso: node scripts/aplicar-types-gerados.mjs <entrada.json> <destino.ts>');
  process.exit(1);
}

const bruto = readFileSync(entrada, 'utf8');
const { types } = JSON.parse(bruto);
if (!types) {
  console.error('campo "types" não encontrado no JSON de entrada.');
  process.exit(1);
}
writeFileSync(destino, types, 'utf8');
console.log(`gravado: ${destino} (${types.length} caracteres)`);
