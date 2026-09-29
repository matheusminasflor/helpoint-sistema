// Os setores de Configurações › Setores (LEVA P, 2026-09-29). Uma lista só: a tela da grade, o
// menu e a tranca de cada rota leem daqui — se cada um tivesse a sua, um setor novo entraria num
// lugar e ficaria fora do outro (foi o que aconteceu com Compras na leva N).
//
// O dono: "em vez de ter SETORES e diversas configurações de cada setor, a pessoa clica em Setores
// e abre o menu para selecionar qual setor, igual quando abre chamado. Quem tiver acesso à
// configuração apenas de um setor vai aparecer ativo apenas aquele."
import type { Department } from '@/config/access-profile-schemas';

export interface SetorDeConfiguracao {
  /** O setor dos perfis de acesso. Nulo = sem perfil (Expedição): abre quem tem o módulo. */
  setor: Department | null;
  rotulo: string;
  rota: string;
  descricao: string;
}

export const SETORES_DE_CONFIGURACAO: SetorDeConfiguracao[] = [
  { setor: 'ti', rotulo: 'TI', rota: '/ti/configuracoes', descricao: 'Categorias, prazos, checklists e alertas' },
  { setor: 'qualidade', rotulo: 'Qualidade', rota: '/qualidade/configuracoes', descricao: 'Chamados internos e o SAC dos clientes' },
  { setor: 'rh', rotulo: 'RH', rota: '/rh/configuracoes', descricao: 'Chamados, empresas, departamentos e folha' },
  { setor: 'marketing', rotulo: 'Marketing', rota: '/mkt/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: 'financeiro', rotulo: 'Financeiro', rota: '/financeiro/configuracoes', descricao: 'Chamados e planilhas importadas' },
  { setor: 'compras', rotulo: 'Compras', rota: '/compras/configuracoes', descricao: 'Categorias de compra e teto de gasto' },
  { setor: 'comercial', rotulo: 'Comercial', rota: '/comercial/configuracoes', descricao: 'Equipe, carteiras, indicadores e cashback' },
  { setor: 'educacional', rotulo: 'Educacional', rota: '/educacional/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: null, rotulo: 'Expedição', rota: '/expedicao/configuracoes', descricao: 'Separação de lotes e etiqueta' },
];

export const ROTA_DOS_SETORES = '/configuracoes/setores';
