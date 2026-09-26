// Leva F (2026-09-26): o filtro de série era fixo em 1 e 75, escrito à mão em
// duas telas. `serie` em `com_vendas_itens` é TEXTO LIVRE, vindo do relatório do
// Forteplus sem CHECK nenhum — uma série nova apareceria na tabela mês a mês e
// não no filtro.
import { describe, expect, it } from 'vitest';
import { opcoesDeSerie } from '@/lib/series-do-filtro';

describe('opcoesDeSerie', () => {
  it('tira as séries do dado, sem repetir', () => {
    const opcoes = opcoesDeSerie([
      { serie: '1' }, { serie: '75' }, { serie: '1' }, { serie: '75' },
    ]);
    expect(opcoes.map((o) => o.valor)).toEqual(['1', '75']);
  });

  it('ordena por número, não por texto — senão 75 vem antes de 1', () => {
    // `['1','75'].sort()` alfabético devolve ['1','75'] por sorte; com 2 e 10 o
    // erro aparece, e é por isso que o caso está aqui.
    const opcoes = opcoesDeSerie([{ serie: '10' }, { serie: '2' }, { serie: '1' }]);
    expect(opcoes.map((o) => o.valor)).toEqual(['1', '2', '10']);
  });

  it('série conhecida leva o apelido do dono', () => {
    const opcoes = opcoesDeSerie([{ serie: '1' }, { serie: '75' }]);
    expect(opcoes[0].rotulo).toBe('Série 1 (com nota fiscal)');
    expect(opcoes[1].rotulo).toBe('Série 75 (sem nota fiscal, e cobrada)');
  });

  // O ponto da leva: a série que ninguém previu tem de APARECER, e sem que o
  // sistema invente o que ela significa. Foi assim que o rótulo da tabela mentiu
  // antes (achado 9 da auditoria da L6a).
  it('série nova aparece como "Série X", sem inventar significado', () => {
    const opcoes = opcoesDeSerie([{ serie: '1' }, { serie: '99' }]);
    expect(opcoes.map((o) => o.rotulo)).toEqual(['Série 1 (com nota fiscal)', 'Série 99']);
  });

  it('número antes de texto: série é texto livre e pode não ser número', () => {
    const opcoes = opcoesDeSerie([{ serie: 'ESPECIAL' }, { serie: '75' }, { serie: '1' }]);
    expect(opcoes.map((o) => o.valor)).toEqual(['1', '75', 'ESPECIAL']);
  });

  it('nulo, vazio e só espaço não viram opção', () => {
    // Uma opção vazia no filtro é clicável e não filtra nada — pior que não ter.
    const opcoes = opcoesDeSerie([{ serie: null }, { serie: '' }, { serie: '   ' }, { serie: '1' }]);
    expect(opcoes.map((o) => o.valor)).toEqual(['1']);
  });

  it('sem linha nenhuma, nenhuma opção — e a tela mostra só "as duas séries"', () => {
    expect(opcoesDeSerie([])).toEqual([]);
  });

  it('espaço em volta não cria série duplicada', () => {
    expect(opcoesDeSerie([{ serie: ' 1' }, { serie: '1 ' }]).map((o) => o.valor)).toEqual(['1']);
  });
});
