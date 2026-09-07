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

/** Rotas planejadas e ainda não criadas — registradas em docs/nao-funciona.md. */
const PLANEJADAS = new Set(['/kanban']);

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

function matches(segments: string[], patterns: string[][]): boolean {
  return patterns.some(
    (p) => p.length === segments.length && p.every((seg, i) => seg.startsWith(':') || seg === segments[i]),
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
        if (!matches(segs, patterns)) {
          const line = text.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(SRC, file)}:${line}  ${raw}`);
        }
      }
    }

    expect(offenders, `rotas que não existem no mapa:\n${offenders.join('\n')}`).toEqual([]);
  });
});
