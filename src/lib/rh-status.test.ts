import { describe, it, expect } from 'vitest';
import { RH_STATUS, RH_STATUS_OPCOES, estaAtivo, estaNaEmpresa } from './rh-status';

describe('rh-status', () => {
  // A guarda que pega o defeito de origem: alguém escrevendo a situação em
  // inglês. `'active'` não é situação nenhuma aqui, e o cartão "Ativos" mostrava
  // zero por causa disso.
  it('não conhece as palavras em inglês', () => {
    expect(RH_STATUS).not.toContain('active' as never);
    expect(estaAtivo('active')).toBe(false);
  });

  it('só desligado sai da empresa — afastado continua', () => {
    expect(estaNaEmpresa('ativo')).toBe(true);
    expect(estaNaEmpresa('afastado')).toBe(true);
    expect(estaNaEmpresa('desligado')).toBe(false);
  });

  it('estaAtivo é mais estreito: afastado não está trabalhando', () => {
    expect(estaAtivo('ativo')).toBe(true);
    expect(estaAtivo('afastado')).toBe(false);
    expect(estaAtivo('desligado')).toBe(false);
  });

  // Situação ausente conta como dentro da empresa: o cadastro antigo pode ter
  // vindo sem ela, e sumir com a pessoa do quadro seria pior do que mostrá-la.
  it('sem situação conta como dentro da empresa', () => {
    expect(estaNaEmpresa(null)).toBe(true);
    expect(estaNaEmpresa(undefined)).toBe(true);
    expect(estaAtivo(null)).toBe(false);
  });

  it('as opções de tela cobrem exatamente a lista', () => {
    expect(RH_STATUS_OPCOES.map(o => o.value)).toEqual([...RH_STATUS]);
  });
});
