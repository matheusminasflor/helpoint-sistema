import { describe, expect, it } from 'vitest';
import { TELAS_DO_PERFIL, telaDoPerfil } from './telas-do-perfil';
import { DEPARTMENT_SCHEMAS } from './access-profile-schemas';

describe('telaDoPerfil — que caixinha do perfil abre cada tela (2026-10-02)', () => {
  it('Indicadores do Marketing pede "Indicadores" do Marketing (o caso da Merilyn e da Gislene)', () => {
    expect(telaDoPerfil('/mkt/indicadores')).toMatchObject({ setor: 'marketing', secoes: ['reports'] });
  });
  it('vale para o detalhe dentro da tela e ignora a busca do endereço', () => {
    expect(telaDoPerfil('/ti/licencas/123')?.secoes).toEqual(['licenses']);
    expect(telaDoPerfil('/comercial/insights?visao=vendas')?.secoes).toEqual(['vendas']);
  });
  it('fila de chamados e telas sem caixinha não têm regra', () => {
    expect(telaDoPerfil('/mkt/chamados')).toBeNull();
    expect(telaDoPerfil('/comercial/lancamentos')).toBeNull();
    expect(telaDoPerfil('/inicio')).toBeNull();
  });
  it('não confunde prefixo parecido', () => {
    expect(telaDoPerfil('/ti/pops-antigo')).toBeNull();
  });
  it('toda seção da lista existe no perfil do setor — caixinha que não existe nunca abriria a tela', () => {
    for (const t of TELAS_DO_PERFIL) {
      const chaves = DEPARTMENT_SCHEMAS[t.setor].modules.map((m) => m.key);
      for (const s of t.secoes) expect(chaves, `${t.prefixo} → ${t.setor}.${s}`).toContain(s);
    }
  });
});
