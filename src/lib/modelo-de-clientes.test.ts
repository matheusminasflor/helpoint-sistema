// O modelo único de clientes (2026-10-01): o que o sistema gera é o que ele aceita de volta, e o
// vazio não vai — quem decide o que muda é o banco, comparando com o gravado.
import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import {
  COLUNAS_DO_MODELO_DE_CLIENTES, ModeloDeClientesInvalido, lerModeloDeClientes, linhasDoModeloUnico,
  type ClienteDoModeloUnico,
} from './modelo-de-clientes';

const CNPJ_VALIDO = '11222333000181';

const cliente = (codigo: string, razao_social: string, extra: Partial<ClienteDoModeloUnico> = {}): ClienteDoModeloUnico => ({
  codigo, ativo: true, razao_social, fantasia: null, tabela_preco: null, documento: null, endereco: null,
  cep: null, cidade: null, estado: null, email: null, telefone: null, carteira: null, grupo: null, ...extra,
});

const planilhaDe = (linhas: string[][]) => ({ CLIENTES: [[...COLUNAS_DO_MODELO_DE_CLIENTES], ...linhas] });

describe('modelo único de clientes', () => {
  it('ida e volta: baixar com todos e ler de novo devolve os mesmos dados', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(linhasDoModeloUnico([
      cliente('10', 'CLIENTE DEZ', { tabela_preco: 'VIP', documento: CNPJ_VALIDO, cidade: 'LAFAIETE', estado: 'MG', carteira: 'MG' }),
      cliente('11', 'CLIENTE ONZE', { ativo: false }),
    ])), 'CLIENTES');
    const relido = XLSX.read(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
    const leitura = lerModeloDeClientes({
      CLIENTES: XLSX.utils.sheet_to_json<unknown[]>(relido.Sheets.CLIENTES, { header: 1, defval: '' }),
    });
    expect(leitura.linhas).toEqual([
      { codigo: '10', ativo: 'true', razao_social: 'CLIENTE DEZ', tabela_preco: 'VIP', documento: CNPJ_VALIDO,
        cidade: 'LAFAIETE', estado: 'MG', carteira: 'MG' },
      { codigo: '11', ativo: 'false', razao_social: 'CLIENTE ONZE' },
    ]);
    expect(leitura.carteiras).toEqual(['MG']);
    expect(leitura.recusados).toEqual([]);
  });

  it('a célula vazia não vai — só o código e o que foi preenchido', () => {
    const leitura = lerModeloDeClientes(planilhaDe([['7', '', '', '', '', '', 'RUA A, 10', '', '', '', '', '', '', '']]));
    expect(leitura.linhas).toEqual([{ codigo: '7', endereco: 'RUA A, 10' }]);
  });

  it('CNPJ inválido fica de fora e é listado; o resto da linha entra', () => {
    const leitura = lerModeloDeClientes(planilhaDe([['8', 'SIM', 'OITO', '', '', '123', '', '', 'BH', 'mg', '', '', '', '']]));
    expect(leitura.linhas).toEqual([{ codigo: '8', ativo: 'true', razao_social: 'OITO', cidade: 'BH', estado: 'MG' }]);
    expect(leitura.recusados[0].motivo).toContain('CNPJ/CPF "123"');
  });

  it('código repetido não entra em nenhuma linha', () => {
    const leitura = lerModeloDeClientes(planilhaDe([
      ['9', '', 'NOVE', '', '', '', '', '', '', '', '', '', '', ''],
      ['9', '', 'NOVE DE NOVO', '', '', '', '', '', '', '', '', '', '', ''],
    ]));
    expect(leitura.linhas).toEqual([]);
    expect(leitura.repetidos).toEqual([{ codigo: '9', onde: ['linha 2', 'linha 3'] }]);
  });

  it('recusa planilha sem a aba CLIENTES e cabeçalho diferente do modelo', () => {
    expect(() => lerModeloDeClientes({ CARTEIRAS: [] })).toThrow(ModeloDeClientesInvalido);
    expect(() => lerModeloDeClientes({ CLIENTES: [['CODIGO', 'CLIENTE']] })).toThrow(ModeloDeClientesInvalido);
  });
});
