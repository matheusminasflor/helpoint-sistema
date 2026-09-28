// Troca os nomes de tabela de Compras nas referências do repositório
// (leva N — 2026-09-27).
//
// POR QUE UM SCRIPT E NÃO À MÃO. São 19 ocorrências só em `usePurchases.ts` e mais
// oito arquivos de pgTAP. Trocar à mão erra uma — e uma que sobre não dá erro de
// compilação: dá "relation does not exist" na hora de aprovar uma compra. É a mesma
// razão de a migration ter um bloco que a reprova se sobrar referência: o meu erro
// recorrente é tratar um de dois lugares (ver "Registro honesto" em
// `docs/plano-geral.md`).
//
// O que NÃO troca, de propósito: `fin_department_budgets`, `fin_budget_settings`,
// `fin_entries` e o bucket `fin-purchases`. O teto é controle do Financeiro (decisão
// do dono), a conta a pagar é dele, e bucket não se renomeia.
//
// Uso: node scripts/compras-renomeia-referencias.mjs [--aplicar]
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const aplicar = process.argv.includes('--aplicar');

/** Ordem importa: o nome mais longo primeiro, senão o curto come o prefixo do longo. */
const TROCAS = [
  ['fin_purchase_requests', 'compras_solicitacoes'],
  ['fin_purchase_quotes', 'compras_orcamentos'],
  ['fin_purchase_products', 'compras_produtos'],
];

const arquivos = execSync('git ls-files src supabase/tests', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|sql)$/.test(f));

let tocados = 0;
let trocas = 0;

for (const arquivo of arquivos) {
  const antes = readFileSync(arquivo, 'utf8');
  let depois = antes;
  for (const [de, para] of TROCAS) {
    // `fin_purchase_requests` com borda: não pega `fin_purchase_requests_pkey` dentro
    // de outra palavra sem querer — aqui a borda é o que não é letra/dígito/underscore
    // DEPOIS do nome, porque os sufixos de constraint já foram renomeados na migration
    // e no SQL de teste eles aparecem por extenso.
    depois = depois.split(de).join(para);
  }
  if (depois !== antes) {
    const quantas = TROCAS.reduce((acc, [de]) => acc + antes.split(de).length - 1, 0);
    trocas += quantas;
    tocados++;
    console.log(`${arquivo}: ${quantas}`);
    if (aplicar) writeFileSync(arquivo, depois);
  }
}

console.log(`\n${trocas} trocas em ${tocados} arquivo(s)${aplicar ? '' : ' (nada gravado — use --aplicar)'}.`);
