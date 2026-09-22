// Correção da auditoria da leva metas-e-carteiras, item 3: `RequireDiretoria`
// exigia módulo Diretoria E cargo de gestor (`&&`); a porta certa é a mesma
// de `has_diretoria_access` no banco — módulo OU gestor (`||`). Prova pura,
// sem render: o componente só decide com base neste retorno.
import { describe, expect, it } from 'vitest';
import { podeAcessarDiretoria } from '@/hooks/useVisibleModules';

describe('podeAcessarDiretoria', () => {
  it('member com o módulo Diretoria concedido passa, mesmo sem ser gestor', () => {
    expect(podeAcessarDiretoria(true, false)).toBe(true);
  });

  it('manager sem o módulo Diretoria concedido passa — mesma porta de has_diretoria_access', () => {
    expect(podeAcessarDiretoria(false, true)).toBe(true);
  });

  it('member sem módulo e sem cargo de gestão não passa', () => {
    expect(podeAcessarDiretoria(false, false)).toBe(false);
  });

  it('owner/admin com o módulo concedido (o caso comum) passa', () => {
    expect(podeAcessarDiretoria(true, true)).toBe(true);
  });
});
