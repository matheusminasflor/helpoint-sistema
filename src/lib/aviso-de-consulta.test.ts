// Leva C (2026-09-26): o `QueryClient` passou a avisar quando o banco recusa uma
// leitura. Prova pura, sem render — o `App.tsx` só liga o fio, a regra mora em
// `@/lib/aviso-de-consulta`.
//
// Importa do módulo sem dependência, NÃO do `App.tsx`: aquele arquivo arrasta o
// roteador, o cliente do Supabase e as 60 páginas, e exigiria `VITE_SUPABASE_URL`
// no import. Máquina tem `.env`; o CI não — foi assim que o CI #75 ficou vermelho
// com 106 testes verdes aqui (ver `RequireDiretoria.test.ts`).
import { describe, expect, it } from 'vitest';
import { avisoDaConsulta, deveAvisar } from '@/lib/aviso-de-consulta';

describe('deveAvisar', () => {
  it('avisa numa recusa de permissão — o caso que a leva existe para pegar', () => {
    expect(deveAvisar(new Error('permission denied for table com_vendas_itens'))).toBe(true);
  });

  it('avisa quando o erro não tem mensagem nenhuma', () => {
    // Melhor um aviso genérico que silêncio: silêncio é o defeito.
    expect(deveAvisar(new Error(''))).toBe(true);
    expect(deveAvisar(undefined)).toBe(true);
  });

  // Sessão vencida derruba TODA consulta da tela de uma vez, e o `AuthContext` já
  // manda a pessoa para o login. Avisar "não consegui ler" no meio disso conta a
  // história errada: ela pensaria em problema de dado, não em sessão.
  it('cala quando é sessão vencida — o login já toma conta', () => {
    expect(deveAvisar(new Error('JWT expired'))).toBe(false);
    expect(deveAvisar(new Error('Invalid Refresh Token: Already Used'))).toBe(false);
  });

  it('cala quando a consulta foi cancelada — a tela mudou, não falhou', () => {
    expect(deveAvisar(new Error('The operation was aborted'))).toBe(false);
  });
});

describe('avisoDaConsulta', () => {
  it('a frase diz que o que está na tela pode estar INCOMPLETO, não que está vazio', () => {
    // É a parte que faz o aviso valer. O perigo nunca foi a tela vazia; foi a
    // tela com menos dado parecendo completa.
    const { titulo } = avisoDaConsulta(new Error('permission denied'));
    expect(titulo).toContain('incompleto');
    expect(titulo).toContain('recarregue a página');
  });

  it('leva o detalhe técnico junto — quem opera este sistema é a TI', () => {
    expect(avisoDaConsulta(new Error('permission denied for table tickets')).detalhe)
      .toBe('permission denied for table tickets');
  });

  it('corta o detalhe em 180 caracteres: mensagem de Postgres não cabe em toast', () => {
    const { detalhe } = avisoDaConsulta(new Error('x'.repeat(500)));
    expect(detalhe).toHaveLength(180);
  });

  it('sem mensagem, o detalhe é ausente em vez de string vazia', () => {
    // `undefined` faz o sonner não desenhar a segunda linha; `''` desenharia uma
    // linha em branco embaixo do aviso.
    expect(avisoDaConsulta(new Error('')).detalhe).toBeUndefined();
    expect(avisoDaConsulta(null).detalhe).toBeUndefined();
  });

  it('lê a mensagem de um objeto solto, sem nunca serializar o desconhecido', () => {
    // Erro de rede do fetch chega como objeto com `message`. `JSON.stringify` do
    // desconhecido é o que já jogou token dentro de log em outros sistemas — e
    // toast é tela.
    expect(avisoDaConsulta({ message: 'Failed to fetch' }).detalhe).toBe('Failed to fetch');
    expect(avisoDaConsulta({ token: 'segredo' }).detalhe).toBeUndefined();
  });
});
