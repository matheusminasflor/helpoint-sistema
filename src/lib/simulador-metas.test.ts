import { describe, it, expect } from 'vitest';
import {
  calcularCoberturaSimulada, calcularMetaPorPercentual, calcularProjecoes, calcularResumoAtualizacao,
  distribuirMetaAnual,
} from './simulador-metas';
import { mesesFechados } from './comparativoAnos';
import { normalizarHistoricoMetas } from './metas-import';
import { HISTORICO_METAS_FIXTURE } from './__fixtures__/historico-metas';

const ZERO12 = Array(12).fill(0);
const FECHADOS_6 = [true, true, true, true, true, true, false, false, false, false, false, false]; // jan-jun fechados

describe('calcularProjecoes', () => {
  // Cenário-base do §1.3: 6 meses fechados somando 600 (média 100), meta
  // simulada de 1800 no ano — usado nos primeiros seis testes.
  const metas = Array(12).fill(150); // total = 1800
  const realizadoAtual = [100, 100, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0]; // R = 600, F = 6
  // Correção da auditoria (achado P1, "asserção decorativa"): com o ano
  // anterior UNIFORME (90 em todo mês), a soma dos 6 meses fechados (jan-jun,
  // 540) e a soma dos 6 abertos (jul-dez, 540) davam o MESMO número — o
  // teste de `projecaoRepetindoAnoAnterior` passava trocando "abertos" por
  // "fechados" dentro da função. Agora jan-jun (fechados) soma 480 e jul-dez
  // (abertos) soma 660 — F ≠ A, e só a soma certa (a dos ABERTOS) bate.
  const realizadoAnterior = [80, 80, 80, 80, 80, 80, 110, 110, 110, 110, 110, 110];

  it('meta do ano é a soma dos doze campos simulados', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).metaDoAno).toBe(1800);
  });

  it('quanto falta é meta do ano menos o realizado acumulado (1800 - 600 = 1200)', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).quantoFalta).toBe(1200);
  });

  it('quanto falta fica NEGATIVO (não zerado) quando a meta já foi superada', () => {
    const metaBaixa = Array(12).fill(40); // total = 480, menor que os 600 já realizados
    expect(calcularProjecoes(metaBaixa, realizadoAtual, realizadoAnterior, FECHADOS_6).quantoFalta).toBe(-120);
  });

  it('necessário por mês nos meses abertos: 1200 / 6 meses abertos = 200', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).necessarioPorMesAbertos).toBe(200);
  });

  it('esforço sobre a média realizada: necessário (200) / média realizada (100) = 2,0', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).esforcoSobreMediaRealizada).toBe(2);
  });

  it('projeção no ritmo atual: média realizada (100) × 12 = 1200', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).projecaoRitmoAtual).toBe(1200);
  });

  it('projeção repetindo o ano anterior: realizado (600) + ano anterior dos 6 meses ABERTOS (jul-dez, 110×6=660) = 1260 — nunca a soma dos fechados (480)', () => {
    expect(calcularProjecoes(metas, realizadoAtual, realizadoAnterior, FECHADOS_6).projecaoRepetindoAnoAnterior).toBe(1260);
  });

  // Bordas do §1.3.
  it('ano inteiro aberto (F=0): necessário por mês usa os 12 meses abertos, esforço e ritmo atual são nulos', () => {
    const fechados = Array(12).fill(false);
    const p = calcularProjecoes(Array(12).fill(100), ZERO12, ZERO12, fechados);
    expect(p.necessarioPorMesAbertos).toBe(100); // (1200 - 0) / 12
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBeNull();
  });

  it('ano inteiro fechado (A=0): necessário por mês e esforço são nulos ("ano fechado")', () => {
    const fechados = Array(12).fill(true);
    const realizado = Array(12).fill(100); // R = 1200, F = 12
    const p = calcularProjecoes(Array(12).fill(100), realizado, ZERO12, fechados);
    expect(p.necessarioPorMesAbertos).toBeNull();
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBe(1200); // média (100) × 12, ainda válida
  });

  it('realizado zero nos meses fechados (F>0, R=0): esforço é nulo, nunca divisão por zero', () => {
    const p = calcularProjecoes(metas, ZERO12, realizadoAnterior, FECHADOS_6);
    expect(p.esforcoSobreMediaRealizada).toBeNull();
    expect(p.projecaoRitmoAtual).toBe(0);
  });

  // Correção da auditoria (achado GRAVE, 2026-09-22): com o JSON real,
  // agosto/2026 é fechado mas sem dado. Com o `?? 0` antigo ele entrava na
  // média (dividindo por 8 meses) e derrubava a média realizada de
  // 425.394,98 para 372.220,60 — e a projeção no ritmo atual, de 5,10 M
  // para 4,47 M.
  it('com o JSON real: agosto/2026 (fechado, sem dado) sai da média e do divisor — 425.394,98 e 5,10 M, não 372.220,60 e 4,47 M', () => {
    const previa = normalizarHistoricoMetas(HISTORICO_METAS_FIXTURE);
    const ano2026 = previa.anos.find((a) => a.ano === 2026)!;
    const total2026 = ano2026.totalRealizado;
    const total2025 = previa.anos.find((a) => a.ano === 2025)!.totalRealizado;
    const fechados = mesesFechados(2026, '2026-09-22'); // jan-ago fechados

    // A meta de 2026 no JSON real não tem ausência em nenhum mês (ver
    // metas-import.test.ts) — o cast é seguro, não um `any` escondido.
    const p = calcularProjecoes(ano2026.meta as number[], total2026, total2025, fechados);

    expect(p.projecaoRitmoAtual).toBeCloseTo(5104739.73, 2); // 5,10 M
    expect(p.projecaoRitmoAtual! / 12).toBeCloseTo(425394.98, 2); // média realizada
  });
});

