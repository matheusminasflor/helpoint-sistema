// As contas do projeto por setor (docs/plano-projetos.md) — puras, para a tela e o teste falarem a
// mesma língua. O banco guarda; aqui se numera (1.1, 1.2…, como na planilha do dono), se acende o farol
// e se desenha a barra do tempo.

export type Farol = 'nao_iniciado' | 'em_andamento' | 'atrasado' | 'finalizado';

export const ROTULO_DO_FAROL: Record<Farol, string> = {
  nao_iniciado: 'Não iniciado',
  em_andamento: 'Em andamento',
  atrasado: 'Atrasado',
  finalizado: 'Finalizado',
};

export interface AtividadeBase {
  id: string;
  fase_id: string | null;
  setor: string | null;
  status: string | null;
  percentual: number;
  inicio: string | null;
  termino: string | null;
  position: number;
  user_id: string | null;
}

export interface FaseBase {
  id: string;
  nome: string;
  ordem: number;
}

/** Atrasado acende sozinho: passou do término (dia de Brasília) e não chegou a 100%. */
export function farolDaAtividade(a: Pick<AtividadeBase, 'status' | 'percentual' | 'termino'>, hojeISO: string): Farol {
  if (a.status === 'completed' || a.percentual >= 100) return 'finalizado';
  if (a.termino && a.termino < hojeISO) return 'atrasado';
  if (a.status === 'in_progress' || a.percentual > 0) return 'em_andamento';
  return 'nao_iniciado';
}

/** O % de um conjunto (fase ou projeto) é a média das atividades; sem atividade, 0. */
export function percentualMedio(atividades: Pick<AtividadeBase, 'percentual'>[]): number {
  if (atividades.length === 0) return 0;
  return Math.round(atividades.reduce((s, a) => s + (a.percentual ?? 0), 0) / atividades.length);
}

export interface FaseNumerada<A extends AtividadeBase> {
  fase: FaseBase | null;
  numero: number;
  atividades: Array<A & { numero: string }>;
}

/**
 * Fases na ordem, cada uma com as suas atividades numeradas ("2.3"). Atividade sem fase vai para um
 * grupo "Sem fase" no fim (número 0), para nada sumir da tela.
 */
export function numerarCronograma<A extends AtividadeBase>(fases: FaseBase[], atividades: A[]): FaseNumerada<A>[] {
  const ordenadas = [...fases].sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome));
  const porPosicao = (x: A, y: A) => x.position - y.position;
  const grupos: FaseNumerada<A>[] = ordenadas.map((fase, i) => ({
    fase,
    numero: i + 1,
    atividades: atividades
      .filter((a) => a.fase_id === fase.id)
      .sort(porPosicao)
      .map((a, j) => ({ ...a, numero: `${i + 1}.${j + 1}` })),
  }));
  const idsDasFases = new Set(fases.map((f) => f.id));
  const semFase = atividades.filter((a) => !a.fase_id || !idsDasFases.has(a.fase_id)).sort(porPosicao);
  if (semFase.length) {
    grupos.push({ fase: null, numero: 0, atividades: semFase.map((a, j) => ({ ...a, numero: `—.${j + 1}` })) });
  }
  return grupos;
}

/** Setores envolvidos que ainda não criaram nenhuma atividade ("Aguardando plano"). */
export function setoresSemPlano(setores: string[], atividades: Pick<AtividadeBase, 'setor'>[]): string[] {
  const comPlano = new Set(atividades.map((a) => a.setor).filter(Boolean));
  return setores.filter((s) => !comPlano.has(s));
}

/** A janela da linha do tempo: do primeiro início ao último término (ou à entrega), em dias inteiros. */
export function janelaDoCronograma(
  atividades: Pick<AtividadeBase, 'inicio' | 'termino'>[],
  entrega: string | null,
  hojeISO: string,
): { de: string; ate: string } | null {
  const datas = atividades.flatMap((a) => [a.inicio, a.termino]).filter((d): d is string => !!d);
  if (entrega) datas.push(entrega);
  if (datas.length === 0) return null;
  datas.push(hojeISO);
  datas.sort();
  return { de: datas[0], ate: datas[datas.length - 1] };
}

