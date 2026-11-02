// As metas dos Indicadores da TI. Rodada 2 (2026-11-02): padrão de mercado + histórico, mudado em Configurações de
// TI › Metas. Rodada 3 (mesmo dia): a meta SOBE EM DEGRAUS — a TI tem uma pessoa no helpdesk e o líder de recursos
// operacionais, e 90% de saída não se sustentava (média de 80% nas últimas 4 semanas). Cada indicador tem a sua
// escada padrão abaixo; degraus gravados (`ti_metas_degraus`, 20270212190000) substituem a escada inteira.
import type { Sentido } from '@/lib/ti-equipe';

export interface Degrau { a_partir_de: string; meta: number }

export interface MetaDaTI {
  chave: string;
  rotulo: string;
  sentido: Sentido;
  /** Percentual: o amarelo vai até 10 pontos da meta. Tempo e quantidade: até 70% (ou 130%, quando menos é melhor). */
  percentual: boolean;
  /** A escada padrão, do primeiro degrau ao último. */
  escada: Degrau[];
  /** Como o número aparece: "90%", "8 h", "2 por mês". */
  unidade: string;
  /** A meta é por mês e o período da tela leva a parte proporcional (só as interrupções). */
  proporcional?: boolean;
  mercado: string;
}

const NOV = '2026-11-01', JAN = '2027-01-01', MAR = '2027-03-01';

export const METAS_DA_TI: MetaDaTI[] = [
  { chave: 'sla_cumprido', rotulo: 'SLA cumprido', sentido: 'mais', percentual: true, unidade: '%',
    escada: [{ a_partir_de: NOV, meta: 80 }, { a_partir_de: JAN, meta: 85 }, { a_partir_de: MAR, meta: 90 }],
    mercado: 'Contratos de suporte costumam pedir de 90% a 95% dos chamados dentro do prazo. A TI da Minasflor fez 80% em média nas últimas semanas.' },
  { chave: 'primeira_resposta', rotulo: '1ª resposta no prazo', sentido: 'mais', percentual: true, unidade: '%',
    escada: [{ a_partir_de: NOV, meta: 85 }, { a_partir_de: JAN, meta: 90 }],
    mercado: 'De 90% a 95%, a mesma prática dos contratos de suporte.' },
  // Horas CORRIDAS (com noite e fim de semana), como a tela conta: 8 h, a régua de "um dia útil", era injusta.
  { chave: 'tempo_medio_horas', rotulo: 'Tempo médio de resolução (no máximo)', sentido: 'menos', percentual: false, unidade: ' h',
    escada: [{ a_partir_de: NOV, meta: 24 }, { a_partir_de: JAN, meta: 16 }, { a_partir_de: MAR, meta: 12 }],
    mercado: 'Conta horas corridas, com noite e fim de semana: um chamado aberto às 17h e resolvido às 9h do dia seguinte já soma 16 h.' },
  { chave: 'fsense_trabalho', rotulo: '% Trabalho da equipe (FSENSE)', sentido: 'mais', percentual: true, unidade: '%',
    escada: [{ a_partir_de: NOV, meta: 55 }, { a_partir_de: JAN, meta: 60 }],
    mercado: 'Cerca de 50% do dia é produtivo (WorkTime 49%, Hubstaff 51%). Na Minasflor, metade das semanas passa de 55% e 4 em cada 10 passam de 60%.' },
  { chave: 'fsense_ocioso', rotulo: '% Ocioso da equipe (FSENSE, no máximo)', sentido: 'menos', percentual: true, unidade: '%',
    escada: [{ a_partir_de: NOV, meta: 20 }, { a_partir_de: JAN, meta: 15 }],
    mercado: 'Não há régua comparável (cada ferramenta mede de um jeito). Na Minasflor, metade das semanas fica abaixo de 15%.' },
  { chave: 'interrupcoes', rotulo: 'Interrupções: luz, internet, sistema, intranet (no máximo)', sentido: 'menos', percentual: false,
    unidade: ' por mês', proporcional: true, escada: [{ a_partir_de: NOV, meta: 2 }],
    mercado: 'Sem régua de mercado; 2 por mês era a meta da planilha.' },
];

export const META_DA_TI = Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, m])) as Record<string, MetaDaTI>;

/** Os degraus gravados, por indicador (o que `useMetasDaTI` devolve). */
export type DegrausGravados = Map<string, Degrau[]>;

/** A escada que vale: a gravada, se houver algum degrau, ou a padrão. Sempre em ordem. */
export function escadaDe(gravados: DegrausGravados | undefined, chave: string): Degrau[] {
  const g = gravados?.get(chave);
  return [...(g && g.length ? g : META_DA_TI[chave]?.escada ?? [])].sort((a, b) => a.a_partir_de.localeCompare(b.a_partir_de));
}

/** O degrau em vigor no dia (o último que já começou; antes do primeiro, vale o primeiro). */
export function degrauNoDia(escada: Degrau[], diaISO: string): Degrau | undefined {
  return [...escada].reverse().find((d) => d.a_partir_de <= diaISO) ?? escada[0];
}

/** O próximo degrau depois do dia, para a tela dizer "em janeiro sobe para 85%". */
export const proximoDegrau = (escada: Degrau[], diaISO: string): Degrau | undefined => escada.find((d) => d.a_partir_de > diaISO);

/** A meta em vigor no dia. */
export const metaNoDia = (gravados: DegrausGravados | undefined, chave: string, diaISO: string): number | undefined =>
  degrauNoDia(escadaDe(gravados, chave), diaISO)?.meta;

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const nomeDoMes = (diaISO: string) => MESES[Number(diaISO.slice(5, 7)) - 1];

/**
 * A nota do cartão: "meta de novembro: pelo menos 80% · em janeiro sobe para 85%". `formatar` escreve o número com a
 * unidade ("80%", "24 h"); `dia` é o último dia do período da tela.
 */
export function notaDaMeta(gravados: DegrausGravados | undefined, chave: string, dia: string, formatar: (v: number) => string): string | undefined {
  const def = META_DA_TI[chave];
  const escada = escadaDe(gravados, chave);
  const agora = degrauNoDia(escada, dia);
  if (!def || !agora) return undefined;
  const sentido = def.sentido === 'mais' ? 'pelo menos' : 'até';
  const prox = proximoDegrau(escada, dia);
  const muda = prox ? ` · em ${nomeDoMes(prox.a_partir_de)} ${prox.meta > agora.meta ? 'sobe' : 'cai'} para ${formatar(prox.meta)}` : '';
  return `meta de ${nomeDoMes(dia)}: ${sentido} ${formatar(agora.meta)}${muda}`;
}
