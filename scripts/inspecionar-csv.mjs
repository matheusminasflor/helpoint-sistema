// Script descartável de inspeção do CSV de clientes — confere a codificação
// (§3.6 do plano) antes de escrever `lerCadastroClientes`.
import { readFileSync } from 'node:fs';

const path = process.argv[2];
const bytes = readFileSync(path);

let modo, texto;
try {
  texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  modo = 'utf-8';
} catch {
  texto = new TextDecoder('windows-1252').decode(bytes);
  modo = 'windows-1252';
}
console.log('modo:', modo);
const linhas = texto.split(/\r?\n/).filter((l) => l.trim() !== '');
console.log('total linhas (com cabecalho):', linhas.length);
console.log('cabecalho:', linhas[0]);
console.log('primeiras 5:', linhas.slice(1, 6));

const ailson = linhas.find((l) => l.toUpperCase().includes('AILSON'));
console.log('AILSON:', ailson);

const tabelas = {};
let vazias = 0, ativos = 0, inativos = 0;
for (const l of linhas.slice(1)) {
  const campos = l.split(';');
  const tabela = (campos[4] ?? '').trim();
  tabelas[tabela || '(vazio)'] = (tabelas[tabela || '(vazio)'] || 0) + 1;
  if (!tabela) vazias++;
  if ((campos[1] ?? '').trim() === 'True') ativos++;
  if ((campos[1] ?? '').trim() === 'False') inativos++;
}
console.log('tabelas:', tabelas);
console.log('ativos:', ativos, 'inativos:', inativos, 'vazias tabela:', vazias);
