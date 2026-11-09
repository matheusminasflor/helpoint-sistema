// O estado (UF) de um cliente do Kommo, para o Atendimento do CRM por estado (dono, 2026-11-09). Regra pura, testada no
// Vitest (src/lib/kommo-uf.test.ts) e usada por `mkt-kommo-coletar`.
// Decisão do dono: o campo quando estiver preenchido ("Estado de atuação" do lead, que a Lyra pergunta ao distribuidor, e
// depois "Estado" do contato); sem ele, o DDD do telefone. O campo é texto livre: "MG", "Mg", "Minas Gerais", "Brasília df"
// viram a mesma sigla; o que não se reconhece é ignorado e cai no DDD.
const DDD: Record<string, number[]> = {
  SP: [11, 12, 13, 14, 15, 16, 17, 18, 19], RJ: [21, 22, 24], ES: [27, 28], MG: [31, 32, 33, 34, 35, 37, 38],
  PR: [41, 42, 43, 44, 45, 46], SC: [47, 48, 49], RS: [51, 53, 54, 55], DF: [61], GO: [62, 64], TO: [63], MT: [65, 66],
  MS: [67], AC: [68], RO: [69], BA: [71, 73, 74, 75, 77], SE: [79], PE: [81, 87], AL: [82], PB: [83], RN: [84],
  CE: [85, 88], PI: [86, 89], PA: [91, 93, 94], AM: [92, 97], RR: [95], AP: [96], MA: [98, 99],
};
const UF_DO_DDD = new Map(Object.entries(DDD).flatMap(([uf, ds]) => ds.map((d) => [d, uf] as const)));

const NOME: Record<string, string> = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE', 'distrito federal': 'DF', brasilia: 'DF',
  'espirito santo': 'ES', goias: 'GO', maranhao: 'MA', 'mato grosso': 'MT', 'mato grosso do sul': 'MS', minas: 'MG',
  'minas gerais': 'MG', para: 'PA', paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR', 'santa catarina': 'SC',
  'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO',
};

const normaliza = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

/** "MG", "Minas Gerais", "Brasília df", "São Paulo - SP" → a sigla; outro texto, nada. */
export function ufDoTexto(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const v = normaliza(valor);
  if (!v) return null;
  if (NOME[v]) return NOME[v];
  const sigla = v.toUpperCase();
  if (DDD[sigla]) return sigla;
  // "brasilia df", "sao paulo sp": a última palavra é a sigla, ou o nome sem ela é o estado.
  const partes = v.split(' ');
  const ultima = partes[partes.length - 1].toUpperCase();
  if (partes.length > 1 && DDD[ultima]) return ultima;
  return NOME[partes.slice(0, -1).join(' ')] ?? null;
}

/** O DDD de um telefone do Brasil ("+55 31 9…", "5531…", "(31) 9…") → a sigla; telefone de fora, nada. */
export function ufDoTelefone(telefone: unknown): string | null {
  let d = String(telefone ?? '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length < 10 || d.length > 11) return null;
  return UF_DO_DDD.get(Number(d.slice(0, 2))) ?? null;
}

/** O estado do cliente: o primeiro campo reconhecido, depois o DDD. */
export function ufDoCliente(campos: unknown[], telefone: unknown): string | null {
  for (const c of campos) {
    const uf = ufDoTexto(c);
    if (uf) return uf;
  }
  return ufDoTelefone(telefone);
}
