// Os indicadores das Solicitações do RH: quantas entraram, em aberto, entregues no prazo e tempo médio. Puro, para o teste.
const CONCLUIDAS = ['concluida'];
const FINAIS = ['concluida', 'recusada', 'cancelada'];

export interface SolicitacaoDoIndicador {
  etapa: string;
  sla_due_at?: string | null;
  encerrada_em?: string | null;
  created_at: string;
}

export function indicadoresDasSolicitacoes(linhas: SolicitacaoDoIndicador[], agora: Date) {
  const concluidas = linhas.filter((s) => CONCLUIDAS.includes(s.etapa));
  const comPrazo = concluidas.filter((s) => s.sla_due_at && s.encerrada_em);
  const noPrazo = comPrazo.filter((s) => s.encerrada_em! <= s.sla_due_at!).length;
  const atrasadas = linhas.filter((s) => !FINAIS.includes(s.etapa) && s.sla_due_at && new Date(s.sla_due_at) < agora).length;
  const horas = comPrazo.reduce((t, s) => t + (new Date(s.encerrada_em!).getTime() - new Date(s.created_at).getTime()) / 3_600_000, 0);
  return {
    total: linhas.length,
    abertas: linhas.filter((s) => !FINAIS.includes(s.etapa)).length,
    atrasadas,
    noPrazo: comPrazo.length ? Math.round((noPrazo / comPrazo.length) * 100) : null,
    tempoMedio: comPrazo.length ? Math.round((horas / comPrazo.length) * 10) / 10 : null,
  };
}
