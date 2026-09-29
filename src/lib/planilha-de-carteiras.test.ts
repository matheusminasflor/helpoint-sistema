// O leitor da planilha de carteiras, contra uma cópia em miniatura do formato real (2026-09-29).
// Cada caso abaixo existe no arquivo que o dono enviou.
//
// Para conferir contra o arquivo de verdade (fica fora do repositório: tem dado de cliente):
//   PLANILHA_CARTEIRAS="caminho/do/arquivo.xlsx" npx vitest run src/lib/planilha-de-carteiras
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { carteiraSugerida, lerPlanilhaDeCarteiras, separarCodigos } from './planilha-de-carteiras';

const OUTROS_ESTADOS: unknown[][] = [
  ['', '', '', '', '', 'JANEIRO', '', 'FEVEREIRO'],
  ['ORD', 'CÓDIGO', 'CLIENTE', 'UF - CIDADE', 'TABELA', 'JANEIRO', 'DEZEMBRO', 'REALIZADO'],
  [1, 1203, 'ODIEL MOTA SOUSA', 'GO - S.A.DESCOBERTO', 'ATACADISTA', 14843.2, 5930.1, 100805.32],
  [30, '1195/2015', 'NATALIA CAVALCANTI BATISTA AMORIM', 'PB -JOÃO PESSOA', 'VIP MAIS', '', '', ''],
  [32, '', 'FLÁVIA TRAVASSOS', '', 'VIP MAIS', '', '', ''],
  ['', '', 'TOTAIS', '', '', 1000, 2000, 3000],
  ['', '', 'META AJUSTADA', '', '', 1000, 2000, 3000],
  // A seção de inativos: cabeçalho próprio, colunas em outra ordem, sufixo " - INATIVO".
  ['', 'TABELA', 'CIDADE', 'CODIGO', 'NOME'],
  [1, 'VIP', 'PR - CURITIBA', 1076, 'ARYADINE PAOLA VIEIRA FERNANDES - INATIVO'],
  [5, 'VIP MAIS', 'SP - PENÁPOLIS', '1153 | 1465', 'CLIENTE PENAPOLIS'],
];

const VIP: unknown[][] = [
  ['f', '', '', '', '', 2025],
  ['ORd', 'CÓDIGO', 'CLIENTE', 'TABELA', 'UF - CIDADE', 'JANEIRO'],
  [1, '1615 | 1064', 'ALDEMIR DO NASCIMENTO LIMA', 'ATACADISTA', 'GO - VALPARAISO', 64469.34],
  [2, '1086 | 1149 | 1822 | 1094', 'CLARA & BELLA-IVETE LEITE-ISABELA-CLAUDIOVAN', 'ATACADISTA COND', 'SP - SÃO PAULO', 30032.4],
  ['', '', 'MÉDIAS', '', '', 100],
  ['', '', 'META', '', '', 100],
];

const MG: unknown[][] = [
  ['ORd', 'CÓDIGO', 'CLIENTE', 'TABELA', 'UF - CIDADE'],
  [1, '1075|1066', 'AME COSMÉTICOS LTDA ( BELLA HAIR)', 'VIP CONDIÇÃO', 'MG - LAFAIETE'],
  [2, 1128, 'CARLOS ANDRÉ DE MELO PASCHOALINI (ANDRE)', 'ATACADISTA', 'MG - BARBACENA'],
  ['', '', 'INATIVOS', '', ''],
  [4, 1075, 'ANA PAULA DOS SANTOS LEONE', 'VIP MAIS', 'MG - OLIVEIRA'],
];

// Conferências da planilha: sem coluna de código, ficam de fora.
const CONFERENCIA: unknown[][] = [
  ['ALDEMIR DO NASCIMENTO LIMA', 'R$ 44.996,35'],
];
const PAGINA4: unknown[][] = [
  ['CARTEIRA', 'CLIENTE', 'JANEIRO'],
  ['ESPECIAL', 'ALDEMIR DO NASCIMENTO LIMA', 'R$ 64.469,34'],
];

