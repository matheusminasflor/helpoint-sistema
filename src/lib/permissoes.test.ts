// A tabela de casos que impede a tela e o banco de discordarem sobre
// permissão (§4.6 do plano). O Vitest roda esta tabela contra
// `resolvePermission` (o navegador); o pgTAP roda A MESMA TABELA, escrita à
// mão no mesmo formato, contra `tem_permissao` (o banco) em
// `supabase/tests/database/comercial_base_de_vendas.test.sql`.
//
// Se você mudar um caso aqui, mude o espelho lá — os dois arquivos não se
// importam um ao outro (TS de um lado, SQL do outro), e é exatamente por
// isso que este comentário existe: nada mais os mantém em sincronia.
import { describe, expect, it } from 'vitest';
import { resolvePermission, type PermissionsMap } from '@/config/access-profile-schemas';

export interface CasoPermissao {
  nome: string;
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
    permissoesDoPerfil: { vendas: { importar: true } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    nome: 'perfil nega, sem override',
    permissoesDoPerfil: { vendas: { importar: false } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'perfil não fala da ação — vale false, nunca se assume permitido',
    permissoesDoPerfil: { vendas: {} },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    // O que teria acontecido se a precedência estivesse errada: tirar a
    // permissão de alguém pelo override não teria efeito nenhum no banco.
    nome: 'override concede por cima de perfil que nega',
    permissoesDoPerfil: { vendas: { importar: false } },
    overridesDoUsuario: { vendas: { importar: true } },
    modulo: 'vendas', acao: 'importar', esperado: true,
  },
  {
    nome: 'override nega por cima de perfil que concede',
    permissoesDoPerfil: { vendas: { importar: true } },
    overridesDoUsuario: { vendas: { importar: false } },
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'sem perfil nenhum atribuído e sem override — nunca permitido por omissão',
    permissoesDoPerfil: null,
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'importar', esperado: false,
  },
  {
    nome: 'perfil concede substituir (a ação que apaga dado)',
    permissoesDoPerfil: { vendas: { substituir: true } },
    overridesDoUsuario: {},
    modulo: 'vendas', acao: 'substituir', esperado: true,
  },
];

describe('CASOS_PERMISSAO × resolvePermission (o lado do navegador)', () => {
  it.each(CASOS_PERMISSAO)('$nome', (caso) => {
    const resultado = resolvePermission(caso.permissoesDoPerfil, caso.overridesDoUsuario, caso.modulo, caso.acao);
    expect(resultado).toBe(caso.esperado);
  });
});
