import { describe, expect, it } from 'vitest';
import { montarQuadro } from './historico-por-familia';

describe('quadro mês × família', () => {
  const quadro = montarQuadro([
    { competencia: '2031-04-01', familia: 'Coloração', ordem: 1, quantidade: 2, valor: 100 },
    { competencia: '2031-03-01', familia: 'Tratamento', ordem: 10, quantidade: 1, valor: 80 },
    { competencia: '2031-03-01', familia: 'Coloração', ordem: 1, quantidade: 2, valor: 100 },
    { competencia: '2031-03-01', familia: 'Sem família', ordem: 1000, quantidade: 1, valor: 5 },
  ]);

  it('meses em ordem e famílias na ordem da configuração', () => {
    expect(quadro.meses).toEqual(['2031-03-01', '2031-04-01']);
    expect(quadro.familias).toEqual(['Coloração', 'Tratamento', 'Sem família']);
  });

  it('mês sem compra na família fica vazio, não zero', () => {
    expect(quadro.celula('2031-04-01', 'Tratamento')).toBeNull();
    expect(quadro.celula('2031-03-01', 'Tratamento')).toEqual({ quantidade: 1, valor: 80 });
  });

  it('o total da família soma os meses', () => {
    expect(quadro.totalDaFamilia('Coloração')).toEqual({ quantidade: 4, valor: 200 });
  });
});
