import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getSLATimeRemaining } from "./helpdesk";

/**
 * O contrato de `percentage`: quanto da janela do SLA já foi gasto. Cresce
 * conforme o prazo aperta. `AISecretarySummary` conta "SLA em risco" com
 * `percentage >= 80`, então um número que anda para o lado errado faz o painel
 * ignorar justamente os chamados mais urgentes.
 */
const AGORA = new Date("2026-09-04T12:00:00Z");

/** Janela de 10h: abre às 06:00, vence às 16:00. Às 12:00 gastou 60%. */
const abertoHa = (horas: number) => new Date(AGORA.getTime() - horas * 3600_000).toISOString();
const venceEm = (horas: number) => new Date(AGORA.getTime() + horas * 3600_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(AGORA);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getSLATimeRemaining — percentage", () => {
  it("cresce conforme o prazo se aproxima", () => {
    const cedo = getSLATimeRemaining(venceEm(9), { created_at: abertoHa(1) }).percentage;
    const tarde = getSLATimeRemaining(venceEm(1), { created_at: abertoHa(9) }).percentage;

    expect(tarde).toBeGreaterThan(cedo);
  });

  it("mede a fração da janela, não o relógio absoluto", () => {
    // Aberto há 6h, vence em 4h: janela de 10h, 60% gasta.
    const sla = getSLATimeRemaining(venceEm(4), { created_at: abertoHa(6) });
    expect(sla.percentage).toBeCloseTo(60, 5);
  });

  it("é 0 no minuto em que o chamado abre", () => {
    const sla = getSLATimeRemaining(venceEm(8), { created_at: abertoHa(0) });
    expect(sla.percentage).toBe(0);
  });

  /**
   * O bug que existia: `percentage` era `(minutosRestantes / 60) * 100` na
   * última hora, então caía conforme o prazo apertava. Um chamado com 10
   * minutos de prazo devolvia ~17 e escapava do filtro `>= 80`.
   */
  it("marca como em risco quem está a dez minutos de estourar", () => {
    const sla = getSLATimeRemaining(venceEm(10 / 60), { created_at: abertoHa(9 + 50 / 60) });

    expect(sla.isOverdue).toBe(false);
    expect(sla.percentage).toBeGreaterThanOrEqual(80);
  });

  it("escala com o tamanho do SLA: uma hora restante pesa diferente em janelas diferentes", () => {
    const janelaCurta = getSLATimeRemaining(venceEm(1), { created_at: abertoHa(3) }).percentage;
    const janelaLonga = getSLATimeRemaining(venceEm(1), { created_at: abertoHa(99) }).percentage;

    expect(janelaCurta).toBeCloseTo(75, 5);
    expect(janelaLonga).toBeGreaterThan(janelaCurta);
  });

  it("satura em 100 quando o prazo venceu", () => {
    const sla = getSLATimeRemaining(venceEm(-2), { created_at: abertoHa(8) });

    expect(sla.isOverdue).toBe(true);
    expect(sla.percentage).toBe(100);
  });

  it("sem created_at, cai no palpite da última hora", () => {
    expect(getSLATimeRemaining(venceEm(0.5), {}).percentage).toBe(100);
    expect(getSLATimeRemaining(venceEm(5), {}).percentage).toBe(0);
  });
});

describe("getSLATimeRemaining — relógio parado", () => {
  it("não considera atrasado o chamado resolvido dentro do prazo", () => {
    const sla = getSLATimeRemaining(venceEm(2), {
      status: "resolved",
      resolved_at: abertoHa(1),
      created_at: abertoHa(8),
    });

    expect(sla.isFrozen).toBe(true);
    expect(sla.isOverdue).toBe(false);
  });

  it("marca atraso quando a resolução veio depois do prazo", () => {
    const sla = getSLATimeRemaining(venceEm(-4), {
      status: "resolved",
      resolved_at: abertoHa(1),
      created_at: abertoHa(8),
    });

    expect(sla.isFrozen).toBe(true);
    expect(sla.isOverdue).toBe(true);
  });

  it("sem sla_due_at não há SLA para medir", () => {
    const sla = getSLATimeRemaining(null, { created_at: abertoHa(3) });

    expect(sla.hasSLA).toBe(false);
    expect(sla.label).toBe("Sem SLA");
  });
});
