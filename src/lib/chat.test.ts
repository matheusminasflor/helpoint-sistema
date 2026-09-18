import { describe, it, expect } from 'vitest';
import { agrupaPorDia, textoDaMensagem, rotuloDoCanal, type ChatMensagem } from './chat';

// `agrupaPorDia` lê `Date` no fuso da máquina (regra 4 das cinco). Fixado aqui
// para o teste não depender do fuso de quem roda — no CI (UTC) o defeito que
// este teste existe para acusar nunca apareceria sozinho, porque em UTC o dia
// local e o dia UTC são sempre o mesmo.
process.env.TZ = 'America/Sao_Paulo';

function mensagem(over: Partial<ChatMensagem>): ChatMensagem {
  return {
    id: over.id ?? 'm1',
    tenant_id: 't1',
    channel_id: 'c1',
    author_id: 'a1',
    conteudo: 'oi',
    deleted_at: null,
    deleted_by: null,
    created_at: '2026-09-18T12:00:00.000Z',
    ...over,
  };
}

describe('textoDaMensagem', () => {
  it('devolve o conteudo quando a mensagem nao foi apagada', () => {
    expect(textoDaMensagem(mensagem({ conteudo: 'ola pessoal' }))).toBe('ola pessoal');
  });

  it('devolve "Mensagem apagada" quando deleted_at existe, mesmo que conteudo venha preenchido', () => {
    // Se o defeito estivesse aqui, o texto original apareceria na tela de
    // todo mundo depois de apagado — o trigger do banco garante conteudo
    // vazio, mas a tela nao pode depender so' disso.
    expect(textoDaMensagem(mensagem({ conteudo: 'nao deveria aparecer', deleted_at: '2026-09-18T13:00:00.000Z' })))
      .toBe('Mensagem apagada');
  });
});

describe('agrupaPorDia', () => {
  it('poe uma mensagem de 22h30 (Brasil) no dia de hoje, nao no de amanha', () => {
    // 22h30 em Sao Paulo (UTC-3) e' 01h30 UTC do dia seguinte. Com
    // `toISOString().slice(0, 10)` em vez de `toLocalISODate`, essa
    // mensagem cairia no grupo do dia errado.
    const noturna = mensagem({ id: 'm-noturna', created_at: '2026-09-19T01:30:00.000Z' });
    const grupos = agrupaPorDia([noturna]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].dia).toBe('2026-09-18');
  });

  it('com lista vazia devolve []', () => {
    expect(agrupaPorDia([])).toEqual([]);
  });

  it('preserva a ordem de chegada dentro do dia', () => {
    const m1 = mensagem({ id: 'm1', created_at: '2026-09-18T10:00:00.000Z' });
    const m2 = mensagem({ id: 'm2', created_at: '2026-09-18T11:00:00.000Z' });
    const grupos = agrupaPorDia([m1, m2]);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].mensagens.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('rotuloDoCanal', () => {
  it('poe # antes do nome', () => {
    expect(rotuloDoCanal({ nome: 'financeiro' })).toBe('#financeiro');
  });
});
