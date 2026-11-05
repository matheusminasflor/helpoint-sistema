// Os pontos de melhoria de TI › Indicadores (proposta aprovada em 2026-11-05, https://claude.ai/artifact/N98z6fDomjp8skuZxy5U9f):
// o sistema conta e escreve, sem IA. Chamado fora do prazo fica na faixa "Atenção agora", que já existe.
import type { ChamadoDoPeriodo } from '@/hooks/useHelpdeskMetrics';
import { caminhoDo } from '@/lib/arvore-de-categorias';
import { rotuloDoSetor } from '@/lib/setores';

export interface PontoDeMelhoria {
  id: string;
  titulo: string;
  texto: string;
  cor: 'perigo' | 'aviso' | 'info';
  selo: string;
  chamados: ChamadoDoPeriodo[];
}

/** A partir daqui o assunto conta como repetido; abaixo disso é variação normal de um mês. */
const REPETIDO = 5;
/** Alta em relação ao período anterior que merece atenção (%). */
const ALTA = 20;
/** Fatia dos chamados para o setor aparecer como o que mais abre (%). */
const FATIA_DO_SETOR = 20;

const semClassificar = (c: ChamadoDoPeriodo) => caminhoDo(c).some((parte) => /^(outros|sem categoria)$/i.test(parte.trim()));
const agrupar = <T,>(itens: T[], chave: (item: T) => string) => {
  const grupos = new Map<string, T[]>();
  for (const item of itens) grupos.set(chave(item), [...(grupos.get(chave(item)) ?? []), item]);
  return [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
};
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function pontosDeMelhoria({ chamados, totalAnterior }: { chamados: ChamadoDoPeriodo[]; totalAnterior: number | null }): PontoDeMelhoria[] {
  const pontos: PontoDeMelhoria[] = [];
  const total = chamados.length;
  if (!total) return pontos;

  const atendentes = new Set(chamados.flatMap((c) => c.assignee?.email ?? c.assignee?.full_name ?? [])).size;
  const alta = totalAnterior ? Math.round(((total - totalAnterior) / totalAnterior) * 100) : null;
  const subiu = alta !== null && alta >= ALTA;
  if (atendentes) {
    const porAtendente = Math.round(chamados.filter((c) => c.assignee).length / atendentes);
    pontos.push({
      id: 'equipe', titulo: subiu ? 'Equipe com mais demanda' : 'Carga da equipe', cor: subiu ? 'perigo' : 'info', selo: subiu ? 'Atenção' : 'Observação',
      texto: `${plural(atendentes, 'atendente', 'atendentes')} com cerca de ${plural(porAtendente, 'chamado', 'chamados')} cada um.`
        + (subiu ? ` O volume subiu ${alta}% em relação ao período anterior: de ${totalAnterior} para ${total}.` : ''),
      chamados,
    });
  }

  const classificados = chamados.filter((c) => !semClassificar(c));
  for (const [assunto, doAssunto] of agrupar(classificados, (c) => caminhoDo(c).join(' › ')).slice(0, 3)) {
    if (doAssunto.length < REPETIDO) break;
    const setores = agrupar(doAssunto.filter((c) => c.setor), (c) => c.setor!).slice(0, 3)
      .map(([setor, deles]) => `${deles.length} ${setor === 'ti' ? 'da TI' : `de ${rotuloDoSetor(setor)}`}`);
    pontos.push({
      id: `assunto-${assunto}`, titulo: assunto, cor: 'aviso', selo: 'Repetição', chamados: doAssunto,
      texto: `${plural(doAssunto.length, 'chamado', 'chamados')} no período${setores.length ? `: ${setores.join(', ')}` : ''}.`,
    });
  }

  const [setor, doSetor] = agrupar(chamados.filter((c) => c.setor), (c) => c.setor!)[0] ?? [];
  if (setor && doSetor && (doSetor.length / total) * 100 >= FATIA_DO_SETOR) {
    pontos.push({
      id: 'setor', titulo: `${rotuloDoSetor(setor)} é quem mais abre`, cor: 'info', selo: 'Observação', chamados: doSetor,
      texto: `${doSetor.length} dos ${total} chamados vieram desse setor (${Math.round((doSetor.length / total) * 100)}%).`,
    });
  }

  const soltos = chamados.filter(semClassificar);
  if (soltos.length >= REPETIDO) {
    pontos.push({
      id: 'sem-categoria', titulo: 'Chamados sem categoria clara', cor: 'aviso', selo: 'Revisar', chamados: soltos,
      texto: `${plural(soltos.length, 'chamado ficou', 'chamados ficaram')} em "Outros" ou sem categoria (${Math.round((soltos.length / total) * 100)}% do total).`,
    });
  }
  return pontos;
}
