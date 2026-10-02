// Que caixinha do perfil de acesso abre cada tela (decisão do dono, 2026-10-02).
//
// O dono viu a Merilyn e a Gislene (Marketing, perfil Operador, sem "Indicadores") abrirem os
// Indicadores: "se eu não permitir, não faz sentido — vale rever todas as permissões de todos os
// setores". Até aqui só o RH obedecia ao perfil, e só no menu; o resto abria para quem tinha o
// módulo, inclusive digitando o endereço.
//
// UMA lista para as duas portas: o menu (some o item) e a guarda das rotas (não abre pelo
// endereço). Se cada uma tivesse a sua, uma tela nova entraria numa e ficaria fora da outra.
// A pergunta é "Ver" (`view`) em alguma das seções listadas; dono e administrador passam.
// Telas que não estão aqui (filas de chamado, Lançamentos, Carteiras, Treinamentos) dependem só do
// módulo — a fila já é filtrada pelo banco, pelo perfil (`modulos_de_chamado_visiveis`).
import type { Department } from '@/config/access-profile-schemas';

export interface TelaDoPerfil {
  /** O começo do endereço (sem o prefixo da empresa). */
  prefixo: string;
  setor: Department;
  /** Abre com "Ver" em QUALQUER uma destas seções. */
  secoes: string[];
}

export const TELAS_DO_PERFIL: TelaDoPerfil[] = [
  // TI
  { prefixo: '/inventario', setor: 'ti', secoes: ['inventory'] },
  { prefixo: '/ti/contratos', setor: 'ti', secoes: ['contracts'] },
  { prefixo: '/ti/licencas', setor: 'ti', secoes: ['licenses'] },
  { prefixo: '/ti/manutencoes', setor: 'ti', secoes: ['maintenances'] },
  { prefixo: '/ti/pops', setor: 'ti', secoes: ['knowledge'] },
  { prefixo: '/ti/indicadores', setor: 'ti', secoes: ['reports'] },
  // Marketing
  { prefixo: '/mkt/social', setor: 'marketing', secoes: ['calendar'] },
  { prefixo: '/mkt/inventario', setor: 'marketing', secoes: ['inventory'] },
  { prefixo: '/mkt/fornecedores', setor: 'marketing', secoes: ['suppliers'] },
  { prefixo: '/mkt/indicadores', setor: 'marketing', secoes: ['reports'] },
  // Qualidade
  { prefixo: '/qualidade/dashboard', setor: 'qualidade', secoes: ['reports'] },
  // RH (o mapa que vivia no menu desde 2026-10-01)
  { prefixo: '/rh/colaboradores', setor: 'rh', secoes: ['employees'] },
  { prefixo: '/rh/folha', setor: 'rh', secoes: ['payroll'] },
  { prefixo: '/rh/faltas', setor: 'rh', secoes: ['absences'] },
  { prefixo: '/rh/aprovacoes', setor: 'rh', secoes: ['vacations', 'certificates'] },
  { prefixo: '/rh/holerites', setor: 'rh', secoes: ['payslips'] },
  { prefixo: '/rh/beneficios', setor: 'rh', secoes: ['benefits'] },
  { prefixo: '/rh/documentos', setor: 'rh', secoes: ['documents'] },
  { prefixo: '/rh/indicadores', setor: 'rh', secoes: ['reports'] },
  // Financeiro
  { prefixo: '/financeiro/conferencia-de-pedidos', setor: 'financeiro', secoes: ['conferencia'] },
  { prefixo: '/financeiro/contas-a-pagar', setor: 'financeiro', secoes: ['payables'] },
  { prefixo: '/financeiro/contas-a-receber', setor: 'financeiro', secoes: ['receivables'] },
  { prefixo: '/financeiro/fluxo-de-caixa', setor: 'financeiro', secoes: ['cashflow'] },
  { prefixo: '/financeiro/indicadores', setor: 'financeiro', secoes: ['reports'] },
  // Compras
  { prefixo: '/compras/catalogo', setor: 'compras', secoes: ['catalogo'] },
  { prefixo: '/compras/fornecedores', setor: 'compras', secoes: ['fornecedores'] },
  { prefixo: '/compras/indicadores', setor: 'compras', secoes: ['reports'] },
  // Comercial
  { prefixo: '/comercial/insights', setor: 'comercial', secoes: ['vendas'] },
  { prefixo: '/comercial/painel', setor: 'comercial', secoes: ['vendas'] },
  { prefixo: '/comercial/indicadores', setor: 'comercial', secoes: ['reports'] },
  // Setores só de atendimento
  { prefixo: '/educacional/indicadores', setor: 'educacional', secoes: ['reports'] },
  { prefixo: '/expedicao/indicadores', setor: 'expedicao', secoes: ['reports'] },
  { prefixo: '/producao/indicadores', setor: 'producao', secoes: ['reports'] },
];

/** A regra da tela do endereço — a de prefixo mais longo — ou null quando a tela não tem caixinha. */
export function telaDoPerfil(caminho: string): TelaDoPerfil | null {
  const p = caminho.split('?')[0].replace(/\/+$/, '') || '/';
  return TELAS_DO_PERFIL
    .filter((t) => p === t.prefixo || p.startsWith(`${t.prefixo}/`))
    .sort((a, b) => b.prefixo.length - a.prefixo.length)[0] ?? null;
}
