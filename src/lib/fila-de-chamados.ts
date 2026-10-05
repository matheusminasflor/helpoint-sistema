// A ORDEM DA FILA DE CHAMADOS (decisão do dono, 2026-10-04).
//
// A fila de todos os setores era dividida em grupos por prioridade, que abriam e fechavam — e o
// chamado de um grupo fechado ficava escondido. Agora é uma lista só, um chamado por linha, do mais
// urgente para o menos urgente: prioridade (crítica primeiro) e, dentro da mesma prioridade, o
// prazo vencido ou mais perto antes. Sem prazo vai para o fim da prioridade; empate, o mais antigo.

const PESO_DA_PRIORIDADE: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

interface ChamadoNaFila {
  priority: string | null;
  sla_due_at?: string | null;
  due_date?: string | null;
  created_at: string;
}

const prazo = (t: ChamadoNaFila) => {
  const ms = Date.parse(t.sla_due_at || t.due_date || '');
  return Number.isNaN(ms) ? Infinity : ms;
};

export function ordenarPorUrgencia<T extends ChamadoNaFila>(chamados: T[]): T[] {
  return [...chamados].sort((a, b) =>
    (PESO_DA_PRIORIDADE[a.priority ?? ''] ?? 4) - (PESO_DA_PRIORIDADE[b.priority ?? ''] ?? 4)
    || prazo(a) - prazo(b)
    || Date.parse(a.created_at) - Date.parse(b.created_at));
}
