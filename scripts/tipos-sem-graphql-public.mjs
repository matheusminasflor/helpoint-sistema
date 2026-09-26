// Tira do `types.ts` gerado o bloco `graphql_public`, que a versão atual do
// `supabase gen types` acrescenta e o sistema não usa.
//
// Por que existe: `npm run types:gen` sobrescreve o arquivo inteiro, e esta
// versão do CLI passou a incluir o schema `graphql_public` (29 linhas). Nada no
// `src/` chama GraphQL — o bloco entra em todo diff de tipos e faz uma mudança de
// uma linha parecer uma mudança de trinta. Eu apaguei isso à mão três vezes na
// mesma sessão; na terceira, virou script.
//
// Não é cosmético: diff que mistura ruído com conteúdo é diff que ninguém lê, e
// o `types.ts` é o arquivo onde se confere se uma coluna entrou ou saiu do banco.
//
// Uso: node scripts/tipos-sem-graphql-public.mjs [caminho]
import { readFileSync, writeFileSync } from 'node:fs';

const arquivo = process.argv[2] ?? 'src/integrations/supabase/types.ts';
const original = readFileSync(arquivo, 'utf8');

// Duas aparições, e as duas com indentação conhecida: a do `Database` (2 espaços,
// fechada por `  }`) e a do `Constants` (2 espaços, fechada por `  },`).
let texto = original
  .replace(/^ {2}graphql_public: \{\n(?: {2,}.*\n|\n)*? {2}\}\n(?= {2}public: \{)/m, '')
  .replace(/^ {2}graphql_public: \{\n {4}Enums: \{\},\n {2}\},\n(?= {2}public: \{)/m, '');

if (texto === original) {
  console.log('nada a tirar — o arquivo já está sem o bloco graphql_public.');
  process.exitCode = 0;
} else if (texto.includes('graphql_public')) {
  console.error('tirei uma aparição e sobrou outra — o formato do gerador mudou, confira à mão.');
  process.exitCode = 1;
} else {
  writeFileSync(arquivo, texto);
  const linhas = original.split('\n').length - texto.split('\n').length;
  console.log(`bloco graphql_public removido (${linhas} linhas).`);
}
