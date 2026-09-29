// O modelo de planilha das carteiras (LEVA R, 2026-09-29): o que o sistema gera tem de ser o que ele
// aceita de volta, e nada fora do modelo entra.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  COLUNAS_DO_MODELO, ModeloInvalido, lerModeloDeCarteiras, linhasDoModelo, type ClienteDoModelo,
} from './planilha-de-carteiras';

const cliente = (codigo: string, razao_social: string, extra: Partial<ClienteDoModelo> = {}): ClienteDoModelo => ({
  codigo, razao_social, fantasia: null, tabela_preco: null, cidade: null, estado: null, carteira: null, grupo: null, ...extra,
});

const CABECALHO = [...COLUNAS_DO_MODELO];

describe('linhasDoModelo', () => {
  it('cabeçalho do modelo e uma linha por cliente, em ordem de nome, com carteira e grupo atuais', () => {
    const linhas = linhasDoModelo([
      cliente('2', 'ZETA', { carteira: 'MG' }),
      cliente('1', 'ALFA', { fantasia: 'A', tabela_preco: 'VIP', cidade: 'LAFAIETE', estado: 'MG', grupo: 'GRUPO A' }),
    ]);
    expect(linhas).toEqual([
      CABECALHO,
      ['1', 'ALFA', 'A', 'VIP', 'LAFAIETE-MG', '', 'GRUPO A'],
      ['2', 'ZETA', '', '', '', 'MG', ''],
    ]);
  });

  it('o arquivo gerado, relido como planilha, volta pelo leitor (ida e volta)', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasDoModelo([
      cliente('10', 'CLIENTE DEZ', { carteira: 'mg ' }),
      cliente('11', 'CLIENTE ONZE'),
    ])), 'CARTEIRAS');
    const relido = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const planilha = { CARTEIRAS: XLSX.utils.sheet_to_json<unknown[]>(relido.Sheets.CARTEIRAS, { header: 1, defval: '' }) };
    expect(lerModeloDeCarteiras(planilha)).toEqual({
      carteiras: [{ carteira: 'MG', clientes: [{ codigo: '10', nome: 'CLIENTE DEZ', grupo: null }] }],
      semCarteira: 1,
      conflitos: [],
    });
  });
});

describe('lerModeloDeCarteiras', () => {
  it('agrupa por carteira, lê o grupo e ignora a linha sem carteira', () => {
    const lida = lerModeloDeCarteiras({
      CARTEIRAS: [
        CABECALHO,
        [1203, 'ODIEL', '', 'ATACADISTA', 'GO', 'DEMAIS ESTADOS', ''],
        [1615, 'ALDEMIR', '', '', '', 'ESPECIAL', 'ALDEMIR LIMA'],
        [1064, 'ALDEMIR 2', '', '', '', 'especial', 'ALDEMIR LIMA'],
        [1128, 'CARLOS', '', '', '', '', ''],
        ['', '', '', '', '', '', ''],
      ],
    });
    expect(lida.carteiras).toEqual([
      { carteira: 'DEMAIS ESTADOS', clientes: [{ codigo: '1203', nome: 'ODIEL', grupo: null }] },
      { carteira: 'ESPECIAL', clientes: [
        { codigo: '1615', nome: 'ALDEMIR', grupo: 'ALDEMIR LIMA' },
        { codigo: '1064', nome: 'ALDEMIR 2', grupo: 'ALDEMIR LIMA' },
      ] },
    ]);
    expect(lida.semCarteira).toBe(1);
  });

  it('o código repetido não entra em nenhuma linha e é listado com as linhas', () => {
    const lida = lerModeloDeCarteiras({
      CARTEIRAS: [CABECALHO, [1075, 'AME', '', '', '', 'MG', ''], [1075, 'ANA PAULA', '', '', '', 'ESPECIAL', ''], [1, 'UM', '', '', '', 'MG', '']],
    });
    expect(lida.conflitos).toEqual([{ codigo: '1075', onde: ['linha 2 (MG)', 'linha 3 (ESPECIAL)'] }]);
    expect(lida.carteiras).toEqual([{ carteira: 'MG', clientes: [{ codigo: '1', nome: 'UM', grupo: null }] }]);
  });

  it('recusa planilha sem a aba CARTEIRAS — a planilha antiga da equipe não entra', () => {
    expect(() => lerModeloDeCarteiras({ VIP: [['ORD', 'CÓDIGO', 'CLIENTE'], [1, 1615, 'ALDEMIR']] }))
      .toThrow(ModeloInvalido);
  });

  it('recusa a aba CARTEIRAS com cabeçalho diferente do modelo', () => {
    expect(() => lerModeloDeCarteiras({ CARTEIRAS: [['CÓDIGO', 'CLIENTE', 'CARTEIRA'], [1, 'UM', 'MG']] }))
      .toThrow(/cabeçalho/);
  });
});
