import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * Regra 5 de escrita (CLAUDE.md): rota só existe se estiver no mapa.
 *
 * Três rotas mortas foram encontradas à mão na revisão de 2026-09-04
 * (`/ti/dashboard`, `/mkt/cronograma`, `/chamado/:id`): escritas em
 * `navigate(...)` sem ninguém conferir contra `StaffAppRoutes`. Este teste
 * faz a conferência que faltava: lê o mapa de rotas, varre todo `navigate`,
 * `to=` e `route:` do código, e acusa o que não casa.
 *
 * Não é análise de tipos — é texto. Cobre o caso comum (string literal ou
 * template com `${id}`), que é onde o defeito sempre esteve.
 */

const SRC = join(__dirname, '..');

/**
 * Rotas planejadas e ainda não criadas — registradas em docs/nao-funciona.md.
 * Está vazia desde 2026-09-13: `/kanban`, a única que morava aqui, passou a
 * existir como atalho para `/projetos` (OKR-2).
 */
const PLANEJADAS = new Set<string>([]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** `path="ti/chamados/:id"` → padrão de segmentos, com `:x` casando qualquer coisa. */
function collectRoutePatterns(): string[][] {
  const staff = readFileSync(join(SRC, 'routes/StaffAppRoutes.tsx'), 'utf8');
  const app = readFileSync(join(SRC, 'App.tsx'), 'utf8');
  const patterns: string[][] = [];
  for (const m of staff.matchAll(/path="([^"*]+)"/g)) patterns.push(m[1].split('/').filter(Boolean));
  for (const m of app.matchAll(/path="(\/[^"*]*)"/g)) patterns.push(m[1].split('/').filter(Boolean)); // inclui a raiz "/"
  return patterns;
}

/**
 * Rotas de prefixo — `path="crm/*"` — que cobrem tudo abaixo delas.
 *
 * Elas ficavam **de fora** do mapa, porque o `collectRoutePatterns` recusa
 * qualquer `path` com `*`. Isso estava certo enquanto o único splat era o
 * "não encontrado" no fim de `App.tsx`: aceitá-lo faria o teste parar de
 * reprovar qualquer coisa. Mas `crm/*` é rota de verdade — desde que o CRM foi
 * para "em construção" (2026-09-21), é ela que atende `/crm/funil` e as outras
 * dez. Sem isto, o teste acusava onze links que **funcionam**.
 *
 * O splat vazio (`*` ou `/*`, o catch-all) continua de fora, de propósito: com
 * prefixo vazio ele casaria com tudo e o teste deixaria de provar qualquer
 * coisa.
 */
function collectPrefixRoutes(): string[][] {
  const staff = readFileSync(join(SRC, 'routes/StaffAppRoutes.tsx'), 'utf8');
  const prefixes: string[][] = [];
  for (const m of staff.matchAll(/path="([^"]*?)\/\*"/g)) {
    const segs = m[1].split('/').filter(Boolean);
    if (segs.length) prefixes.push(segs);
  }
  return prefixes;
}

function matches(segments: string[], patterns: string[][], prefixes: string[][]): boolean {
  const exato = patterns.some(
    (p) => p.length === segments.length && p.every((seg, i) => seg.startsWith(':') || seg === segments[i]),
  );
  if (exato) return true;
  return prefixes.some(
    (p) => p.length <= segments.length && p.every((seg, i) => seg.startsWith(':') || seg === segments[i]),
  );
}

/** Normaliza o que foi escrito no código para segmentos comparáveis. */
function normalize(raw: string): string[] | null {
  let s = raw.split('?')[0].split('#')[0];
  s = s.replace(/^\/t\/(\$\{[^}]*\}|:slug)/, ''); // prefixo de tenant
  s = s.replace(/([^/])\$\{[^}]*\}/g, '$1');      // `/sac/entrar${qs}`: query colada ao segmento, não é rota
  s = s.replace(/\$\{[^}]*\}/g, ':p');            // `/x/${id}` casa com `/x/:id`
  if (!s.startsWith('/')) return null;
  const segs = s.split('/').filter(Boolean);
  if (segs.some((x) => x.includes('$'))) return null; // template complexo demais: fora do alcance do teste
  return segs;
}

describe('toda rota escrita no código existe no mapa', () => {
  it('navigate / to / route apontam para rotas registradas', () => {
    const patterns = collectRoutePatterns();
    const prefixes = collectPrefixRoutes();
    const offenders: string[] = [];

    const usages = /(?:navigate\((?:tenantPath\()?|\bto=\{?(?:tenantPath\()?|\broute:\s*)\s*([`'"])(\/[^`'"]*)\1/g;

    for (const file of walk(SRC)) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(usages)) {
        const raw = m[2];
        const segs = normalize(raw);
        if (!segs) continue;
        const path = '/' + segs.join('/');
        if (PLANEJADAS.has(path)) continue;
        if (!matches(segs, patterns, prefixes)) {
          const line = text.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(SRC, file)}:${line}  ${raw}`);
        }
      }
    }

    expect(offenders, `rotas que não existem no mapa:\n${offenders.join('\n')}`).toEqual([]);
  });
});
