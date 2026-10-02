// Os setores de Configurações › Setores (LEVA P, 2026-09-29). Uma lista só: a tela da grade, o
// menu e a tranca de cada rota leem daqui — se cada um tivesse a sua, um setor novo entraria num
// lugar e ficaria fora do outro (foi o que aconteceu com Compras na leva N).
//
// O dono: "em vez de ter SETORES e diversas configurações de cada setor, a pessoa clica em Setores
// e abre o menu para selecionar qual setor, igual quando abre chamado. Quem tiver acesso à
// configuração apenas de um setor vai aparecer ativo apenas aquele."
import {
  Banknote, CheckSquare, Factory, GraduationCap, Handshake, Megaphone, Monitor, PackageCheck, ShoppingCart, Users,
  type LucideIcon,
} from 'lucide-react';
import type { Department } from '@/config/access-profile-schemas';

export interface SetorDeConfiguracao {
  /** O setor dos perfis de acesso. Nulo = setor sem perfil: abre quem tem o módulo. Desde
   *  2026-10-02 todos têm perfil (a Expedição era o último sem). */
  setor: Department | null;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  descricao: string;
}

export const SETORES_DE_CONFIGURACAO: SetorDeConfiguracao[] = [
  { setor: 'ti', rotulo: 'TI', icone: Monitor, rota: '/ti/configuracoes', descricao: 'Categorias, prazos, checklists e alertas' },
  { setor: 'qualidade', rotulo: 'Qualidade', icone: CheckSquare, rota: '/qualidade/configuracoes', descricao: 'Chamados internos e o SAC dos clientes' },
  { setor: 'rh', rotulo: 'RH', icone: Users, rota: '/rh/configuracoes', descricao: 'Chamados, empresas, departamentos e folha' },
  { setor: 'marketing', rotulo: 'Marketing', icone: Megaphone, rota: '/mkt/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: 'financeiro', rotulo: 'Financeiro', icone: Banknote, rota: '/financeiro/configuracoes', descricao: 'Chamados, planilhas importadas e conferência de pedidos' },
  { setor: 'compras', rotulo: 'Compras', icone: ShoppingCart, rota: '/compras/configuracoes', descricao: 'Categorias de compra e teto de gasto' },
  { setor: 'comercial', rotulo: 'Comercial', icone: Handshake, rota: '/comercial/configuracoes', descricao: 'Equipe, carteiras, indicadores e cashback' },
  { setor: 'educacional', rotulo: 'Educacional', icone: GraduationCap, rota: '/educacional/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: 'expedicao', rotulo: 'Expedição', icone: PackageCheck, rota: '/expedicao/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: 'producao', rotulo: 'Produção', icone: Factory, rota: '/producao/configuracoes', descricao: 'Categorias, prazos e automações' },
];

export const ROTA_DOS_SETORES = '/configuracoes/setores';
