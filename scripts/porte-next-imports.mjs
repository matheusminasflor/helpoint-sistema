// Acrescenta o import de `@/lib/env` nos arquivos que passaram a usar
// `FUNCTIONS_URL` ou `env(...)` (leva L, passo 1 — 2026-09-26).
//
// Por que um script e não sete edições à mão: o import entra depois do ÚLTIMO
// import existente do arquivo, e achar essa linha à mão em sete arquivos é onde
// se erra. Aqui a regra é uma e o script diz o que fez.
import { readFileSync, writeFileSync } from 'node:fs';

const ARQUIVOS = [
  ['src/components/crm/PaymentProvidersTab.tsx', ['FUNCTIONS_URL']],
  ['src/components/dashboard/RequesterAnalysisSheet.tsx', ['FUNCTIONS_URL']],
  ['src/hooks/useAISecretary.ts', ['FUNCTIONS_URL']],
  ['src/hooks/useLyraChat.ts', ['FUNCTIONS_URL']],
  ['src/pages/crm/FormularioPublico.tsx', ['FUNCTIONS_URL']],
  ['src/pages/AutomacaoEditor.tsx', ['FUNCTIONS_URL']],
  ['src/pages/Login.tsx', ['env']],
];

for (const [arquivo, nomes] of ARQUIVOS) {
  const texto = readFileSync(arquivo, 'utf8');
  if (texto.includes("from '@/lib/env'")) {
    console.log(`  já tinha  ${arquivo}`);
    continue;
  }
  const linhas = texto.split('\n');
  // O último import do topo: a partir dele o arquivo é código, e o import novo
  // entra logo depois para não separar o bloco.
  //
  // A ARMADILHA, e ela já cobrou: import de várias linhas (`import {` … `} from
  // '…'`). "A última linha que começa com `import`" é a linha de ABERTURA, e o
  // import novo entrava no meio da lista — dois arquivos quebraram assim. O que
  // fecha o import é a linha com `from '…'`, e é ela que conta.
  let ultimo = -1;
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i];
    if (/^import\s.*\bfrom\s+['"]/.test(linha) || /^}\s*from\s+['"]/.test(linha)) {
      ultimo = i;
      continue;
    }
    // Dentro de um import aberto, ou linha vazia: segue.
    if (/^import\s/.test(linha) || /^\s/.test(linha) || linha.trim() === '') continue;
    // Código de verdade: o bloco de imports acabou.
    if (ultimo >= 0) break;
  }
  if (ultimo < 0) {
    console.log(`  SEM IMPORT  ${arquivo} — põe à mão`);
    continue;
  }
  linhas.splice(ultimo + 1, 0, `import { ${nomes.join(', ')} } from '@/lib/env';`);
  writeFileSync(arquivo, linhas.join('\n'));
  console.log(`  import posto  ${arquivo}`);
}
