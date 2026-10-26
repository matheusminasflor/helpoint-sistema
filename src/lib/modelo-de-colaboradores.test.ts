import { describe, expect, it } from 'vitest';
import {
  COLUNAS_DO_MODELO_DE_COLABORADORES, ModeloDeColaboradoresInvalido, lerModeloDeColaboradores, linhasDoModeloDeColaboradores,
} from './modelo-de-colaboradores';

const cab = [...COLUNAS_DO_MODELO_DE_COLABORADORES];

describe('modelo de colaboradores do RH (rodada 2, R4)', () => {
  it('lê a linha com as datas do Excel e do texto, e só manda o que está preenchido', () => {
    const { linhas, recusadas } = lerModeloDeColaboradores({
      COLABORADORES: [
        cab,
        ['Maria Souza', '123.456.789-09', 45200, 'MF', 'Produção', 'Auxiliar', 'Maria@MF.com', 'R$ 2.150,00', '', '', '05/03/1990', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', ''],
      ],
    });
    expect(recusadas).toEqual([]);
    expect(linhas).toEqual([{
      linha: 2, nome: 'Maria Souza', cpf: '123.456.789-09', admissao: '2023-10-01', empresa: 'MF', setor: 'Produção',
      cargo: 'Auxiliar', email: 'maria@mf.com', salario: 2150, nascimento: '1990-03-05',
    }]);
  });

  it('data que não é data e salário que não é número ficam de fora, com o motivo e a linha', () => {
    const { linhas, recusadas } = lerModeloDeColaboradores({
      colaboradores: [cab, ['João', '11122233344', 'ontem', 'MF', 'TI', 'Analista', '', 'muito', '', '', '', '', '', '']],
    });
    expect(linhas).toEqual([]);
    expect(recusadas).toEqual([{ linha: 2, motivo: 'admissão "ontem" não é data; salário "muito" não é número' }]);
  });

  it('o obrigatório que falta vai para o banco recusar com o motivo dele (a admissão vazia vai nula)', () => {
    const { linhas } = lerModeloDeColaboradores({ COLABORADORES: [cab, ['Ana', '', '', '', '', '', '', '', '', '', '', '', '', '']] });
    expect(linhas[0]).toMatchObject({ nome: 'Ana', cpf: '', admissao: null });
  });

  it('planilha que não é o modelo é recusada inteira', () => {
    expect(() => lerModeloDeColaboradores({ Planilha1: [cab] })).toThrow(ModeloDeColaboradoresInvalido);
    expect(() => lerModeloDeColaboradores({ COLABORADORES: [['NOME', 'CPF']] })).toThrow(/cabeçalho/);
  });

  it('o modelo com a lista atual sai em ordem de nome, datas em dd/mm/aaaa e sem salário', () => {
    const m = linhasDoModeloDeColaboradores([
      { full_name: 'Zé', cpf: null, admission_date: null, empresa: null, department: 'TI', job_title: null, access_email: 'ze@x.com', contract_type: null, birth_date: null, matricula: null },
      { full_name: 'Ana', cpf: '1', admission_date: '2024-02-01', empresa: 'MF', department: 'RH', job_title: 'Analista', access_email: null, contract_type: 'CLT', birth_date: null, matricula: null },
    ]);
    expect(m[0]).toEqual(cab);
    expect(m[1].slice(0, 8)).toEqual(['Ana', '1', '01/02/2024', 'MF', 'RH', 'Analista', '', '']);
    expect(m[2][0]).toBe('Zé');
  });
});
