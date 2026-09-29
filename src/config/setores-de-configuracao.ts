// Os setores de Configurações › Setores (LEVA P, 2026-09-29). Uma lista só: a tela da grade, o
// menu e a tranca de cada rota leem daqui — se cada um tivesse a sua, um setor novo entraria num
// lugar e ficaria fora do outro (foi o que aconteceu com Compras na leva N).
//
// O dono: "em vez de ter SETORES e diversas configurações de cada setor, a pessoa clica em Setores
// e abre o menu para selecionar qual setor, igual quando abre chamado. Quem tiver acesso à
// configuração apenas de um setor vai aparecer ativo apenas aquele."
import {
  Banknote, CheckSquare, GraduationCap, Handshake, Megaphone, Monitor, PackageCheck, ShoppingCart, Users,
  type LucideIcon,
} from 'lucide-react';
import type { Department } from '@/config/access-profile-schemas';

/** Uma permissão de perfil: setor, módulo e ação, como `tem_permissao` pergunta no banco. */
export interface PermissaoDePerfil {
  setor: Department;
  modulo: string;
  acao: string;
}

export interface SetorDeConfiguracao {
  /** O setor dos perfis de acesso. Nulo = sem perfil (Expedição): abre quem tem o módulo. */
  setor: Department | null;
  rotulo: string;
  icone: LucideIcon;
  rota: string;
  descricao: string;
  /**
   * Outras permissões que também abrem a tela, porque dão direito a uma ABA dela. Achado da
   * revisão de 2026-09-29: sem isto, quem define o teto de gasto (Financeiro) ou gere as carteiras
   * (Comercial) — permissões que o banco já confere nas próprias tabelas — ficava do lado de fora
   * da tela onde a aba mora.
   */
  tambemAbrePor?: PermissaoDePerfil[];
}

export const SETORES_DE_CONFIGURACAO: SetorDeConfiguracao[] = [
  { setor: 'ti', rotulo: 'TI', icone: Monitor, rota: '/ti/configuracoes', descricao: 'Categorias, prazos, checklists e alertas' },
  { setor: 'qualidade', rotulo: 'Qualidade', icone: CheckSquare, rota: '/qualidade/configuracoes', descricao: 'Chamados internos e o SAC dos clientes' },
  { setor: 'rh', rotulo: 'RH', icone: Users, rota: '/rh/configuracoes', descricao: 'Chamados, empresas, departamentos e folha' },
  { setor: 'marketing', rotulo: 'Marketing', icone: Megaphone, rota: '/mkt/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: 'financeiro', rotulo: 'Financeiro', icone: Banknote, rota: '/financeiro/configuracoes', descricao: 'Chamados e planilhas importadas' },
  {
    setor: 'compras', rotulo: 'Compras', icone: ShoppingCart, rota: '/compras/configuracoes', descricao: 'Categorias de compra e teto de gasto',
    // O teto mora em Compras e quem o define é o Financeiro (decisão do dono, 2026-09-28).
    tambemAbrePor: [{ setor: 'financeiro', modulo: 'budgets', acao: 'manage' }],
  },
  {
    setor: 'comercial', rotulo: 'Comercial', icone: Handshake, rota: '/comercial/configuracoes', descricao: 'Equipe, carteiras, indicadores e cashback',
    tambemAbrePor: [
      { setor: 'comercial', modulo: 'carteiras', acao: 'gerir' },
      { setor: 'comercial', modulo: 'cashback', acao: 'configurar' },
    ],
  },
  { setor: 'educacional', rotulo: 'Educacional', icone: GraduationCap, rota: '/educacional/configuracoes', descricao: 'Categorias, prazos e automações' },
  { setor: null, rotulo: 'Expedição', icone: PackageCheck, rota: '/expedicao/configuracoes', descricao: 'Separação de lotes e etiqueta' },
];

export const ROTA_DOS_SETORES = '/configuracoes/setores';
