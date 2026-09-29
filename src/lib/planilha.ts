// O que toda leitura de planilha deste sistema precisa: abrir o arquivo, entender um
// número em português e entender uma data em português.
//
// POR QUE SAIU DE `finance-import.ts`. Estava lá, e `forteplus-fin.ts` passou a
// precisar das mesmas três funções. Só que `finance-import.ts` também precisa de
// `forteplus-fin.ts` — é ele que escolhe o leitor posicional quando o formato é
// Forteplus. Dois arquivos importando um ao outro em tempo de execução funciona por
// acidente de hoisting e quebra no dia em que um deles ganhar código de módulo. As
// primitivas saem para cá, e a dependência volta a ser em um sentido só:
//
//   finance-import  →  forteplus-fin  →  planilha
//
// `finance-import.ts` reexporta as três, para que nenhum chamador precise mudar.
import * as XLSX from 'xlsx';

/** Minúsculo, sem acento, sem pontuação, espaço colapsado — para comparar cabeçalho. */
export function normalizeHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Converte "R$ 1.234,56", "1234.56", 1234.56 ou "(120,00)" em número. */
export function parseAmount(raw: unknown): number | null {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  let s = String(raw ?? '').trim();
  if (!s) return null;
  const negative = /^\(.*\)$/.test(s) || s.includes('-');
  // `-` por último na classe é literal; `\-` era escape inútil e o lint acusava.
  s = s.replace(/[()-]/g, '').replace(/r\$/i, '').replace(/\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Aceita serial do Excel, Date, "dd/mm/aaaa" e "aaaa-mm-dd". Retorna ISO (aaaa-mm-dd). */
export function parseDate(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (raw instanceof Date && !Number.isNaN(raw.getTime())) return toISO(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return null;
    return toISO(new Date(parsed.y, parsed.m - 1, parsed.d));
  }
  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (m) {
    const year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return toISO(new Date(year, Number(m[2]) - 1, Number(m[1])));
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toISO(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** O primeiro dia do mês da data — é assim que competência é guardada no banco. */
export function competenceOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Todas as abas do arquivo: nome da aba → matriz de linhas. */
export async function readSheets(file: File): Promise<Record<string, unknown[][]>> {
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  return Object.fromEntries(wb.SheetNames.map((nome) => [
    nome,
    XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, blankrows: false, defval: '' }),
  ]));
}

/** A primeira aba do arquivo, como matriz de linhas. */
export async function readSheet(file: File): Promise<unknown[][]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
}
