import { describe, it, expect } from 'vitest';
import { mesesFechados, somaComAusencia, variacaoSobreMesesFechados } from './comparativoAnos';
import { normalizarHistoricoMetas } from './metas-import';
import { HISTORICO_METAS_FIXTURE } from './__fixtures__/historico-metas';

describe('somaComAusencia', () => {
  it('nula quando todos os meses são nulos — o bug do "Fechamento de 2025: R$ 0,00"', () => {
    expect(somaComAusencia(Array(12).fill(null))).toBeNull();
  });
  it('soma só os meses presentes, ignorando os nulos (nunca tratando ausência como zero)', () => {
    expect(somaComAusencia([100, null, 200, null])).toBe(300);
  });
  it('mês com valor 0 de verdade conta como zero (0 já não é "ausência" — quem decide isso é quem lê o JSON)', () => {
    expect(somaComAusencia([0, 100])).toBe(100);
  });
});

describe('mesesFechados', () => {
  it('ano inteiramente passado: os 12 meses são fechados', () => {
    expect(mesesFechados(2024, '2026-09-15')).toEqual(Array(12).fill(true));
  });

  it('ano futuro: nenhum mês é fechado', () => {
    expect(mesesFechados(2027, '2026-09-15')).toEqual(Array(12).fill(false));
  });

  it('ano em curso (hoje em setembro): jan–ago fechados, setembro em diante não', () => {
    const fechados = mesesFechados(2026, '2026-09-15');
    expect(fechados.slice(0, 8)).toEqual(Array(8).fill(true)); // jan..ago
    expect(fechados.slice(8)).toEqual(Array(4).fill(false)); // set..dez
  });
});

describe('variacaoSobreMesesFechados', () => {
  // O cenário que o §15 do documento descreve: setembro de 2026 está pela
  // metade (hoje é 15/09). Sem o filtro de "só meses fechados", setembro
  // (parcial) entraria na soma e a variação despencaria para perto de -50%
  // mesmo com jan–ago idênticos ao ano anterior — uma queda que não existe.
  it('exclui o mês em curso da soma — setembro parcial não derruba a variação', () => {
    const fechados = mesesFechados(2026, '2026-09-15');
    const atual =    [100, 100, 100, 100, 100, 100, 100, 100, /* set parcial */ 50, 0, 0, 0];
    const anterior = [100, 100, 100, 100, 100, 100, 100, 100, /* set inteiro */ 100, 0, 0, 0];

    const variacao = variacaoSobreMesesFechados(atual, anterior, fechados);

    // jan–ago: 800 nos dois lados → variação zero, não a queda de ~44% que
    // apareceria se setembro (50 contra 100) entrasse na conta.
    expect(variacao).toBe(0);
  });

  it('com mês fechado e realmente diferente, a variação aparece', () => {
    const fechados = [true, true, false, false, false, false, false, false, false, false, false, false];
    const atual =    [150, 150, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const anterior = [100, 100, 999, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    expect(variacaoSobreMesesFechados(atual, anterior, fechados)).toBeCloseTo(0.5, 5);
  });

  it('sem nenhum mês fechado ainda, a variação é nula (não zero, não erro)', () => {
    const fechados = Array(12).fill(false);
    expect(variacaoSobreMesesFechados([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [50, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], fechados)).toBeNull();
  });

  it('ano anterior com soma zero nos meses fechados: variação nula, nunca divisão por zero', () => {
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    expect(variacaoSobreMesesFechados([500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], fechados)).toBeNull();
  });

  // Correção da auditoria (achado GRAVE, 2026-09-22): com o JSON real do
  // dono, agosto/2026 é mês FECHADO (hoje é 22/09) mas ainda SEM DADO no
  // HISTORICO_METAS.json (0.0 → null). Com o `?? 0` antigo, isso entrava
  // como zero só do lado de 2026 e a variação despencava para -8,34% — a
  // conta certa, excluindo agosto dos dois lados, dá +4,01%.
  it('com o JSON real: agosto/2026 fechado e sem dado sai da conta dos dois lados — dá +4,01%, não -8,34%', () => {
    const previa = normalizarHistoricoMetas(HISTORICO_METAS_FIXTURE);
    const total2026 = previa.anos.find((a) => a.ano === 2026)!.totalRealizado;
    const total2025 = previa.anos.find((a) => a.ano === 2025)!.totalRealizado;
    const fechados = mesesFechados(2026, '2026-09-22'); // jan-ago fechados

    expect(total2026[7]).toBeNull(); // agosto/2026: fechado, sem dado

    const variacao = variacaoSobreMesesFechados(total2026, total2025, fechados);
    expect(variacao).toBeCloseTo(0.0401, 4); // +4,01%, nunca -8,34%
  });
});
