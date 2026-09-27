// Troca cor de paleta fixa por token semântico — só onde o significado é
// inequívoco (leva J, 2026-09-26).
//
// POR QUE UM SCRIPT E NÃO `sed` À MÃO: são 425 ocorrências em 84 arquivos, e o
// `sed` não sabe dizer o que mudou. Aqui cada troca é contada e impressa, então o
// diff é conferível — foi varredura sem conferência que quebrou o CI #111.
//
// O FUNDO PÁLIDO DE TARJA (`bg-amber-50`, `bg-emerald-100`, `bg-rose-100`) vira o
// `badge-*` da mesma família, e isso FUNCIONA junto com a troca do texto por uma
// razão de CSS, não por sorte: `.badge-warning` vive em `@layer components` e
// `text-status-warning` é utilitário, que vem depois — então o badge dá o fundo e o
// utilitário dá a cor do texto, sempre nessa ordem. Sem os dois, o modo escuro
// ficaria com texto claro sobre fundo pálido, ilegível.
//
// O QUE ESTE SCRIPT NÃO TOCA, de propósito:
//
//   - **gradiente** (`from-purple-500 to-pink-500`): é elemento de marca, não
//     status. Virar `bg-status-*` apagaria o desenho;
//   - **cor de gráfico** e as escalas do funil, que já têm token próprio
//     (`--chart-*`, `--stage-*`) e pedem decisão caso a caso.
//
// Uso: node scripts/cor-fixa-converter.mjs [--aplicar]
//      sem `--aplicar`, só mostra o que faria.
import { readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const aplicar = process.argv.includes('--aplicar');

/**
 * Cada entrada: as classes fixas que viram aquele token.
 *
 * Os tons vão de 200 a 900 na mesma família porque, no claro, `text-red-500` e
 * `text-red-700` são a mesma intenção com pesos diferentes — e o token resolve o
 * peso pelo tema. Manter os dois tons seria manter a decisão que o token toma.
 */
// Os tons são gerados, e não listados à mão: era assim que sobravam 203 avisos —
// eu havia escrito `text-red-600` e esquecido `text-red-900`. A família inteira,
// de 50 a 950, vira o mesmo token, porque a intenção é a família e o peso é
// decisão do tema.
const TONS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const TONS_PALIDOS = [50, 100];
const TONS_SOLIDOS = TONS.filter((t) => !TONS_PALIDOS.includes(t));

const comTons = (tons) => (prefixo, ...cores) =>
  cores.flatMap((c) => tons.map((t) => `${prefixo}-${c}-${t}`));

const familia = comTons(TONS);
const PALIDO = comTons(TONS_PALIDOS);
const SOLIDO = comTons(TONS_SOLIDOS);
// Borda tem outro corte: até 300 é decoração, 400+ é o aviso.
const FRACO = comTons([50, 100, 200, 300]);
const FORTE = comTons([400, 500, 600, 700, 800, 900, 950]);

const MAPA = [
  ['text-status-danger', familia('text', 'red', 'rose')],
  ['text-status-warning', familia('text', 'amber', 'yellow', 'orange')],
  ['text-status-success', familia('text', 'green', 'emerald', 'lime', 'teal')],
  ['text-status-info', familia('text', 'blue', 'sky', 'cyan', 'indigo')],
  ['text-primary', familia('text', 'violet', 'purple', 'fuchsia', 'pink')],
  ['text-muted-foreground', familia('text', 'gray', 'slate', 'zinc', 'neutral', 'stone')],
  // `fill-*` é ícone preenchido (a estrela da avaliação) — mesma intenção.
  ['fill-status-warning', familia('fill', 'amber', 'yellow', 'orange')],
  ['fill-status-danger', familia('fill', 'red', 'rose')],
  ['fill-status-success', familia('fill', 'green', 'emerald')],
  ['ring-status-warning', familia('ring', 'amber', 'yellow', 'orange')],
  ['ring-status-danger', familia('ring', 'red', 'rose')],

  // FUNDO: o tom separa duas intenções diferentes, e é a única divisão que
  // importa aqui.
  //
  //   pálido (50, 100)  → tarja: o par `badge-*`, que traz fundo E texto
  //   sólido (200+)     → bolinha, chip, barra: `bg-status-*`
  //
  // Sem essa divisão, uma tarja pálida viraria um bloco sólido vermelho com texto
  // vermelho dentro.
  ['badge-danger', PALIDO('bg', 'red', 'rose')],
  ['badge-warning', PALIDO('bg', 'amber', 'yellow', 'orange')],
  ['badge-success', PALIDO('bg', 'green', 'emerald', 'lime', 'teal')],
  ['badge-info', PALIDO('bg', 'blue', 'sky', 'cyan', 'indigo')],
  ['badge-purple', PALIDO('bg', 'purple', 'violet', 'fuchsia', 'pink')],
  ['badge-neutral', PALIDO('bg', 'gray', 'slate', 'zinc', 'neutral', 'stone')],

  ['bg-status-danger', SOLIDO('bg', 'red', 'rose')],
  ['bg-status-warning', SOLIDO('bg', 'amber', 'yellow', 'orange')],
  ['bg-status-success', SOLIDO('bg', 'green', 'emerald', 'lime', 'teal')],
  ['bg-status-info', SOLIDO('bg', 'blue', 'sky', 'cyan', 'indigo')],
  ['bg-primary', SOLIDO('bg', 'purple', 'violet', 'fuchsia', 'pink')],
  ['bg-muted', SOLIDO('bg', 'gray', 'slate', 'zinc', 'neutral', 'stone')],

  // BORDA: o corte é em 300, e não em 100 como no fundo.
  //
  //   até 300  → decoração da tarja: `border-border`, que é o padrão que o resto
  //              do sistema já usa (`ImportarVendasDialog`, `CfopForaDaCurva`)
  //   400+     → a borda É o aviso (campo inválido, cartão destacado):
  //              `border-status-*`
  //
  // Isto nasceu de uma inconsistência da minha própria varredura: na primeira
  // passada `border-amber-200` virou `border-border` e na segunda
  // `border-red-200` virou `border-status-danger`. Duas tarjas iguais ficaram
  // diferentes — e a regra tinha de ser uma.
  ['border-status-danger', FORTE('border', 'red', 'rose')],
  ['border-status-warning', FORTE('border', 'amber', 'yellow', 'orange')],
  ['border-status-success', FORTE('border', 'green', 'emerald')],
  ['border-border', [
    ...FRACO('border', 'red', 'rose', 'amber', 'yellow', 'orange', 'green', 'emerald',
      'blue', 'sky', 'indigo', 'purple', 'violet', 'pink'),
    ...familia('border', 'gray', 'slate', 'zinc', 'neutral', 'stone'),
    ...familia('border', 'blue', 'sky', 'cyan', 'indigo', 'purple', 'violet', 'fuchsia', 'pink'),
  ]],
];

/**
 * Normaliza o que a passada anterior deixou torto: numa tarja (`badge-*`), a borda
 * é decoração e não aviso — então `border-status-X` ao lado de `badge-X` volta a
 * ser `border-border`. O aviso já está no fundo e no texto; três sinais da mesma
 * cor viram bloco.
 */
function normalizarBordaDeTarja(texto) {
  let n = 0;
  const saida = texto.replace(
    /\bborder-status-(danger|warning|success|info)\b(?=[^"'`]*\bbadge-\1\b)/g,
    () => { n++; return 'border-border'; },
  );
  return [saida, n];
}

const arquivos = globSync('src/**/*.{ts,tsx}');
let trocasTotal = 0;
const porClasse = new Map();
const porArquivo = new Map();

for (const arquivo of arquivos) {
  const antes = readFileSync(arquivo, 'utf8');
  let depois = antes;

  for (const [token, classes] of MAPA) {
    for (const classe of classes) {
      // `\b` nas duas pontas: sem isso, `text-red-50` casaria dentro de
      // `text-red-500` e produziria `text-status-danger0`.
      const re = new RegExp(`\\b${classe}\\b`, 'g');
      const achados = depois.match(re);
      if (!achados) continue;
      depois = depois.replace(re, token);
      trocasTotal += achados.length;
      porClasse.set(classe, (porClasse.get(classe) ?? 0) + achados.length);
      porArquivo.set(arquivo, (porArquivo.get(arquivo) ?? 0) + achados.length);
    }
  }

  const [normalizado, quantasBordas] = normalizarBordaDeTarja(depois);
  depois = normalizado;
  if (quantasBordas > 0) {
    trocasTotal += quantasBordas;
    porClasse.set('border-status-* em tarja', (porClasse.get('border-status-* em tarja') ?? 0) + quantasBordas);
    porArquivo.set(arquivo, (porArquivo.get(arquivo) ?? 0) + quantasBordas);
  }

  if (depois !== antes && aplicar) writeFileSync(arquivo, depois);
}

console.log(`${trocasTotal} trocas em ${porArquivo.size} arquivos${aplicar ? '' : ' (nada gravado — use --aplicar)'}.\n`);
console.log('Por arquivo:');
for (const [a, n] of [...porArquivo.entries()].sort((x, y) => y[1] - x[1])) {
  console.log(`  ${String(n).padStart(3)}  ${a.replace(/\\/g, '/')}`);
}
