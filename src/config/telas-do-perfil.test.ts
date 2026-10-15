import { describe, expect, it } from 'vitest';
import { TELAS_DO_PERFIL, abreATela, telaDoPerfil } from './telas-do-perfil';
import { DEPARTMENT_SCHEMAS } from './access-profile-schemas';

describe('telaDoPerfil — que caixinha do perfil abre cada tela (2026-10-02)', () => {
  it('Indicadores do Marketing pede "Indicadores" do Marketing (o caso da Merilyn e da Gislene)', () => {
    expect(telaDoPerfil('/mkt/indicadores')).toMatchObject({ setor: 'marketing', secoes: ['reports'] });
  });
  it('vale para o detalhe dentro da tela e ignora a busca do endereço', () => {
    expect(telaDoPerfil('/ti/licencas/123')?.secoes).toEqual(['licenses']);
    expect(telaDoPerfil('/comercial/clientes-parados?cliente=1203')?.secoes).toEqual(['clientes']);
  });
  it('fila de chamados e telas sem caixinha não têm regra', () => {
    expect(telaDoPerfil('/mkt/chamados')).toBeNull();
    expect(telaDoPerfil('/comercial/chamados')).toBeNull();
    expect(telaDoPerfil('/inicio')).toBeNull();
  });
  it('não confunde prefixo parecido', () => {
    expect(telaDoPerfil('/ti/pops-antigo')).toBeNull();
  });
  it('quem tem SÓ "Aprovar / reprovar compra" vê só "Aprovar compras" (dono, 2026-10-09)', () => {
    const soAprova = (setor: string, secao: string, acao: string) => setor === 'compras' && secao === 'solicitacoes' && acao === 'approve';
    const abre = (caminho: string) => { const t = telaDoPerfil(caminho); return !t || abreATela(t, soAprova); };
    expect(abre('/compras/aprovacoes')).toBe(true);
    for (const fechada of ['/compras', '/compras/catalogo', '/compras/fornecedores', '/compras/indicadores', '/compras/diretrizes']) {
      expect(abre(fechada), fechada).toBe(false);
    }
    // O chamado da compra (aberto pelo aviso) não é tela de caixinha: `/compras` é só o endereço exato.
    expect(telaDoPerfil('/compras/chamados/123')).toBeNull();
  });
  it('quem compra (Ver e Executar) continua com Solicitações e Diretrizes, e sem a aprovação', () => {
    const operador = (setor: string, secao: string, acao: string) =>
      setor === 'compras' && secao === 'solicitacoes' && (acao === 'view' || acao === 'execute');
    expect(abreATela(telaDoPerfil('/compras')!, operador)).toBe(true);
    expect(abreATela(telaDoPerfil('/compras/diretrizes')!, operador)).toBe(true);
    expect(abreATela(telaDoPerfil('/compras/aprovacoes')!, operador)).toBe(false);
  });
  it('toda seção da lista existe no perfil do setor — caixinha que não existe nunca abriria a tela', () => {
    for (const t of TELAS_DO_PERFIL) {
      const chaves = DEPARTMENT_SCHEMAS[t.setor].modules.map((m) => m.key);
      for (const s of t.secoes) expect(chaves, `${t.prefixo} → ${t.setor}.${s}`).toContain(s);
    }
  });
  it('a vendedora (Operador, 2026-10-14) abre o dia dela e a ficha do cliente, e não as análises do gestor', () => {
    const vendedora = (setor: string, secao: string, acao: string) =>
      setor === 'comercial' && acao === 'view' && ['lancamentos', 'carteiras', 'reports', 'clientes'].includes(secao);
    const abre = (caminho: string) => abreATela(telaDoPerfil(caminho)!, vendedora);
    for (const aberta of ['/comercial/lancamentos', '/comercial/carteiras', '/comercial/indicadores', '/comercial/clientes-parados']) {
      expect(abre(aberta), aberta).toBe(true);
    }
    for (const fechada of ['/comercial/vendas', '/comercial/cashback', '/comercial/beneficios']) {
      expect(abre(fechada), fechada).toBe(false);
    }
  });
});
