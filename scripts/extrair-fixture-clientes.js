// Gera `src/lib/__fixtures__/forteplus-clientes-cp1252.ts` a partir do CSV
// REAL do dono — em base64 dos BYTES originais (Windows-1252), de propósito:
// um arquivo .ts é UTF-8, e colar o texto perderia justamente o acento que o
// teste precisa provar (§3.6 do plano, e a lição da §"O CSV não é UTF-8" no
// prompt da leva).
//
// Uso: node scripts/extrair-fixture-clientes.js <caminho-do-CSV>
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('uso: node scripts/extrair-fixture-clientes.js <caminho-do-CSV>');
  process.exit(1);
}

const bytes = readFileSync(path);
const texto = new TextDecoder('windows-1252').decode(bytes);
const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');

// Linhas escolhidas por conteúdo (índice 1-based dentro do arquivo, cabeçalho = 1):
// cabeçalho; AILSON JOSÉ MARTINS (o nome acentuado que prova a codificação);
// uma linha ATIVO=False; uma com tabela em branco; uma SALÃO REF (a tabela
// que o painel atual grava errado — §3.6); e mais algumas para variar tabela.
const alvo = [
  linhas[0],                                       // cabeçalho
  linhas.find((l) => l.includes('AILSON JOSÉ')),   // acento — prova a codificação
  linhas.find((l) => l.includes('SALÃO REF')),      // a tabela que o painel de hoje grava errado
  linhas[13],                                       // ativo=False (linha 14 do arquivo)
  linhas[111],                                      // tabela em branco (linha 112 do arquivo)
  linhas[1], linhas[2], linhas[3], linhas[4],        // variedade de tabelas (VIP MAIS, ATACADISTA CONDICAO, VIP...)
].filter(Boolean);

if (alvo.length < 6) {
  console.error('não encontrei todas as linhas-alvo no CSV — confira o arquivo de origem.');
  process.exit(1);
}

const cru = alvo.join('\r\n') + '\r\n';
const bytesRecortados = Buffer.from(cru, 'latin1'); // windows-1252 e latin1 coincidem no intervalo usado aqui (letras acentuadas do português)
const b64 = bytesRecortados.toString('base64');

const out = `// GERADO por \`node scripts/extrair-fixture-clientes.js\` a partir do CSV real
// do dono — não editar à mão. Base64 dos bytes originais em Windows-1252: um
// arquivo .ts é UTF-8, e colar o texto aqui perderia o acento que o teste
// precisa provar (regra 4 da leva — o CSV não é UTF-8).
//
// Decodifique assim no teste:
//   Uint8Array.from(atob(FORTEPLUS_CLIENTES_CP1252_BASE64), (c) => c.charCodeAt(0)).buffer
export const FORTEPLUS_CLIENTES_CP1252_BASE64 = '${b64}';
`;

writeFileSync('src/lib/__fixtures__/forteplus-clientes-cp1252.ts', out, 'utf8');
console.log(`Escrevi ${alvo.length} linhas (base64, ${bytesRecortados.length} bytes) em src/lib/__fixtures__/forteplus-clientes-cp1252.ts`);
console.log('linhas escolhidas:', alvo);
