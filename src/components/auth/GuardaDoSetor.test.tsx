// Defeito 17 da proposta "Helpoint no dia a dia" (2026-10-24): atualizar a página (F5) ou abrir um link direto numa
// tela de setor levava ao Início. A guarda decidia antes de o login carregar: sem pessoa, a consulta de módulos fica
// desligada, o react-query diz "não está carregando", e a guarda lia "não tem o módulo".
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const estado = vi.hoisted(() => ({
  auth: { isLoading: false, user: { id: 'u1' } as { id: string } | null },
  modulos: { isLoading: false, isError: false, isManagerOrHigher: false, showTI: false } as Record<string, boolean>,
  pode: (() => false) as (...a: unknown[]) => boolean,
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => estado.auth }));
vi.mock('@/hooks/useVisibleModules', () => ({ useVisibleModules: () => estado.modulos }));
vi.mock('@/hooks/useAccessProfiles', () => ({
  useConfiguracaoDosSetores: () => ({ isLoading: false, isError: false, pode: estado.pode }),
}));
vi.mock('@/hooks/useTenantPath', () => ({ useTenantPath: () => (p: string) => p }));

import { GuardaDoSetor } from './GuardaDoSetor';

const abre = (endereco: string) => render(
  <MemoryRouter initialEntries={[endereco]}>
    <Routes>
      <Route path="/inicio" element={<p>Início</p>} />
      <Route path="*" element={<GuardaDoSetor><p>Tela do setor</p></GuardaDoSetor>} />
    </Routes>
  </MemoryRouter>,
);

describe('GuardaDoSetor', () => {
  beforeEach(() => {
    estado.auth = { isLoading: false, user: { id: 'u1' } };
    estado.modulos = { isLoading: false, isError: false, isManagerOrHigher: false, showTI: false };
    estado.pode = () => false;
  });

  it('enquanto o login carrega (F5 ou link direto), não manda ninguém para o Início', () => {
    // Exatamente o que o navegador vê no primeiro instante depois do F5: sem pessoa ainda, consulta de módulos desligada.
    estado.auth = { isLoading: true, user: null };
    abre('/ti/termos');
    expect(screen.getByText('Tela do setor')).toBeTruthy();
    expect(screen.queryByText('Início')).toBeNull();
  });

  it('com o login carregado, quem não tem o módulo continua barrado', () => {
    abre('/ti/termos');
    expect(screen.getByText('Início')).toBeTruthy();
  });

  it('com o login carregado, quem tem o módulo e a caixinha abre a tela', () => {
    estado.modulos = { ...estado.modulos, showTI: true };
    estado.pode = () => true;
    abre('/ti/termos');
    expect(screen.getByText('Tela do setor')).toBeTruthy();
  });
});
