import { describe, expect, it } from 'vitest';
import { contagemDosCampos, dentroDaMeta, minutos, nomeDoFunil, type VendaComCampoFaltando } from './crm-atendimento';

describe('Atendimento do CRM', () => {
  it('escreve os minutos como gente lê', () => {
    expect(minutos(25)).toBe('25 min');
    expect(minutos(70)).toBe('1 h 10 min');
    expect(minutos(120)).toBe('2 h');
    expect(minutos(null)).toBe('—');
  });

  it('a meta é de até 30 minutos', () => {
    expect(dentroDaMeta(30)).toBe(true);
    expect(dentroDaMeta(31)).toBe(false);
    expect(dentroDaMeta(null)).toBe(false);
  });

  it('o funil de venda pelo nome dos Indicadores; o outro, pelo nome do Kommo', () => {
    expect(nomeDoFunil('salao', 'Salão de Beleza')).toBe('Salão de beleza');
    expect(nomeDoFunil(null, 'ENAD')).toBe('ENAD');
    expect(nomeDoFunil(null, null)).toBe('Sem funil');
  });

  it('conta cada campo que falta', () => {
    const v = (faltam: VendaComCampoFaltando['faltam']): VendaComCampoFaltando =>
      ({ lead_id: 1, nome: 'x', funil: 'salao', situacao: 'ganha', fechou: '2026-11-04', link: 'k', faltam });
    expect(contagemDosCampos([v(['cnpj', 'valor']), v(['cnpj']), v(['motivo'])])).toEqual([
      { campo: 'cnpj', quantos: 2 }, { campo: 'telefone', quantos: 0 }, { campo: 'valor', quantos: 1 }, { campo: 'motivo', quantos: 1 },
    ]);
  });
});
