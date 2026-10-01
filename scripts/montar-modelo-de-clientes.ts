// Monta o MODELO ÚNICO DE CLIENTES já preenchido, a partir dos três arquivos que a equipe tinha
// (2026-10-01, pedido do dono para a carga do go-live):
//
//   1. CLIENTESXTABELA.csv do Forteplus — código, ativo, razão social, fantasia, tabela;
//   2. a ficha geral do Forteplus (.xlsx) — CNPJ/CPF, endereço, CEP, cidade, UF, e-mail, telefone;
//   3. a planilha de carteiras da equipe (.xlsx, abas MG / VIP / OUTROS ESTADOS) — carteira e grupo.
//
// Os leitores são os do sistema (`lerFichaClientes`, `extrairDocumentoDoNome`, `linhasDoModeloUnico`):
// o arquivo que sai é o mesmo que "Baixar modelo" gera, e volta pela tela sem adaptação.
// A planilha de carteiras é lida pela regra do leitor da LEVA Q (git 4be576b9): cabeçalho por
// CÓDIGO + CLIENTE, vários códigos na mesma célula = um grupo, código repetido em duas linhas fica sem
// carteira e é listado. Nomes das carteiras (dono, 2026-09-29 e 2026-10-01): VIP = ESPECIAL,
// OUTROS ESTADOS = DEMAIS ESTADOS.
//
// Os arquivos têm dado de cliente: NÃO entram no Git. Uso:
//   npx vite-node scripts/montar-modelo-de-clientes.ts <clientes.csv> <carteiras.xlsx> <ficha.xlsx> <saida.xlsx>
import { readFileSync, writeFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { normalizeHeader } from '@/lib/planilha';
import { lerFichaClientes, type FichaCliente } from '@/lib/forteplus-ficha';
import { extrairDocumentoDoNome } from '@/lib/documento';
import { lerModeloDeClientes, linhasDoModeloUnico, type ClienteDoModeloUnico } from '@/lib/modelo-de-clientes';

const [csvPath, carteirasPath, fichaPath, saida] = process.argv.slice(2);
if (!saida) {
  console.error('uso: vite-node scripts/montar-modelo-de-clientes.ts <clientes.csv> <carteiras.xlsx> <ficha.xlsx> <saida.xlsx>');
  process.exit(1);
}

const NOME_DA_CARTEIRA: Record<string, string> = { MG: 'MG', VIP: 'ESPECIAL', 'OUTROS ESTADOS': 'DEMAIS ESTADOS' };
const chave = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();

// ── 1. Clientes × tabela (o CSV do Forteplus vem em Windows-1252) ──────────────────────────────
const csv = new TextDecoder('windows-1252').decode(readFileSync(csvPath));
const clientes = csv.split(/\r?\n/).slice(1).filter((l) => l.trim()).map((l) => {
  const [codigo, ativo, razao, fantasia, tabela] = l.split(';').map((c) => c.replace(/\s+/g, ' ').trim());
  return { codigo, ativo: ativo.toLowerCase() === 'true', razao, fantasia, tabela };
});

// ── 2. Ficha geral: casa pela razão social, como a importação de ficha fazia ───────────────────
const wbFicha = XLSX.read(readFileSync(fichaPath));
const fichas = Object.values(wbFicha.Sheets)
  .flatMap((aba) => lerFichaClientes(XLSX.utils.sheet_to_json<unknown[]>(aba, { header: 1, defval: '' })).fichas);
const fichaPorNome = new Map<string, FichaCliente | null>();
for (const f of fichas) {
  const k = chave(f.razao_social);
  fichaPorNome.set(k, fichaPorNome.has(k) ? null : f); // nome repetido na ficha = ambíguo, não casa
}

// ── 3. Carteiras ────────────────────────────────────────────────────────────────────────────────
const separarCodigos = (celula: unknown) =>
  String(celula ?? '').split(/[|/,;\s]+/).map((c) => c.trim()).filter((c) => /^\d+$/.test(c));
const limparNome = (celula: unknown) =>
  String(celula ?? '').replace(/\s*-\s*INATIVO\s*$/i, '').replace(/\s+/g, ' ').trim();

const wbCarteiras = XLSX.read(readFileSync(carteirasPath));
const linhasDeCarteira: { carteira: string; codigos: string[]; nome: string }[] = [];
for (const [aba, sheet] of Object.entries(wbCarteiras.Sheets)) {
  const carteira = NOME_DA_CARTEIRA[aba.trim().toUpperCase()];
  if (!carteira) continue; // "conferencia julho", "Página4": conferências, não carteiras
  let col: { codigo: number; nome: number } | null = null;
  for (const linha of XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' })) {
    const n = linha.map(normalizeHeader);
    const ci = n.findIndex((c) => ['codigo', 'cod', 'codigos'].includes(c));
    const ni = n.findIndex((c) => ['cliente', 'nome', 'razao social'].includes(c));
    if (ci >= 0 && ni >= 0) { col = { codigo: ci, nome: ni }; continue; }
    if (!col) continue;
    const codigos = separarCodigos(linha[col.codigo]);
    if (codigos.length) linhasDeCarteira.push({ carteira, codigos, nome: limparNome(linha[col.nome]) });
  }
}
const ondeAparece = new Map<string, string[]>();
for (const l of linhasDeCarteira) for (const c of l.codigos) ondeAparece.set(c, [...(ondeAparece.get(c) ?? []), `${l.carteira}: ${l.nome}`]);
const conflitos = [...ondeAparece].filter(([, onde]) => onde.length > 1);
const emConflito = new Set(conflitos.map(([c]) => c));
const carteiraDe = new Map<string, { carteira: string; grupo: string | null }>();
for (const l of linhasDeCarteira) {
  if (l.codigos.some((c) => emConflito.has(c))) continue; // meio grupo numa carteira não serve
  for (const c of l.codigos) carteiraDe.set(c, { carteira: l.carteira, grupo: l.codigos.length > 1 ? l.nome : null });
}

// ── Junta ───────────────────────────────────────────────────────────────────────────────────────
let comFicha = 0; let docDoNome = 0;
const modelo: ClienteDoModeloUnico[] = clientes.map((c) => {
  const f = fichaPorNome.get(chave(c.razao)) ?? null;
  if (f) comFicha += 1;
  const doc = f?.documento ?? extrairDocumentoDoNome(c.razao);
  if (!f?.documento && doc) docDoNome += 1;
  const cart = carteiraDe.get(c.codigo);
  return {
    codigo: c.codigo, ativo: c.ativo, razao_social: c.razao, fantasia: c.fantasia || null,
    tabela_preco: c.tabela ? c.tabela.toUpperCase() : null, documento: doc,
    endereco: f?.endereco ?? null, cep: f?.cep ?? null, cidade: f?.cidade ?? null, estado: f?.estado ?? null,
    email: f?.email ?? null, telefone: f?.telefone ?? null,
    carteira: cart?.carteira ?? null, grupo: cart?.grupo ?? null,
  };
});

const aba = XLSX.utils.aoa_to_sheet(linhasDoModeloUnico(modelo));
aba['!cols'] = [9, 7, 45, 30, 18, 20, 45, 11, 22, 5, 30, 16, 18, 30].map((wch) => ({ wch }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, aba, 'CLIENTES');
// `XLSX.writeFile` não grava no build ESM do xlsx (sem `set_fs`): gera os bytes e grava com o node.
writeFileSync(saida, XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));

// A prova: o arquivo gravado volta pelo MESMO leitor da tela de importação.
const relido = XLSX.read(readFileSync(saida));
const conferencia = lerModeloDeClientes({
  CLIENTES: XLSX.utils.sheet_to_json<unknown[]>(relido.Sheets.CLIENTES, { header: 1, defval: '' }),
});

const codigosDoCsv = new Set(clientes.map((c) => c.codigo));
const naCarteiraForaDoCsv = [...carteiraDe.keys()].filter((c) => !codigosDoCsv.has(c));
const porCarteira = modelo.reduce<Record<string, number>>((s, c) => { if (c.carteira) s[c.carteira] = (s[c.carteira] ?? 0) + 1; return s; }, {});
console.log(JSON.stringify({
  clientes: modelo.length,
  comFicha,
  semFicha: modelo.length - comFicha,
  comDocumento: modelo.filter((c) => c.documento).length,
  documentoTiradoDoNome: docDoNome,
  comTabela: modelo.filter((c) => c.tabela_preco).length,
  porCarteira,
  semCarteira: modelo.filter((c) => !c.carteira).length,
  comGrupo: modelo.filter((c) => c.grupo).length,
  conflitos: conflitos.map(([codigo, onde]) => ({ codigo, onde })),
  naPlanilhaDeCarteiraMasForaDoCadastro: naCarteiraForaDoCsv,
  fichasLidas: fichas.length,
  telaLeria: { linhas: conferencia.linhas.length, recusados: conferencia.recusados, repetidos: conferencia.repetidos },
}, null, 2));
