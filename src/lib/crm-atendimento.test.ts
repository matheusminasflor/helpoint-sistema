import { describe, expect, it } from 'vitest';
import {
  contagemDosCampos, dentroDaMeta, minutos, nomeDoFunil, porEstado, porSegmento, SEM_ESTADO,
  type LinhaCruzada, type VendaComCampoFaltando,
} from './crm-atendimento';

const c = (segmento: LinhaCruzada['segmento'], uf: string | null, conversas: number, respondidas: number, soma: number, funil: string | null = null): LinhaCruzada =>
  ({ segmento, funil, uf, conversas, so_lyra: 0, sem_resposta: conversas - respondidas, respondidas, no_prazo: respondidas, soma_minutos: soma });

describe('Atendimento do CRM', () => {
  it('escreve os minutos como gente lê', () => {
    expect(minutos(25)).toBe('25 min');
    expect(minutos(70)).toBe('1 h 10 min');
    expect(minutos(120)).toBe('2 h');
    expect(minutos(null)).toBe('—');
  });

  it('a meta vem do banco: até 45 minutos', () => {
    expect(dentroDaMeta(45, 45)).toBe(true);
    expect(dentroDaMeta(46, 45)).toBe(false);
    expect(dentroDaMeta(null, 45)).toBe(false);
  });

  it('o funil de venda pelo nome dos Indicadores; o outro, pelo nome do Kommo', () => {
    expect(nomeDoFunil('salao', 'Salão de Beleza')).toBe('Salão de beleza');
    expect(nomeDoFunil(null, 'ENAD')).toBe('ENAD');
    expect(nomeDoFunil(null, null)).toBe('Sem funil');
  });

  it('conta cada campo que falta, com o valor só no faturado à parte', () => {
    const v = (faltam: VendaComCampoFaltando['faltam']): VendaComCampoFaltando =>
      ({ lead_id: 1, nome: 'x', funil: 'salao', situacao: 'ganha', fechou: '2026-11-04', link: 'k', faltam });
    expect(contagemDosCampos([v(['cnpj', 'valor']), v(['cnpj']), v(['motivo']), v(['valor_kommo'])])).toEqual([
      { campo: 'cnpj', quantos: 2 }, { campo: 'telefone', quantos: 0 }, { campo: 'valor', quantos: 1 },
      { campo: 'valor_kommo', quantos: 1 }, { campo: 'motivo', quantos: 1 },
    ]);
  });

  it('por segmento soma os estados, e filtra pelo estado escolhido', () => {
    const cruzado = [c('distribuidor', 'MG', 5, 5, 330), c('distribuidor', 'SP', 1, 1, 6), c('consumidor', 'MG', 8, 8, 64),
      c(null, null, 2, 2, 4, 'ENAD')];
    const vendas = [{ segmento: 'distribuidor' as const, uf: 'MG', ganhas: 3, perdidas: 1 }, { segmento: 'distribuidor' as const, uf: 'SP', ganhas: 1, perdidas: 0 }];
    expect(porSegmento(cruzado, vendas, null).map((s) => `${s.nome}:${s.conversas}:${s.tempo}:${s.vendas}`))
      .toEqual(['Consumidor final:8:8:0', 'Distribuidor:6:56:4', 'ENAD:2:2:0']);
    expect(porSegmento(cruzado, vendas, 'SP').map((s) => `${s.nome}:${s.conversas}:${s.vendas}`)).toEqual(['Distribuidor:1:1']);
    expect(porSegmento(cruzado, vendas, SEM_ESTADO).map((s) => s.nome)).toEqual(['ENAD']);
  });

  it('por estado: até 8 com nome, o resto em Outros e o sem estado por último', () => {
    const ufs = ['MG', 'SP', 'BA', 'GO', 'DF', 'MT', 'PI', 'RJ', 'PE', 'PR'];
    const cruzado = [...ufs.map((uf, i) => c('salao', uf, 20 - i, 0, 0)), c('salao', null, 1, 0, 0)];
    const linhas = porEstado(cruzado);
    expect(linhas.map((l) => l.nome)).toEqual(['Minas Gerais', 'São Paulo', 'Bahia', 'Goiás', 'Distrito Federal', 'Mato Grosso',
      'Piauí', 'Rio de Janeiro', 'Outros 2', 'Sem estado']);
    expect(linhas[8].conversas).toBe(12 + 11);
  });
});