const leitura = lerPlanilhaDeCarteiras({
  'OUTROS ESTADOS': OUTROS_ESTADOS, 'conferencia julho': CONFERENCIA, VIP, MG, 'Página4': PAGINA4,
});
const aba = (nome: string) => leitura.abas.find((a) => a.aba === nome)!;

describe('separarCodigos', () => {
  it.each([
    ['1615 | 1064', ['1615', '1064']],
    ['1075|1066', ['1075', '1066']],
    ['1195/2015', ['1195', '2015']],
    [1203, ['1203']],
    ['', []],
    ['TOTAIS', []],
  ])('%s', (celula, codigos) => {
    expect(separarCodigos(celula)).toEqual(codigos);
  });
});

describe('lerPlanilhaDeCarteiras', () => {
  it('lê só as abas que têm coluna de código', () => {
    expect(leitura.abas.map((a) => a.aba)).toEqual(['OUTROS ESTADOS', 'VIP', 'MG']);
  });

  it('segue o cabeçalho novo da seção de inativos, com as colunas em outra ordem', () => {
    expect(aba('OUTROS ESTADOS').clientes).toEqual([
      { codigos: ['1203'], nome: 'ODIEL MOTA SOUSA' },
      { codigos: ['1195', '2015'], nome: 'NATALIA CAVALCANTI BATISTA AMORIM' },
      { codigos: ['1076'], nome: 'ARYADINE PAOLA VIEIRA FERNANDES' },
      { codigos: ['1153', '1465'], nome: 'CLIENTE PENAPOLIS' },
    ]);
  });

  it('cliente sem código fica de fora, na lista; linha de total não é cliente', () => {
    expect(aba('OUTROS ESTADOS').semCodigo).toEqual(['FLÁVIA TRAVASSOS']);
    expect(aba('VIP').semCodigo).toEqual([]);
  });

  it('vários códigos na mesma célula viram um cliente só (o grupo)', () => {
    expect(aba('VIP').clientes.map((c) => c.codigos.length)).toEqual([2, 4]);
  });

  it('o mesmo código em dois clientes sai das abas e vai para os conflitos, com a linha inteira', () => {
    expect(leitura.conflitos).toEqual([{
      codigo: '1075',
      onde: ['MG: AME COSMÉTICOS LTDA ( BELLA HAIR)', 'MG: ANA PAULA DOS SANTOS LEONE'],
    }]);
    // A AME sai inteira (com o 1066 junto): meio grupo numa carteira seria pior que nenhum.
    expect(aba('MG').clientes.map((c) => c.nome)).toEqual(['CARLOS ANDRÉ DE MELO PASCHOALINI (ANDRE)']);
  });
});

describe('carteiraSugerida', () => {
  it('OUTROS ESTADOS é DEMAIS ESTADOS; VIP segue a renomeação do banco; MG fica MG', () => {
    const renomeacoes = { VIP: 'ESPECIAL' };
    expect(carteiraSugerida('OUTROS ESTADOS', renomeacoes)).toBe('DEMAIS ESTADOS');
    expect(carteiraSugerida('VIP', renomeacoes)).toBe('ESPECIAL');
    expect(carteiraSugerida('MG', renomeacoes)).toBe('MG');
  });
});

describe.runIf(!!process.env.PLANILHA_CARTEIRAS)('o arquivo real (PLANILHA_CARTEIRAS)', () => {
  it('lê as três abas e mostra o que achou', () => {
    const wb = XLSX.read(readFileSync(process.env.PLANILHA_CARTEIRAS!), { type: 'buffer' });
    const planilha = Object.fromEntries(wb.SheetNames.map((n) => [
      n, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, blankrows: false, defval: '' }),
    ]));
    const real = lerPlanilhaDeCarteiras(planilha);
    const resumo = real.abas.map((a) => ({
      aba: a.aba,
      clientes: a.clientes.length,
      codigos: a.clientes.reduce((s, c) => s + c.codigos.length, 0),
      grupos: a.clientes.filter((c) => c.codigos.length > 1).length,
      semCodigo: a.semCodigo,
    }));
    console.log(JSON.stringify({ resumo, conflitos: real.conflitos }, null, 2));
    expect(real.abas.map((a) => a.aba)).toEqual(['OUTROS ESTADOS', 'VIP', 'MG']);
  });
});
