import { describe, expect, it } from 'vitest';
import { contarVencimentos } from './vencimentos-de-licenca';

describe('contarVencimentos — os números de vencimento das Licenças', () => {
  const agora = new Date(2026, 9, 24, 21, 30); // sexta, 24/10/2026, à noite (quando o UTC já é amanhã)

  it('"este mês" vai até o fim do mês; "30 dias" conta de hoje — não são o mesmo número', () => {
    const v = contarVencimentos(['2026-10-31', '2026-11-15', '2026-11-30'], agora);
    expect(v.esteMes).toBe(1);   // só 31/10
    expect(v.em30).toBe(2);      // 31/10 e 15/11 (até 23/11)
    expect(v.em90).toBe(3);
  });

  it('vence hoje ainda não está vencida, nem à noite', () => {
    const v = contarVencimentos(['2026-10-24', '2026-10-23'], agora);
    expect(v.vencidas).toBe(1);
    expect(v.esteMes).toBe(1);
  });

  it('ignora licença sem data', () => {
    expect(contarVencimentos([null, undefined, ''], agora)).toEqual({ vencidas: 0, esteMes: 0, em30: 0, em90: 0, esteAno: 0 });
  });
});
