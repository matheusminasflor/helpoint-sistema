// As reuniões do Google no Chat (dono, 2026-11-07). O texto é o do Gemini: aqui só se localizam as seções dele.

const TITULOS = ['Resumo', 'Decisões', 'Próximas etapas', 'Detalhes'] as const;
export type SecaoDaPauta = typeof TITULOS[number];

/** Uma seção do documento, com o texto como veio; `null` se o Gemini não a gerou. */
export function secaoDaPauta(pauta: string, titulo: SecaoDaPauta): string | null {
  const linhas = pauta.split('\n');
  const inicio = linhas.findIndex((l) => l.trim() === titulo);
  if (inicio < 0) return null;
  const fim = linhas.findIndex((l, i) => i > inicio && (TITULOS as readonly string[]).includes(l.trim()));
  const texto = linhas.slice(inicio + 1, fim < 0 ? undefined : fim).join('\n').trim();
  return texto || null;
}

/** Duração em minutos entre duas datas, ou `null` se falta alguma. */
export function minutosEntre(inicio: string | null, fim: string | null): number | null {
  if (!inicio || !fim) return null;
  const m = Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000);
  return m >= 0 ? m : null;
}

export function mediaDeMinutos(reunioes: { inicio: string; fim: string | null }[]): number | null {
  const tempos = reunioes.flatMap((r) => { const m = minutosEntre(r.inicio, r.fim); return m === null ? [] : [m]; });
  return tempos.length ? Math.round(tempos.reduce((a, b) => a + b, 0) / tempos.length) : null;
}

/** Busca na transcrição: as falas que contêm o termo, sem diferença de acento ou maiúscula, em ordem. */
export function falasCom(transcricao: string, termo: string): string[] {
  const limpa = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const alvo = limpa(termo.trim());
  const linhas = transcricao.split('\n');
  return alvo ? linhas.filter((l) => limpa(l).includes(alvo)) : linhas;
}

/** Lê o CSV que o Google exporta da lista de presença, respeitando aspas. */
export function lerCsv(texto: string): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (c === '"') aspas = false; else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ',') { linha.push(campo); campo = ''; } else if (c === '\n') { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); linha = []; campo = ''; } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo.replace(/\r$/, '')); linhas.push(linha); }
  return linhas.filter((l) => l.some((v) => v.trim()));
}

/** Dos nomes sem pessoa, os que têm o primeiro nome de alguém do Helpoint. O resto é convidado de fora. */
export function nomesDaEquipe(nomes: string[], pessoas: string[]): string[] {
  const primeiro = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().split(/\s+/)[0];
  const daEquipe = new Set(pessoas.map(primeiro));
  return nomes.filter((n) => daEquipe.has(primeiro(n)));
}
