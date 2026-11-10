import { describe, expect, it } from 'vitest';
import {
  contagemDosCampos, contarPorSegmento, dentroDaMeta, leadsDaLinha, leadsDoRecorte, minutos, nomeDoFunil, porEstado, porSegmento, SEM_ESTADO,
  type LeadDoPeriodo, type LinhaCruzada, type VendaComCampoFaltando,
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
    const vendas = [{ segmento: 'distribuidor' as const, uf: 'MG', ganhas: 3, perdidas: 1, valor: 900 }, { segmento: 'distribuidor' as const, uf: 'SP', ganhas: 1, perdidas: 0, valor: 100 }];
    expect(porSegmento(cruzado, vendas, null).map((s) => `${s.nome}:${s.conversas}:${s.tempo}:${s.vendas}`))
      .toEqual(['Consumidor final:8:8:0', 'Distribuidor:6:56:4', 'ENAD:2:2:0']);
    expect(porSegmento(cruzado, vendas, 'SP').map((s) => `${s.nome}:${s.conversas}:${s.vendas}`)).toEqual(['Distribuidor:1:1']);
    expect(porSegmento(cruzado, vendas, SEM_ESTADO).map((s) => s.nome)).toEqual(['ENAD']);
    expect(porSegmento(cruzado, vendas, null).find((s) => s.chave === 'distribuidor')?.valor).toBe(1000);
  });

  it('o segmento que vendeu sem conversa também tem linha, para o Valor somar a Venda total', () => {
    const vendas = [{ segmento: 'salao' as const, uf: 'MG', ganhas: 1, perdidas: 0, valor: 104 }];
    expect(porSegmento([c('consumidor', 'MG', 3, 3, 30)], vendas, null).map((s) => `${s.chave}:${s.conversas}:${s.valor}`))
      .toEqual(['consumidor:3:0', 'salao:0:104']);
  });

  it('a lista de leads segue o estado, o segmento e o filtro', () => {
    const l = (lead_id: number, segmento: LeadDoPeriodo['segmento'], uf: string | null, situacao: LeadDoPeriodo['situacao'], venda: LeadDoPeriodo['venda'] = null, funil: string | null = null): LeadDoPeriodo =>
      ({ lead_id, nome: `L${lead_id}`, segmento, funil, uf, link: null, atendente: null, situacao, minutos: null, venda, valor: null });
    const leads = [l(1, 'distribuidor', 'MG', 'no_prazo', 'ganha'), l(2, 'distribuidor', 'SP', 'sem_resposta'), l(3, 'salao', 'MG', 'fora_do_prazo'),
      l(4, null, null, 'sem_resposta', null, 'ENAD'), l(5, 'consumidor', 'MG', null, 'perdida')];
    const ids = (x: LeadDoPeriodo[]) => x.map((y) => y.lead_id);
    expect(ids(leadsDoRecorte(leads, 'MG', null, 'todos'))).toEqual([1, 3, 5]);
    expect(ids(leadsDoRecorte(leads, 'MG', 'distribuidor', 'todos'))).toEqual([1]);
    expect(ids(leadsDoRecorte(leads, null, null, 'sem_resposta'))).toEqual([2, 4]);
    expect(ids(leadsDoRecorte(leads, SEM_ESTADO, 'funil:ENAD', 'todos'))).toEqual([4]);
    expect(ids(leadsDoRecorte(leads, null, null, 'venda'))).toEqual([1]);
    expect(ids(leadsDoRecorte(leads, null, null, 'perdida'))).toEqual([5]);
  });

  it('as linhas da Lyra e a soma por segmento', () => {
    const y = (lead_id: number, segmento: 'consumidor' | null, passou: boolean, resolveu: boolean) =>
      ({ lead_id, nome: null, segmento, funil: segmento ? null : 'Atendimento', etapa: null, link: null, triado: !!segmento, passou, resolveu, parou: !passou && !resolveu });
    const leads = [y(1, 'consumidor', true, false), y(2, null, true, false), y(3, 'consumidor', false, true), y(4, null, false, false)];
    expect(leadsDaLinha(leads, 'atendidos').length).toBe(4);
    expect(leadsDaLinha(leads, 'triados').map((l) => l.lead_id)).toEqual([1, 3]);
    expect(leadsDaLinha(leads, 'parou').map((l) => l.lead_id)).toEqual([4]);
    expect(contarPorSegmento(leads).map((s) => `${s.nome}:${s.n}`)).toEqual(['Atendimento:2', 'Consumidor final:2']);
    expect(contarPorSegmento(leads, (l) => l.lead_id).map((s) => `${s.nome}:${s.total}`)).toEqual(['Atendimento:6', 'Consumidor final:4']);
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