describe('distribuirMetaAnual', () => {
  it('distribui o restante (total - metas fechadas) igualmente pelos meses abertos', () => {
    const metasAtuais = [100, 100, 100, 100, 100, 100, 0, 0, 0, 0, 0, 0]; // 600 nos 6 fechados
    const resultado = distribuirMetaAnual(1800, metasAtuais, FECHADOS_6);
    expect(resultado).not.toBeNull();
    // (1800 - 600) / 6 = 200 por mês aberto; os fechados ficam como estavam.
    expect(resultado!.slice(0, 6)).toEqual([100, 100, 100, 100, 100, 100]);
    expect(resultado!.slice(6)).toEqual([200, 200, 200, 200, 200, 200]);
  });

  it('a soma dos doze depois de distribuir é EXATAMENTE o total pedido, sem centavo perdido', () => {
    const metasAtuais = [111.11, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    const resultado = distribuirMetaAnual(1000, metasAtuais, fechados);
    const soma = resultado!.reduce((s, v) => s + v, 0);
    expect(soma).toBeCloseTo(1000, 10);
  });

  it('a sobra de centavos (arredondamento) vai para o ÚLTIMO mês aberto', () => {
    // 100 / 3 = 33,33... — em centavos, 10000/3 = 3333,33, então 3333 por mês
    // e 1 centavo de sobra (10000 - 3333*3 = 1) no último aberto.
    const metasAtuais = ZERO12;
    const fechados = [true, true, true, true, true, true, true, true, true, false, false, false];
    const resultado = distribuirMetaAnual(100, metasAtuais, fechados);
    expect(resultado!.slice(9)).toEqual([33.33, 33.33, 33.34]);
  });

  it('não distribui (retorna null) quando o total pedido já foi alcançado nos meses fechados', () => {
    const metasAtuais = [1000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    expect(distribuirMetaAnual(500, metasAtuais, fechados)).toBeNull();
  });

  it('não distribui (retorna null) quando não há mês aberto (ano fechado)', () => {
    expect(distribuirMetaAnual(1000, ZERO12, Array(12).fill(true))).toBeNull();
  });

  // Borda do P2 (correção da auditoria): o restante (total − meta dos meses
  // fechados) pode dar EXATAMENTE zero, não só negativo. A função recusa
  // (`<= 0`) — decisão já escrita no código, sem teste que a fixasse.
  it('não distribui (retorna null) quando o restante é EXATAMENTE zero', () => {
    const metasAtuais = [500, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; // 500 no único mês fechado
    const fechados = [true, false, false, false, false, false, false, false, false, false, false, false];
    expect(distribuirMetaAnual(500, metasAtuais, fechados)).toBeNull(); // total pedido == soma dos fechados
  });
});

describe('calcularCoberturaSimulada', () => {
  it('mês a mês: realizado dividido pela meta simulada daquele mês', () => {
    const metas = [200, 100, 0, 300];
    const realizado = [100, 150, 50, 300];
    const { mensal } = calcularCoberturaSimulada(metas, realizado);
    expect(mensal[0]).toBe(0.5);
    expect(mensal[1]).toBe(1.5); // acima de 100% — aparece, não é truncada
    expect(mensal[2]).toBeNull(); // meta zerada no mês -> nula, nunca divisão por zero
    expect(mensal[3]).toBe(1);
  });

  it('acumulada no ano: soma do realizado sobre a soma da meta simulada, podendo passar de 100%', () => {
    const metas = Array(12).fill(100); // meta do ano = 1200
    const realizado = Array(12).fill(150); // realizado = 1800
    expect(calcularCoberturaSimulada(metas, realizado).acumulada).toBe(1.5);
  });

  it('acumulada é nula quando a meta do ano é zero — nunca divisão por zero', () => {
    expect(calcularCoberturaSimulada(Array(12).fill(0), Array(12).fill(100)).acumulada).toBeNull();
  });

  // Correção da auditoria (achado GRAVE, 2026-09-22): com o JSON real, a
  // meta de agosto/2026 existe (478.988,81) mas o realizado ainda não foi
  // importado (null). Com o `?? 0` antigo isso mostrava 0% de cobertura —
  // a leitura certa é "sem dado" (nulo), nunca 0%.
  it('com o JSON real: cobertura de agosto/2026 (meta existe, realizado sem dado) é nula, nunca 0%', () => {
    const previa = normalizarHistoricoMetas(HISTORICO_METAS_FIXTURE);
    const ano2026 = previa.anos.find((a) => a.ano === 2026)!;
    expect(ano2026.meta![7]).not.toBeNull(); // a meta de agosto existe
    expect(ano2026.totalRealizado[7]).toBeNull(); // o realizado, não

    // A meta de 2026 no JSON real não tem ausência em nenhum mês (ver
    // metas-import.test.ts) — o cast é seguro, não um `any` escondido.
    const { mensal } = calcularCoberturaSimulada(ano2026.meta as number[], ano2026.totalRealizado);
    expect(mensal[7]).toBeNull();
  });
});

describe('calcularMetaPorPercentual', () => {
  it('120% sobre o realizado do mesmo mês do ano anterior', () => {
    const r = calcularMetaPorPercentual(120, [1000, 2000, 500]);
    expect(r.metas).toEqual([1200, 2400, 600]);
    expect(r.mesesSemBase).toBe(0);
  });

  it('mês sem realizado no ano anterior vira NULO, nunca zero — e é contado em mesesSemBase', () => {
    const r = calcularMetaPorPercentual(120, [1000, null, 2000, null]);
    expect(r.metas).toEqual([1200, null, 2400, null]);
    expect(r.mesesSemBase).toBe(2);
  });

  // MUTAÇÃO: `base ?? 0` no lugar de propagar o nulo faria o mês sem base
  // virar meta ZERO (0 * percentual = 0) em vez de nulo — a asserção acima
  // já reprova isso (`toEqual([1200, null, ...])` falharia com `0` no
  // lugar), mas esta prova isola o sintoma: nenhum mês pode ficar em
  // `mesesSemBase = 0` quando há `null` na entrada.
  it('MUTAÇÃO: com `?? 0` no lugar do nulo, mesesSemBase cairia para 0 — aqui tem de ser 1', () => {
    const r = calcularMetaPorPercentual(120, [1000, null]);
    expect(r.mesesSemBase).toBe(1);
    expect(r.metas[1]).toBeNull();
  });
});

describe('calcularResumoAtualizacao', () => {
  it('conta só os meses cujo valor proposto difere do já salvo', () => {
    const atuais = [100, 100, 100];
    const propostos = [100, 150, 100]; // só o mês 1 (índice 1) muda
    const r = calcularResumoAtualizacao([{ carteira: 'VIP', atuais: [...atuais, ...Array(9).fill(0)], propostos: [...propostos, ...Array(9).fill(null)] }]);
    expect(r.meses).toBe(1);
    expect(r.carteiras).toEqual(['VIP']);
  });

  it('mês proposto NULO (sem base) não conta como mudança, e não some do total antes/depois', () => {
    const atuais = [100, 200, 300, ...Array(9).fill(0)];
    const propostos = [100, null, 300, ...Array(9).fill(null)]; // nenhum muda
    const r = calcularResumoAtualizacao([{ carteira: 'MG', atuais, propostos }]);
    expect(r.meses).toBe(0);
    expect(r.carteiras).toEqual([]);
    expect(r.totalAntes).toBe(600);
    expect(r.totalDepois).toBe(600);
  });

  it('total antes × depois somam as doze posições, carteira nula aparece como "Total da empresa"', () => {
    const atuais = [100, ...Array(11).fill(0)];
    const propostos = [200, ...Array(11).fill(null)]; // muda de 100 para 200
    const r = calcularResumoAtualizacao([{ carteira: null, atuais, propostos }]);
    expect(r.meses).toBe(1);
    expect(r.carteiras).toEqual(['Total da empresa']);
    expect(r.totalAntes).toBe(100);
    expect(r.totalDepois).toBe(200);
  });

  it('várias carteiras: só entram no resumo as que têm ao menos um mês mudando', () => {
    const semMudanca = { carteira: 'VIP', atuais: Array(12).fill(50), propostos: Array(12).fill(50) };
    const comMudanca = { carteira: 'MG', atuais: Array(12).fill(50), propostos: [...Array(11).fill(50), 999] };
    const r = calcularResumoAtualizacao([semMudanca, comMudanca]);
    expect(r.meses).toBe(1);
    expect(r.carteiras).toEqual(['MG']);
  });

  // MUTAÇÃO: contar TODO mês não-nulo como "mudança" (em vez de comparar com
  // o atual) faria `meses` incluir os que ficaram iguais — aqui, dos 12
  // meses propostos (todos não-nulos), só 1 realmente muda.
  it('MUTAÇÃO: contar todo mês proposto não-nulo (sem comparar com o atual) daria 12, não 1', () => {
    const atuais = Array(12).fill(50);
    const propostos = [...Array(11).fill(50), 999];
    const r = calcularResumoAtualizacao([{ carteira: 'VIP', atuais, propostos }]);
    expect(r.meses).toBe(1);
  });
});
