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
import { resolverVisaoDiretoria } from '@/config/diretoria-insights';

export interface TelaDoPerfil {
  /** O começo do endereço (sem o prefixo da empresa). */
  prefixo: string;
  setor: Department;
  /** Abre com QUALQUER uma das `acoes` (padrão: "Ver") em QUALQUER uma destas seções. */
  secoes: string[];
  /** Ações que abrem a tela; sem isto, só "Ver" (`view`). Ex.: "Aprovar compras" abre com `approve`. */
  acoes?: string[];
  /** Só o endereço exato, não o que vem depois (ex.: `/compras` sem pegar `/compras/chamados/…`). */
  exato?: boolean;
  /** Tela que mora na busca do endereço (`/diretoria?visao=metas`): só vale com esta visão. */
  visao?: string;
}

/** A pergunta do menu e da guarda das rotas: alguma das ações em alguma das seções. */
export function abreATela(tela: TelaDoPerfil, pode: (setor: Department, secao: string, acao: string) => boolean): boolean {
  return tela.secoes.some((s) => (tela.acoes ?? ['view']).some((a) => pode(tela.setor, s, a)));
}

export const TELAS_DO_PERFIL: TelaDoPerfil[] = [
  // TI
  { prefixo: '/inventario', setor: 'ti', secoes: ['inventory'] },
  { prefixo: '/ti/contratos', setor: 'ti', secoes: ['contracts'] },
  { prefixo: '/ti/termos', setor: 'ti', secoes: ['termos'] },
  { prefixo: '/ti/pedidos-de-acesso', setor: 'ti', secoes: ['solicitacoes'] },
  { prefixo: '/ti/distribuidores', setor: 'ti', secoes: ['distribuidores'], acoes: ['view', 'liberar'] },
  { prefixo: '/mkt/pedidos-de-arte', setor: 'marketing', secoes: ['solicitacoes'] },
  { prefixo: '/financeiro/reembolsos-e-adiantamentos', setor: 'financeiro', secoes: ['solicitacoes'] },
  { prefixo: '/rh/solicitacoes', setor: 'rh', secoes: ['solicitacoes'] },
  { prefixo: '/ti/licencas', setor: 'ti', secoes: ['licenses'] },
  { prefixo: '/ti/manutencoes', setor: 'ti', secoes: ['maintenances'] },
  { prefixo: '/ti/pops', setor: 'ti', secoes: ['knowledge'] },
  { prefixo: '/ti/indicadores', setor: 'ti', secoes: ['reports'] },
  // Marketing
  { prefixo: '/mkt/social', setor: 'marketing', secoes: ['calendar'] },
  { prefixo: '/mkt/estoque', setor: 'marketing', secoes: ['estoque'] },
  { prefixo: '/mkt/beneficio', setor: 'marketing', secoes: ['beneficio'] },
  { prefixo: '/mkt/fornecedores', setor: 'marketing', secoes: ['suppliers'] },
  { prefixo: '/mkt/indicadores', setor: 'marketing', secoes: ['reports'] },
  // Qualidade
  { prefixo: '/qualidade/indicadores', setor: 'qualidade', secoes: ['reports'] },
  // A lista; o detalhe abre também para quem atende aquele SAC (o banco decide).
  { prefixo: '/qualidade/sacs', setor: 'qualidade', secoes: ['sacs'], exato: true },
  { prefixo: '/qualidade/dashboard', setor: 'qualidade', secoes: ['reports'] },
  // RH (o mapa que vivia no menu desde 2026-10-01)
  { prefixo: '/rh/colaboradores', setor: 'rh', secoes: ['employees'] },
  { prefixo: '/rh/folha', setor: 'rh', secoes: ['payroll'] },
  { prefixo: '/rh/faltas', setor: 'rh', secoes: ['absences'] },
  { prefixo: '/rh/aprovacoes', setor: 'rh', secoes: ['vacations', 'certificates'] },
  { prefixo: '/rh/holerites', setor: 'rh', secoes: ['payslips'] },
  { prefixo: '/rh/beneficios', setor: 'rh', secoes: ['benefits'] },
  { prefixo: '/rh/documentos', setor: 'rh', secoes: ['documents'] },
  { prefixo: '/rh/reembolsos', setor: 'rh', secoes: ['reembolsos'] },
  { prefixo: '/rh/indicadores', setor: 'rh', secoes: ['reports'] },
  // Financeiro
  { prefixo: '/financeiro/conferencia-de-pedidos', setor: 'financeiro', secoes: ['conferencia'] },
  { prefixo: '/financeiro/contas-a-pagar', setor: 'financeiro', secoes: ['payables'] },
  { prefixo: '/financeiro/contas-a-receber', setor: 'financeiro', secoes: ['receivables'] },
  { prefixo: '/financeiro/fluxo-de-caixa', setor: 'financeiro', secoes: ['cashflow'] },
  { prefixo: '/financeiro/caixinha', setor: 'financeiro', secoes: ['caixinha'] },
  { prefixo: '/financeiro/relatorio-de-compras', setor: 'financeiro', secoes: ['relatorio_compras'] },
  { prefixo: '/financeiro/relatorio-da-caixinha', setor: 'financeiro', secoes: ['caixinha'] },
  { prefixo: '/financeiro/indicadores', setor: 'financeiro', secoes: ['reports'] },
  // Compras. Quem tem SÓ "Aprovar / reprovar compra" vê só "Aprovar compras" (dono, 2026-10-09): as
  // Solicitações e as Diretrizes pedem Ver ou Executar das solicitações (ou Ver das diretrizes).
  { prefixo: '/compras/aprovacoes', setor: 'compras', secoes: ['solicitacoes'], acoes: ['approve'] },
  { prefixo: '/compras', setor: 'compras', secoes: ['solicitacoes'], acoes: ['view', 'execute'], exato: true },
  { prefixo: '/compras/diretrizes', setor: 'compras', secoes: ['solicitacoes', 'diretrizes'], acoes: ['view', 'execute'] },
  { prefixo: '/compras/catalogo', setor: 'compras', secoes: ['catalogo'] },
  { prefixo: '/compras/estoque', setor: 'compras', secoes: ['estoque'] },
  { prefixo: '/compras/fornecedores', setor: 'compras', secoes: ['fornecedores'] },
  { prefixo: '/compras/indicadores', setor: 'compras', secoes: ['reports'] },
  // Relatórios novos (etapa 5): abrem com o "Indicadores" do setor; a Diretoria pelos indicadores dela.
  { prefixo: '/compras/relatorios', setor: 'compras', secoes: ['reports'] },
  { prefixo: '/financeiro/relatorios', setor: 'financeiro', secoes: ['reports'] },
  { prefixo: '/financeiro/previsao-de-caixa', setor: 'financeiro', secoes: ['cashflow'] },
  { prefixo: '/comercial/relatorios/venda-por-familia', setor: 'comercial', secoes: ['vendas'] },
  { prefixo: '/comercial/agenda-de-retornos', setor: 'comercial', secoes: ['lancamentos'] },
  { prefixo: '/qualidade/relatorios', setor: 'qualidade', secoes: ['sacs'] },
  { prefixo: '/diretoria/relatorios', setor: 'diretoria', secoes: ['indicadores'] },
  // Comercial
  // Cada tela com a sua caixinha (dono, 2026-10-14: "eu posso querer liberar 1 relatório para X usuário ou
  // perfil"). `/comercial/insights` só redireciona para a rota da análise, que tem a regra dela.
  { prefixo: '/comercial/lancamentos', setor: 'comercial', secoes: ['lancamentos'] },
  { prefixo: '/comercial/carteiras', setor: 'comercial', secoes: ['carteiras'] },
  { prefixo: '/comercial/indicadores', setor: 'comercial', secoes: ['reports'] },
  { prefixo: '/comercial/clientes-parados', setor: 'comercial', secoes: ['clientes'] },
  { prefixo: '/comercial/vendas', setor: 'comercial', secoes: ['vendas'] },
  { prefixo: '/comercial/painel', setor: 'comercial', secoes: ['vendas'] },
  { prefixo: '/comercial/bonificacao', setor: 'comercial', secoes: ['bonificacao'] },
  { prefixo: '/comercial/cashback', setor: 'comercial', secoes: ['cashback'] },
  { prefixo: '/comercial/beneficios', setor: 'comercial', secoes: ['diretrizes_beneficio'] },
  { prefixo: '/comercial/atendimento', setor: 'comercial', secoes: ['atendimento'] },
  // Setores só de atendimento
  { prefixo: '/educacional/treinamentos', setor: 'educacional', secoes: ['treinamentos'] },
  { prefixo: '/educacional/indicadores', setor: 'educacional', secoes: ['reports'] },
  { prefixo: '/expedicao/indicadores', setor: 'expedicao', secoes: ['reports'] },
  { prefixo: '/producao/indicadores', setor: 'producao', secoes: ['reports'] },
  // Diretoria (decisão 5 do dono, 2026-10-24): uma rota, a aba em `?visao=`.
  { prefixo: '/diretoria', setor: 'diretoria', secoes: ['resumo'], visao: 'resumo', exato: true },
  { prefixo: '/diretoria', setor: 'diretoria', secoes: ['indicadores'], visao: 'indicadores', exato: true },
  { prefixo: '/diretoria', setor: 'diretoria', secoes: ['metas'], visao: 'metas', exato: true },
  { prefixo: '/diretoria', setor: 'diretoria', secoes: ['clientes'], visao: 'clientes', exato: true },
  { prefixo: '/diretoria', setor: 'diretoria', secoes: ['produtos'], visao: 'produtos', exato: true },
  { prefixo: '/diretoria/diretrizes', setor: 'diretoria', secoes: ['diretrizes'] },
];

/** A regra da tela do endereço — a de prefixo mais longo — ou null quando a tela não tem caixinha. */
export function telaDoPerfil(caminho: string): TelaDoPerfil | null {
  const [semBusca, busca] = caminho.split('?');
  const p = semBusca.replace(/\/+$/, '') || '/';
  const visao = resolverVisaoDiretoria(new URLSearchParams(busca ?? '').get('visao'));
  return TELAS_DO_PERFIL
    .filter((t) => p === t.prefixo || (!t.exato && p.startsWith(`${t.prefixo}/`)))
    .filter((t) => !t.visao || t.visao === visao)
    .sort((a, b) => b.prefixo.length - a.prefixo.length)[0] ?? null;
}
