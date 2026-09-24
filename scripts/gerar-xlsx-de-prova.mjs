// Gera um .xlsx válido a partir da fixture do repositório, para provar na
// TELA (não só em teste) o bloqueio de filial pelo nome do arquivo — §4a do
// documento do dono, decisão de 2026-09-24.
//
// Uso: node scripts/gerar-xlsx-de-prova.mjs <destino.xlsx>
//
// Não é ferramenta de produção: existe para que a conferência visual use um
// arquivo que o leitor do sistema realmente aceita, em vez de um arquivo
// qualquer que falharia na leitura por outro motivo e mascararia o teste.
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const destino = process.argv[2];
if (!destino) {
  console.error('uso: node scripts/gerar-xlsx-de-prova.mjs <destino.xlsx>');
  process.exit(1);
}

// A fixture é TypeScript; lê-la aqui exigiria transpilar. Em vez disso,
// reconstruo o mínimo que `lerRelatorioVendas` exige, nas posições fixas de
// `COL` (§3.3): assinatura na linha de índice 5 (`Cod` na coluna 1,
// `Emissão` na 4, `CFOP` na 12) e os campos de item nas colunas certas.
const LARGURA = 40;
const vazia = () => new Array(LARGURA).fill('');

const assinatura = vazia();
assinatura[1] = 'Cod';
assinatura[4] = 'Emissão';
assinatura[12] = 'CFOP';

// O relatório agrupa por cliente: uma linha "NOME - CODIGO" na coluna 0 e,
// abaixo dela, os itens daquele cliente (GRUPO_CLIENTE_RE em
// comercial-import.ts). Item sem cabeçalho antes dele é recusado.
function cabecalhoCliente(nome, codigo) {
  const l = vazia();
  l[0] = `${nome} - ${codigo}`;
  return l;
}

function item({ emissao, documento, produto, nome, qtde, valor }) {
  const l = vazia();
  l[4] = emissao;
  l[6] = documento;
  l[9] = 'NFe';
  l[11] = '1';
  l[12] = '5101';
  l[13] = produto;
  l[16] = nome;
  l[21] = qtde;
  l[23] = valor;
  l[26] = 0;
  l[30] = 'V1';
  l[34] = 'VENDEDOR DE PROVA';
  return l;
}

const linhas = [];
for (let i = 0; i < 5; i++) linhas.push(vazia());
linhas.push(assinatura);
linhas.push(cabecalhoCliente('CLIENTE DE PROVA UM', '9001'));
linhas.push(item({ emissao: '01/08/2026', documento: '1001', produto: 'PX1', nome: 'PRODUTO DE PROVA UM', qtde: 1, valor: 100 }));
linhas.push(cabecalhoCliente('CLIENTE DE PROVA DOIS', '9002'));
linhas.push(item({ emissao: '02/08/2026', documento: '1002', produto: 'PX2', nome: 'PRODUTO DE PROVA DOIS', qtde: 2, valor: 100 }));
const totais = vazia();
totais[2] = 'Totais:';
totais[23] = 200;
linhas.push(vazia());
linhas.push(totais);

const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhas), 'Planilha1');
XLSX.writeFile(wb, destino);
console.log(`gerado: ${destino}`);
