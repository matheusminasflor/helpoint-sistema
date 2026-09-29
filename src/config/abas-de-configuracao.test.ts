// A lista de abas da tela tem de ser a mesma do banco (`public.abas_de_configuracao`, migration
// 20261116020000). Se divergirem, o perfil mostra uma aba que o banco não confere — ou o banco
// converte `settings` numa aba que a tela nunca mostra.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABAS_DE_CONFIGURACAO } from './abas-de-configuracao';

const migration = readFileSync(
  resolve(__dirname, '../../supabase/migrations/20261116020000_permissao_por_aba.sql'),
  'utf8',
);

function abasDoBanco(): Record<string, string[]> {
  const corpo = migration.slice(migration.indexOf('function public.abas_de_configuracao'));
  const fim = corpo.indexOf('$$;');
  const mapa: Record<string, string[]> = {};
  for (const m of corpo.slice(0, fim).matchAll(/when '(\w+)'\s+then array\[([^\]]*)\]/g)) {
    mapa[m[1]] = [...m[2].matchAll(/'(\w+)'/g)].map((x) => x[1]);
  }
  return mapa;
}

describe('abas de configuração — tela e banco com a mesma lista', () => {
  it('cada setor tem as mesmas abas, na mesma ordem', () => {
    const banco = abasDoBanco();
    const tela = Object.fromEntries(
      Object.entries(ABAS_DE_CONFIGURACAO).map(([setor, abas]) => [setor, abas.map((a) => a.aba)]),
    );
    expect(tela).toEqual(banco);
  });
});
