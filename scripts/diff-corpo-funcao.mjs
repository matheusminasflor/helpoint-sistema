// Compara o CORPO de uma função SQL entre duas migrations, ignorando
// comentários e linhas em branco.
//
// Por que existe: recriar uma função para acrescentar ou tirar uma coluna
// exige `drop` + `create` (o tipo de linha muda). Copiar o corpo à mão é
// onde o erro entra — em 2026-09-25 eu REESCREVI `com_ficha_indicadores` de
// cabeça, a partir de uma leitura parcial do arquivo, e apaguei a regra dos
// meses cobertos pelo importado. Seis asserções acusaram, mas só no CI.
//
// Esta conferência é mecânica e não depende de eu lembrar do que li: a
// diferença impressa tem de ser EXATAMENTE o que eu pretendia mudar.
//
// Uso: node scripts/diff-corpo-funcao.mjs <origem.sql> <nova.sql> <nome_da_funcao>
import { readFileSync } from 'node:fs';

const [origem, nova, funcao] = process.argv.slice(2);
if (!origem || !nova || !funcao) {
  console.error('uso: node scripts/diff-corpo-funcao.mjs <origem.sql> <nova.sql> <nome_da_funcao>');
  process.exit(1);
}

/** O corpo da função, da linha do `create` até o `$$;` que a fecha, sem comentários. */
function corpo(arquivo, nome) {
  const linhas = readFileSync(arquivo, 'utf8').split('\n');
  const inicio = linhas.findIndex((l) => l.startsWith(`create or replace function public.${nome}(`));
  if (inicio === -1) return null;
  const fim = linhas.findIndex((l, i) => i > inicio && /^\$(function)?\$;/.test(l.trim()));
  if (fim === -1) return null;
  return linhas
    .slice(inicio, fim + 1)
    .filter((l) => !/^\s*--/.test(l) && l.trim() !== '');
}

const a = corpo(origem, funcao);
const b = corpo(nova, funcao);
if (!a) { console.error(`não achei ${funcao} em ${origem}`); process.exit(2); }
if (!b) { console.error(`não achei ${funcao} em ${nova}`); process.exit(2); }

// Diff de linhas simples: basta para o que esta ferramenta responde — "o que
// mudou além do que eu queria?". Linha presente de um lado só aparece com o
// sinal; ordem preservada pelo índice, porque o corpo é copiado, não
// reordenado.
const so = (x, y) => x.filter((l) => !y.includes(l));
const removidas = so(a, b);
const acrescentadas = so(b, a);

if (removidas.length === 0 && acrescentadas.length === 0) {
  console.log(`${funcao}: IDÊNTICO ao original (ignorando comentários)`);
  process.exitCode = 0;
} else {
  console.log(`${funcao}: ${removidas.length} linha(s) fora, ${acrescentadas.length} dentro`);
  for (const l of removidas) console.log(`  - ${l.trim()}`);
  for (const l of acrescentadas) console.log(`  + ${l.trim()}`);
  process.exitCode = 1;
}
