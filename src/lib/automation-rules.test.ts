import { describe, it, expect } from "vitest";
import { describeRule } from "./automation-rules";
import type { AutomationRule } from "./automation-rules";

const PESSOAS = [{ id: "user-1", name: "João" }];
const CATEGORIAS = [{ id: "cat-1", name: "Impressora" }];

/**
 * `AutomationRule` é a linha do banco (várias colunas obrigatórias que não
 * importam para `describeRule`); este helper preenche o resto com valores
 * neutros para cada teste focar só em `trigger_kind`/`trigger_config` e
 * `action_kind`/`action_config`.
 */
function makeRule(overrides: Partial<AutomationRule>): AutomationRule {
  return {
    id: "rule-1",
    tenant_id: "tenant-1",
    module: "tickets",
    name: "Regra de teste",
    is_active: true,
    trigger_kind: "ticket_created",
    trigger_config: {},
    action_kind: "notify",
    action_config: {},
    last_run_at: null,
    last_error: null,
    run_count: 0,
    created_by: null,
    created_at: "2026-09-08T00:00:00Z",
    updated_at: "2026-09-08T00:00:00Z",
    ...overrides,
  };
}

describe("describeRule", () => {
  it("ticket_created com categoria: encaixa 'da categoria X' na frase do gatilho", () => {
    const rule = makeRule({
      trigger_kind: "ticket_created",
      trigger_config: { category_id: "cat-1" },
      action_kind: "assign",
      action_config: { user_id: "user-1" },
    });

    const { quando } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(quando).toBe("um chamado da categoria Impressora é aberto");
  });

  it("ticket_status_changed: descreve o status de destino", () => {
    const rule = makeRule({
      trigger_kind: "ticket_status_changed",
      trigger_config: { status: "resolved" },
    });

    const { quando } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(quando).toBe('um chamado muda para "Resolvido"');
  });

  it("ticket_deadline_expired: usa o rótulo do gatilho sem enfeite quando não há filtro", () => {
    const rule = makeRule({ trigger_kind: "ticket_deadline_expired", trigger_config: {} });

    const { quando } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(quando).toBe("o prazo de um chamado estoura");
  });

  it("schedule diário: 'todo dia às HH:MM'", () => {
    const rule = makeRule({
      trigger_kind: "schedule",
      trigger_config: { every: "day", time: "08:00" },
    });

    const { quando } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(quando).toBe("todo dia às 08:00");
  });

  it("schedule semanal: 'toda <dia da semana> às HH:MM'", () => {
    const rule = makeRule({
      trigger_kind: "schedule",
      trigger_config: { every: "week", weekday: 2, time: "09:00" },
    });

    const { quando } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(quando).toBe("toda terça às 09:00");
  });

  it("notify para equipe: 'avisar Equipe de TI'", () => {
    const rule = makeRule({
      action_kind: "notify",
      action_config: { team_module: "ti" },
    });

    const { entao } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(entao).toBe("avisar Equipe de TI");
  });

  it("assign: 'atribuir o chamado a <nome>'", () => {
    const rule = makeRule({
      action_kind: "assign",
      action_config: { user_id: "user-1" },
    });

    const { entao } = describeRule(rule, PESSOAS, CATEGORIAS);
    expect(entao).toBe("atribuir o chamado a João");
  });
});
