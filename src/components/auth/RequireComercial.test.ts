// Leva B, segundo item (2026-09-25): `comercial/insights` e
// `comercial/configuracoes` não tinham guarda de rota. Esconder o item do menu
// nunca foi fronteira — a URL seguia aberta, e quem não tem o módulo lia a tela
// inteira zerada ("Faturamento R$ 0,00"), porque a RLS de `com_vendas_itens`
// devolve zero linha sem erro nenhum.
//
// Prova pura, sem render: `RequireComercial` só decide com base neste retorno.
// Importa de `@/lib/acesso-comercial`, NÃO de `@/hooks/useVisibleModules` —
// aquele módulo arrasta `useAuth` → cliente do Supabase, que exige
// `VITE_SUPABASE_URL` no import. Com `.env` na máquina passa; no CI, que não tem
// `.env`, reprovaria com "supabaseUrl is required". Foi assim que o CI #75 ficou
// vermelho com 106 testes verdes na máquina (ver `RequireDiretoria.test.ts`).
import { describe, expect, it } from 'vitest';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { podeAcessarDiretoria } from '@/lib/acesso-diretoria';

describe('podeAcessarComercial', () => {
  it('member com o módulo Comercial concedido passa, mesmo sem ser gestor', () => {
    expect(podeAcessarComercial(true, false)).toBe(true);
  });

  it('manager sem o módulo Comercial concedido passa — mesma porta de has_comercial_access', () => {
    expect(podeAcessarComercial(false, true)).toBe(true);
  });

  // O caso que dá nome à leva: o diretor puro. Ele tem o módulo Diretoria e não
  // é gestor do sistema, então `has_comercial_access` é falso para ele no banco —
  // e o guarda de tela tem de dizer a mesma coisa. O que ele precisa ver de
  // faturamento está no painel da Diretoria, pelos mesmos números e pela mesma
  // função (`com_caixas`).
  it('diretor puro (módulo Diretoria, sem Comercial, sem cargo de gestão) NÃO passa', () => {
    expect(podeAcessarComercial(false, false)).toBe(false);
    // E continua entrando na Diretoria — a correção de um lado não pode fechar o
    // outro. As duas portas são independentes de propósito.
    expect(podeAcessarDiretoria(true, false)).toBe(true);
  });

  it('quem não tem módulo nenhum e não é gestor não passa', () => {
    expect(podeAcessarComercial(false, false)).toBe(false);
  });

  it('owner/admin com o módulo concedido (o caso comum) passa', () => {
    expect(podeAcessarComercial(true, true)).toBe(true);
  });
});
