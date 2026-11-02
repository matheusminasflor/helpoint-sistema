// A frase de resumo no topo dos Indicadores da TI (rodada 2, 2026-11-02): o que o diretor precisa ouvir primeiro,
// montada com os próprios números da tela — sem IA, então não erra nem inventa. Cada frase só entra quando há dado.
import { formatarHoras } from '@/lib/horas';

export interface DadosDoResumo {
  periodo: string;
  total: number;
  resolvidos: number;
  sla: number | null;
  metaSla?: number;
  tempo: number | null;
  tempoAnterior: number | null;
  trabalho: number | null;
  metaTrabalho?: number;
  semanaAConfirmar: boolean;
  projetosAlemDoTermino: number;
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;

export function fraseDoResumo(d: DadosDoResumo): string {
  const frases = [`${d.periodo}: ${d.total} ${d.total === 1 ? 'chamado' : 'chamados'}, ${d.resolvidos} ${d.resolvidos === 1 ? 'resolvido' : 'resolvidos'}.`];
  if (d.sla !== null && d.total > 0) {
    frases.push(d.metaSla === undefined ? `O SLA ficou em ${pct(d.sla)}.`
      : d.sla >= d.metaSla ? `O SLA ficou em ${pct(d.sla)}, na meta de ${pct(d.metaSla)}.`
        : `O SLA ficou em ${pct(d.sla)}, abaixo da meta de ${pct(d.metaSla)}.`);
  }
  if (d.tempo !== null && d.tempo > 0 && d.tempoAnterior !== null && d.tempoAnterior > 0 && d.tempo !== d.tempoAnterior) {
    frases.push(`O tempo médio ${d.tempo < d.tempoAnterior ? 'caiu' : 'subiu'} de ${formatarHoras(d.tempoAnterior)} para ${formatarHoras(d.tempo)}.`);
  }
  if (d.trabalho !== null) {
    frases.push(`A equipe trabalhou ${pct(d.trabalho)} do tempo medido pelo FSENSE${d.metaTrabalho === undefined ? '' : ` (meta ${pct(d.metaTrabalho)})`}.`);
  } else if (d.semanaAConfirmar) {
    frases.push('A semana do FSENSE ainda não foi confirmada.');
  }
  if (d.projetosAlemDoTermino > 0) {
    frases.push(`${d.projetosAlemDoTermino} ${d.projetosAlemDoTermino === 1 ? 'projeto passou' : 'projetos passaram'} do término.`);
  }
  return frases.join(' ');
}
