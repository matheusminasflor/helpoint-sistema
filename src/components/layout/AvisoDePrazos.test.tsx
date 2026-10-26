// Defeito 16 da proposta "Helpoint no dia a dia" (2026-10-24): o aviso de prazo voltava a cada tela aberta, mesmo
// depois de "Ver depois". Cada rota tem o próprio `StaffRoute`, o `AppLayout` remonta a cada troca de tela e o aviso
// nascia de novo, sem lembrar que tinha sido fechado. A regra do dono é uma vez por entrada ou atualização da página.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const item = vi.hoisted(() => ({
  chamado: { id: 't1', ticket_number: 192, title: 'Pedidos lançados não aparecem', status: 'open' },
  motivo: 'vencido' as const,
  quando: new Date(2026, 9, 22, 17, 13),
}));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [item] }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' }, tenantId: 'e1' }) }));
vi.mock('@/hooks/useTenantPath', () => ({ useTenantPath: () => (p: string) => p }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { AvisoDePrazos } from './AvisoDePrazos';

const monta = (rota = '/inicio') => render(<MemoryRouter initialEntries={[rota]}><AvisoDePrazos /></MemoryRouter>);

describe('AvisoDePrazos', () => {
  it('só aparece no Início (rodada 3: antes se repetia no topo de toda tela)', () => {
    monta('/helpdesk');
    expect(screen.queryByText(/prazo vencido/)).toBeNull();
  });

  it('fechado com "Ver depois", não volta quando a próxima tela remonta a moldura', () => {
    const primeira = monta();
    expect(screen.getByText(/prazo vencido/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Ver depois' }));
    expect(screen.queryByText(/prazo vencido/)).toBeNull();
    primeira.unmount();

    monta(); // a troca de tela: o AppLayout da rota nova monta outro AvisoDePrazos
    expect(screen.queryByText(/prazo vencido/)).toBeNull();
  });
});
