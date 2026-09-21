// A tabela de casos que impede a tela e o banco de discordarem sobre
// permissão (§4.6 do plano, achado 2c da auditoria de 2026-09-21). O Vitest
// roda esta tabela contra `podeComoOBanco` (o navegador — a MESMA conta que
// a RLS faz: `is_admin_or_higher(...) or tem_permissao(...)`); o pgTAP roda
// A MESMA TABELA, escrita à mão no mesmo formato, contra
// `public.is_admin_or_higher(...) or public.tem_permissao(...)` (ou só
// `tem_permissao`, para os casos de perfil/override) em
// `supabase/tests/database/comercial_base_de_vendas.test.sql` — 11 casos,
// um `is()` cada, rodados dos dois lados.
//
// Se você mudar um caso aqui, mude o espelho lá — os dois arquivos não se
// importam um ao outro (TS de um lado, SQL do outro), e é exatamente por
// isso que este comentário existe: nada mais os mantém em sincronia.
import { describe, expect, it } from 'vitest';
import { podeComoOBanco } from './permissoes';
import type { PermissionsMap } from '@/config/access-profile-schemas';

export interface CasoPermissao {
  nome: string;
  /** `'owner' | 'admin'` passam sem perfil (bypass); `'manager'` NÃO passa por ser gestor — é o achado 2b. */
  papel: 'owner' | 'admin' | 'manager' | 'member';
  /** `null` = usuário sem nenhum perfil atribuído neste departamento. */
  permissoesDoPerfil: PermissionsMap | null;
  overridesDoUsuario: PermissionsMap;
  modulo: string;
  acao: string;
  esperado: boolean;
}

export const CASOS_PERMISSAO: CasoPermissao[] = [
  {
    nome: 'perfil concede, sem override',
    papel: 'member',
    permissoesDoPerfil: { vendas: { importar: true } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    nome: 'perfil nega, sem override',
    papel: 'member',
    permissoesDoPerfil: { vendas: { importar: false } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'perfil não fala da ação — vale false, nunca se assume permitido',
    papel: 'member',
    permissoesDoPerfil: { vendas: {} },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    // O que teria acontecido se a precedência estivesse errada: tirar a
    // permissão de alguém pelo override não teria efeito nenhum no banco.
    nome: 'override concede por cima de perfil que nega',
    papel: 'member',
    permissoesDoPerfil: { vendas: { importar: false } },
    overridesDoUsuario: { vendas: { importar: true } },
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    nome: 'override nega por cima de perfil que concede',
    papel: 'member',
    permissoesDoPerfil: { vendas: { importar: true } },
    overridesDoUsuario: { vendas: { importar: false } },
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'sem perfil nenhum atribuído e sem override — nunca permitido por omissão',
    papel: 'member',
    permissoesDoPerfil: null,
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'perfil concede substituir (a ação que apaga dado)',
    papel: 'member',
    permissoesDoPerfil: { vendas: { substituir: true } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'substituir', esperado: true,
  },
  // ─── Os quatro casos novos (achado 2c da auditoria) ──────────────────────
  {
    nome: 'owner passa sem perfil nenhum atribuído',
    papel: 'owner',
    permissoesDoPerfil: null,
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    nome: 'admin passa sem perfil nenhum atribuído',
    papel: 'admin',
    permissoesDoPerfil: null,
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    // O achado 2b: `is_admin_or_higher` no banco é só owner/admin.
    // `useDepartmentPermissions.can` (que deixa manager passar) continua
    // intacto para os outros módulos — só `canComoOBanco` segue esta regra.
    nome: 'gestor (manager) NÃO passa por ser gestor',
    papel: 'manager',
    permissoesDoPerfil: null,
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    // O achado 2a: override com JSON `null` não é "o override falou" — vale
    // o perfil por baixo. Antes da correção, a tela lia `null !== undefined`
    // como verdadeiro e negava onde o banco caía pro perfil (que concede).
    nome: 'override com null não é "negado": vale o perfil',
    papel: 'member',
    permissoesDoPerfil: { vendas: { importar: true } },
    overridesDoUsuario: { vendas: { importar: null as unknown as boolean } },
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
];

describe('CASOS_PERMISSAO × podeComoOBanco (a MESMA conta que a RLS faz)', () => {
  it.each(CASOS_PERMISSAO)('$nome', (caso) => {
    const resultado = podeComoOBanco(caso.papel, caso.permissoesDoPerfil, caso.overridesDoUsuario, caso.modulo, caso.acao);
    expect(resultado).toBe(caso.esperado);
  });
});
