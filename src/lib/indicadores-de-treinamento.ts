// Os indicadores de treinamento do Educacional (rodada 2, R6): o subtítulo da tela prometia "treinamentos e certificados"
// e só mostrava chamados. Não existe certificado emitido no sistema ("concluir registra, não emite certificado",
// migration 20261006010000): o número de certificado é o de participação concluída — quem pode recebê-lo.

export interface TurmaComInscritos {
  starts_at: string;
  training: { title: string; hours: number | null } | null;
  inscritos: { status: string; profile_id: string | null; customer_profile_id: string | null }[];
}

export interface IndicadoresDeTreinamento {
  turmas: number; inscritos: number; concluidos: number; faltas: number; presenca: number | null;
  horasConcluidas: number; internos: number; clientes: number;
  porTreinamento: { titulo: string; turmas: number; inscritos: number; concluidos: number }[];
}

/** Das turmas do período: inscrições que não foram canceladas, quem concluiu, quem faltou e as horas concluídas. */
export function indicadoresDeTreinamento(turmas: TurmaComInscritos[]): IndicadoresDeTreinamento {
  const r: IndicadoresDeTreinamento = { turmas: turmas.length, inscritos: 0, concluidos: 0, faltas: 0, presenca: null, horasConcluidas: 0, internos: 0, clientes: 0, porTreinamento: [] };
  const por = new Map<string, { titulo: string; turmas: number; inscritos: number; concluidos: number }>();
  let compareceram = 0;
  for (const t of turmas) {
    const titulo = t.training?.title ?? '(sem nome)';
    const g = por.get(titulo) ?? { titulo, turmas: 0, inscritos: 0, concluidos: 0 };
    g.turmas += 1;
    for (const i of t.inscritos.filter((x) => x.status !== 'cancelado')) {
      r.inscritos += 1; g.inscritos += 1;
      if (i.profile_id) r.internos += 1; else r.clientes += 1;
      if (i.status === 'concluido') { r.concluidos += 1; g.concluidos += 1; r.horasConcluidas += Number(t.training?.hours ?? 0); }
      if (i.status === 'faltou') r.faltas += 1;
      if (i.status === 'presente' || i.status === 'concluido') compareceram += 1;
    }
    por.set(titulo, g);
  }
  const decididos = compareceram + r.faltas;
  r.presenca = decididos ? Math.round((compareceram / decididos) * 100) : null;
  r.porTreinamento = [...por.values()].sort((a, b) => b.inscritos - a.inscritos);
  return r;
}
