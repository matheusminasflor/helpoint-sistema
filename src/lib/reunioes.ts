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

/** Os blocos de uma seção. Linha curta sozinha antes do texto é o subtítulo que o Gemini escreve; sobrando "____", some. */
export function paragrafosDaSecao(texto: string): { titulo: string | null; corpo: string }[] {
  const blocos = texto.split(/\n\s*\n/).map((b) => b.split('\n').filter((l) => !/^_+$/.test(l.trim())).join('\n').trim()).filter(Boolean);
  return blocos.flatMap((b) => {
    const linhas = b.split('\n');
    const curta = linhas.length > 1 && linhas[0].length <= 70 && !/[.:;!?]$/.test(linhas[0].trim());
    if (curta) return [{ titulo: linhas[0].trim(), corpo: linhas.slice(1).join('\n').trim() }];
    const prefixo = /^([^.:]{3,90}): (.+)$/s.exec(b);
    return [prefixo ? { titulo: prefixo[1], corpo: prefixo[2] } : { titulo: null, corpo: b }];
  });
}

/** "* [Ana, Bia] Enviar: fazer tal coisa." vira pessoas, título e texto. Linha fora desse formato vai inteira no texto. */
export function proximasEtapas(texto: string): { pessoas: string[]; titulo: string | null; texto: string }[] {
  return texto.split('\n').map((l) => l.trim().replace(/^[*•-]\s*/, '')).filter(Boolean).map((l) => {
    const m = /^\[([^\]]+)\]\s*(?:([^:]{2,70}):\s*)?(.*)$/.exec(l);
    if (!m) return { pessoas: [], titulo: null, texto: l };
    return { pessoas: m[1].split(',').map((p) => p.trim().replace(/^The group$/i, 'Grupo')).filter(Boolean), titulo: m[2] ?? null, texto: m[3] };
  });
}

/** Separa as marcas de tempo "(00:09:01)" do texto, para virarem link da transcrição. */
export function temposDoTexto(texto: string): { texto: string; hora?: string }[] {
  return texto.split(/\((\d{2}:\d{2}:\d{2})\)/).flatMap((p, i) => (i % 2 ? [{ texto: p, hora: p }] : p ? [{ texto: p }] : []));
}

export interface FalaDaTranscricao { id: number; hora: string | null; nome: string; fala: string }

/** A transcrição em falas por pessoa, juntando as linhas seguidas de quem continua falando. */
export function falasDaTranscricao(transcricao: string): FalaDaTranscricao[] {
  const falas: FalaDaTranscricao[] = [];
  let hora: string | null = null;
  for (const linha of transcricao.split('\n').map((l) => l.trim()).filter(Boolean)) {
    if (/^\d{2}:\d{2}:\d{2}$/.test(linha)) { hora = linha; continue; }
    const m = /^([\p{L}][\p{L} .'-]{1,50}): (.*)$/u.exec(linha);
    const ultima = falas.at(-1);
    if (m && ultima?.nome === m[1]) ultima.fala += ` ${m[2]}`;
    else if (m) falas.push({ id: falas.length, hora, nome: m[1], fala: m[2] });
    else if (ultima && falas.length) ultima.fala += ` ${linha}`;
    else falas.push({ id: falas.length, hora, nome: '', fala: linha });
  }
  return falas;
}
