import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ALL_MODULES, MODULE_LABELS } from './database';

/**
 * ADR-010: não há mais "módulo contratado" — todo módulo que o sistema tem
 * (`ALL_MODULES`) tem de estar disponível para conceder (`MODULE_LABELS`), e
 * nada no código deve seguir lendo o plano morto (`plan_config`).
 *
 * A asserção 1 é exatamente o defeito da leva L5 (Diretoria): o módulo entrou
 * em `ALL_MODULES` e em `plan_config.available_modules` e não apareceu para
 * conceder, porque a lista renderizada era outra. A asserção 3 pega o caso de
 * um arquivo ter ficado para trás lendo o plano morto.
 */

const SRC = join(__dirname, '..');

/**
 * Comentário não é leitura: o que esta asserção impede é o código **voltar a
 * ler** o plano morto, e `UserModulesEditor.tsx` tem, de propósito, um
 * comentário que nomeia `plan_config.available_modules` para contar o defeito
 * da Diretoria (L5). Por isso o texto é limpo antes da busca.
 *
 * ponytail: teto conhecido — a limpeza é por expressão regular, não por
 * parser. Um `plan_config` escrito dentro de uma string na mesma linha depois
 * de uma URL (`https://…`) escaparia. Nunca aconteceu e o custo de um parser
 * de verdade não se paga aqui. Saída: se escapar uma vez, trocar por um
 * varredor de AST.
 */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

describe('módulos: ALL_MODULES e MODULE_LABELS não divergem', () => {
  it('todo módulo que o sistema tem aparece na tela de conceder acesso', () => {
    expect([...Object.keys(MODULE_LABELS)].sort()).toEqual([...ALL_MODULES].sort());
  });

  it('nada em src/ le o plano morto (plan_config, available_modules, usePlanLimits, PlanConfig)', () => {
    const EXCEPT = join(SRC, 'integrations/supabase/types.ts');
    const NEEDLES = ['plan_config', 'available_modules', 'usePlanLimits', 'PlanConfig'];
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      if (file === EXCEPT) continue;
      const text = semComentarios(readFileSync(file, 'utf8'));
      for (const needle of NEEDLES) {
        if (text.includes(needle)) {
          offenders.push(`${relative(SRC, file)}: ${needle}`);
        }
      }
    }

    expect(offenders, `arquivos ainda lendo o plano morto:\n${offenders.join('\n')}`).toEqual([]);
  });
});