const dias = (de: string, ate: string) =>
  Math.round((Date.parse(`${ate}T12:00:00`) - Date.parse(`${de}T12:00:00`)) / 86_400_000);

/** Posição (em %) de um trecho na janela: esquerda e largura. Sem início, a barra é só o dia do término. */
export function posicaoNaJanela(
  inicio: string | null,
  termino: string | null,
  janela: { de: string; ate: string },
): { esquerda: number; largura: number } | null {
  if (!inicio && !termino) return null;
  const total = Math.max(1, dias(janela.de, janela.ate) + 1);
  const de = inicio ?? termino!;
  const ate = termino ?? inicio!;
  const esquerda = (Math.max(0, dias(janela.de, de)) / total) * 100;
  const largura = (Math.max(1, dias(de, ate) + 1) / total) * 100;
  return { esquerda, largura: Math.min(largura, 100 - esquerda) };
}

/** Onde fica a linha de "hoje" na janela, em %. */
export function hojeNaJanela(hojeISO: string, janela: { de: string; ate: string }): number {
  const total = Math.max(1, dias(janela.de, janela.ate) + 1);
  return Math.min(100, Math.max(0, (dias(janela.de, hojeISO) / total) * 100));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Os meses que a janela atravessa, com onde cada um começa (em %) — o cabeçalho "set out nov dez" do desenho. */
export function mesesDaJanela(janela: { de: string; ate: string }): { rotulo: string; esquerda: number }[] {
  const total = Math.max(1, dias(janela.de, janela.ate) + 1);
  const meses: { rotulo: string; esquerda: number }[] = [];
  let [ano, mes] = janela.de.split('-').map(Number);
  for (let i = 0; i < 36; i++) {
    const inicio = `${ano}-${String(mes).padStart(2, '0')}-01`;
    if (inicio > janela.ate) break;
    meses.push({ rotulo: MESES[mes - 1], esquerda: Math.max(0, (dias(janela.de, inicio) / total) * 100) });
    mes += 1;
    if (mes > 12) { mes = 1; ano += 1; }
  }
  return meses;
}

export type TomDoSelo = 'atrasado' | 'em_andamento' | 'finalizado' | 'nao_iniciado';

/** O selo de um conjunto (fase ou projeto): "2 atrasadas" manda; depois Finalizada, Em andamento, Não iniciada. */
export function seloDoConjunto(
  atividades: Pick<AtividadeBase, 'status' | 'percentual' | 'termino'>[],
  hojeISO: string,
  feminino = true,
): { texto: string; tom: TomDoSelo } {
  const farois = atividades.map((a) => farolDaAtividade(a, hojeISO));
  const atrasadas = farois.filter((f) => f === 'atrasado').length;
  if (atrasadas) return { texto: `${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}`, tom: 'atrasado' };
  const o = feminino ? 'a' : 'o';
  if (farois.length && farois.every((f) => f === 'finalizado')) return { texto: `Finalizad${o}`, tom: 'finalizado' };
  if (farois.some((f) => f !== 'nao_iniciado')) return { texto: 'Em andamento', tom: 'em_andamento' };
  return { texto: `Não iniciad${o}`, tom: 'nao_iniciado' };
}

/** A fase em que o projeto está: a primeira (na ordem) que ainda tem atividade sem terminar. */
export function faseAtual(
  fases: Pick<FaseBase, 'id' | 'ordem'>[],
  atividades: Pick<AtividadeBase, 'fase_id' | 'status' | 'percentual'>[],
): { numero: number; total: number } | null {
  if (fases.length === 0) return null;
  const ordenadas = [...fases].sort((x, y) => x.ordem - y.ordem);
  const i = ordenadas.findIndex((f) => atividades.some((a) => a.fase_id === f.id && a.status !== 'completed' && a.percentual < 100));
  return { numero: i === -1 ? ordenadas.length : i + 1, total: ordenadas.length };
}

/** "Gislene Araújo" → "GA" (o avatar da equipe). */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return ((partes[0][0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}
