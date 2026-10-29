import { describe, expect, it } from 'vitest';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { aplicarNivel, grupoDaTela, nivelAtual, nivelDaAcao, niveisDaTela } from './nivel-de-acesso';

const ti = DEPARTMENT_SCHEMAS.ti;
const chamados = ti.modules.find((m) => m.key === 'tickets')!;
const contratos = ti.modules.find((m) => m.key === 'contracts')!;

describe('nível de acesso por tela', () => {
  it('ver é "Vê"; excluir e transferir chamado são "Tudo"; assumir é "Trabalha"', () => {
    const acao = (k: string) => chamados.actions.find((a) => a.key === k)!;
    expect(nivelDaAcao(chamados, acao('view_all'))).toBe(1);
    expect(nivelDaAcao(chamados, acao('assume'))).toBe(2);
    expect(nivelDaAcao(chamados, acao('transfer'))).toBe(3);
    expect(nivelDaAcao(chamados, acao('delete'))).toBe(3);
  });

  it('aplicar um nível e ler de volta dá o mesmo nível', () => {
    for (const n of niveisDaTela(contratos)) {
      expect(nivelAtual(contratos, { contracts: aplicarNivel(contratos, n) })).toBe(n);
    }
  });

  it('"Trabalha" nos contratos liga ver, criar e editar, e não excluir', () => {
    expect(aplicarNivel(contratos, 2)).toEqual({ view: true, create: true, edit: true, delete: false });
  });

  it('combinação própria é "Personalizado" (null)', () => {
    expect(nivelAtual(contratos, { contracts: { view: false, create: true, edit: false, delete: false } })).toBeNull();
  });

  it('as abas de configuração vão para o grupo do fim', () => {
    const config = ti.modules.find((m) => m.label.startsWith('Configurações'))!;
    expect(grupoDaTela(config)).toBe('configuracoes');
    expect(grupoDaTela(chamados)).toBe('trabalho');
  });
});
