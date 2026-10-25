// Data sem hora não passa por `new Date()` na tela (2026-10-25). `new Date('2026-10-24')` é meia-noite UTC — no Brasil,
// o dia 23 às 21h —, e a data aparecia um dia antes: foi o defeito 1 da etapa 0 (férias) e, depois, a mesma conta em
// contratos, licenças, manutenções, RH e Meu RH. Os campos abaixo são `date` no banco (medido em 2026-10-25).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CAMPOS = ['start_date', 'end_date', 'purchase_date', 'expiry_date', 'previous_purchase_date', 'previous_expiry_date',
  'new_purchase_date', 'new_expiry_date', 'scheduled_date', 'completed_date', 'issue_date', 'reference_month',
  'admission_date', 'last_vacation_end', 'termination_date', 'birth_date', 'due_date'];
const PADRAO = new RegExp(`format\\(new Date\\([a-zA-Z_.?]+\\.(?:${CAMPOS.join('|')})!?\\)`);

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return arquivos(p);
    return /\.tsx?$/.test(n) && !n.endsWith('.test.ts') ? [p] : [];
  });
}

describe('data sem hora não vira "um dia antes"', () => {
  it('nenhuma tela formata campo de dia com new Date (use parseISO)', () => {
    const achados = arquivos(resolve(__dirname, '..')).flatMap((f) =>
      readFileSync(f, 'utf8').split('\n').map((l, i) => (PADRAO.test(l) ? `${f.split(/[\\/]src[\\/]/)[1]}:${i + 1}` : null)).filter(Boolean));
    expect(achados).toEqual([]);
  });
});
