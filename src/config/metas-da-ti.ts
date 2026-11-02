// As metas dos Indicadores da TI (dono, 2026-11-02; docs/proposta-indicadores-da-semana.md, rodada 2). Cada uma nasce
// com o padrão abaixo — mercado + histórico do FSENSE — e quem configura a TI (ou a Diretoria) muda em
// Configurações de TI › Metas. O valor mudado mora em `dir_metas_dos_setores` (setor 'ti'), o mesmo da Diretoria.
import type { Sentido } from '@/lib/ti-equipe';

export interface MetaDaTI {
  chave: string;
  rotulo: string;
  sentido: Sentido;
  /** Percentual: o amarelo vai até 10 pontos da meta. Tempo e quantidade: até 70% (ou 130%, quando menos é melhor). */
  percentual: boolean;
  padrao: number;
  /** Como o número aparece: "90%", "8 h", "2 por mês". */
  unidade: string;
  /** A meta é por mês e o período da tela leva a parte proporcional (só as interrupções). */
  proporcional?: boolean;
  mercado: string;
}

export const METAS_DA_TI: MetaDaTI[] = [
  { chave: 'sla_cumprido', rotulo: 'SLA cumprido', sentido: 'mais', percentual: true, padrao: 90, unidade: '%',
    mercado: 'Contratos de suporte costumam pedir de 90% a 95% dos chamados dentro do prazo.' },
  { chave: 'primeira_resposta', rotulo: '1ª resposta no prazo', sentido: 'mais', percentual: true, padrao: 90, unidade: '%',
    mercado: 'De 90% a 95%, a mesma prática dos contratos de suporte.' },
  { chave: 'tempo_medio_horas', rotulo: 'Tempo médio de resolução (no máximo)', sentido: 'menos', percentual: false, padrao: 8, unidade: ' h',
    mercado: 'Varia muito por empresa; um dia útil (8 h) é a régua usual de suporte interno.' },
  { chave: 'fsense_trabalho', rotulo: '% Trabalho da equipe (FSENSE)', sentido: 'mais', percentual: true, padrao: 60, unidade: '%',
    mercado: 'Cerca de 50% do dia é produtivo (WorkTime 49%, Hubstaff 51%). Na Minasflor, metade das semanas passa de 55% e 4 em cada 10 passam de 60%.' },
  { chave: 'fsense_ocioso', rotulo: '% Ocioso da equipe (FSENSE, no máximo)', sentido: 'menos', percentual: true, padrao: 15, unidade: '%',
    mercado: 'Não há régua comparável (cada ferramenta mede de um jeito). Na Minasflor, metade das semanas fica abaixo de 15%.' },
  { chave: 'interrupcoes', rotulo: 'Interrupções: luz, internet, sistema, intranet (no máximo)', sentido: 'menos', percentual: false,
    padrao: 2, unidade: ' por mês', proporcional: true, mercado: 'Sem régua de mercado; 2 por mês era a meta da planilha.' },
];

export const META_DA_TI = Object.fromEntries(METAS_DA_TI.map((m) => [m.chave, m])) as Record<string, MetaDaTI>;

/** A meta em vigor: a gravada, ou o padrão. */
export const metaEmVigor = (metas: Map<string, number> | undefined, chave: string): number | undefined =>
  metas?.get(`ti.${chave}`) ?? META_DA_TI[chave]?.padrao;
