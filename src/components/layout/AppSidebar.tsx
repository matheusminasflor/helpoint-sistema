import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Ticket, BookOpen, HardDrive, Monitor,
  BarChart3, Settings, LogOut, Plus, PieChart,
  Inbox, FileText, Key, Wrench, Lightbulb, Megaphone,
  Calendar, Share2, Sparkles, Truck, Home, Target, FolderKanban,
  ShieldCheck, MessageSquare, ChevronDown, ChevronRight, Search, Users,
  CheckCircle2, Receipt, HeartPulse, FolderLock, Palette,
  Gift, FileSignature, Banknote, CalendarOff, PanelLeftClose, PanelLeftOpen, X, Wallet, TrendingUp, PiggyBank, FileBarChart,
  ShoppingCart, Package, Boxes, Handshake, GraduationCap, KanbanSquare, PackageCheck, Factory, Building2, Upload,
  IdCard, ClipboardList, Gauge, Briefcase, Clock, BookMarked, Newspaper, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useIsBelow } from '@/hooks/use-mobile';
import { ficaNoCelular, LARGURA_DO_CELULAR } from '@/config/celular';
import { unwrap } from '@/lib/supabase-result';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePurchaseCounters } from '@/hooks/usePurchases';
import { useAtualizacoesNaoLidas } from '@/hooks/useJornal';
import { useNaoLidas } from '@/hooks/useChat';
import { lugarNoMenuDoModulo, useContadoresDeAvisos } from '@/hooks/useContadoresDeAvisos';
import { useConfiguracaoDosSetores, useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useCaixinhas } from '@/hooks/useCaixinha';
import type { Department } from '@/config/access-profile-schemas';
import { abreATela, telaDoPerfil } from '@/config/telas-do-perfil';
import { useAssistantName } from '@/hooks/useAssistantName';
import { useSetoresQueConfiguro } from '@/hooks/useSetoresQueConfiguro';
import { ROTA_DOS_SETORES } from '@/config/setores-de-configuracao';
import { VISOES } from '@/config/comercial-insights';
import { VISOES_DIRETORIA, rotaDaVisaoDiretoria, resolverVisaoDiretoria } from '@/config/diretoria-insights';
import { resolverAcessoImportacoes } from '@/lib/importacoes-acesso';
import { estaPausada } from '@/config/telas-pausadas';
import { useTelasEmBreve } from '@/hooks/useMeuRHLigado';
import { useMeusSetores } from '@/hooks/useMeusSetores';
import { separarOMenu } from '@/lib/menu-dos-meus-setores';
import { toast } from 'sonner';


/* ── Menu definitions ── */

/**
 * `children`: sub-itens que aparecem recuados sob o item quando se está
 * dentro dele. Primeiro e único caso hoje: as visões do Insights do
 * Comercial (dono, 2026-09-21 — "ao clicar em Insights, as opções ficam no
 * menu lateral"). O item pai continua navegável: clicar nele abre a visão
 * padrão e revela a lista.
 */
type MenuItem = {
  to: string; icon: any; label: string; title?: string; children?: MenuItem[];
  /**
   * Título de seção dentro do grupo: o item que abre uma seção nova mostra o título acima dele.
   * Só Configurações usa (LEVA P): "Empresa" e "Setores", que eram 13 itens soltos numa lista.
   */
  secao?: string;
};
type MenuGroup = { id: string; label: string; icon: any; items: MenuItem[]; show: boolean; home: string };

// Os grupos do menu de cada setor (dono, 2026-10-14: "ideal por grupos, ex.: Relatórios e dentro dele os
// relatórios" — e escolheu grupos que ABREM E FECHAM). O mesmo molde em todo setor: Dia a dia, os cadastros do
// setor, Relatórios e "Do setor" (Diretrizes e Configurações) por último. Setor com 3-4 itens fica sem grupo.
const DIA = 'Dia a dia';
const CADASTROS = 'Cadastros';
const RELATORIOS = 'Relatórios';
const DO_SETOR = 'Do setor';

const tiMenuItems: MenuItem[] = [
  { to: '/ti/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de TI', secao: DIA },
  { to: '/ti/manutencoes', icon: Wrench, label: 'Manutenções', secao: DIA },
  { to: '/ti/pedidos-de-acesso', icon: ClipboardList, label: 'Pedidos de acesso', title: 'Acessos aprovados pelo gestor, para a TI liberar', secao: DIA },
  { to: '/ti/distribuidores', icon: Store, label: 'Distribuidores', title: 'Pedidos de acesso ao Portal do Distribuidor: conferir e liberar', secao: DIA },
  { to: '/inventario', icon: HardDrive, label: 'Inventário', title: 'Inventário de TI', secao: CADASTROS },
  { to: '/ti/contratos', icon: FileText, label: 'Contratos', secao: CADASTROS },
  { to: '/ti/termos', icon: FileSignature, label: 'Termos de responsabilidade', title: 'Termo de entrega de equipamento: gerar, anexar o assinado e registrar a devolução', secao: CADASTROS },
  { to: '/ti/licencas', icon: Key, label: 'Licenças', secao: CADASTROS },
  { to: '/ti/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de TI', secao: RELATORIOS },
  { to: '/ti/pops', icon: Lightbulb, label: 'Escrever tutoriais', title: 'Escrever e publicar tutoriais', secao: DO_SETOR },
  { to: '/ti/diretrizes', icon: BookMarked, label: 'Diretrizes de TI', secao: DO_SETOR },
  { to: '/ti/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de TI', secao: DO_SETOR },
];

const mktMenuItems: MenuItem[] = [
  { to: '/mkt/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de Marketing', secao: DIA },
  { to: '/mkt/social', icon: Share2, label: 'Cronograma Social', secao: DIA },
  { to: '/mkt/pedidos-de-arte', icon: ClipboardList, label: 'Pedidos de arte', title: 'Aceitar, recusar com motivo e entregar o arquivo', secao: DIA },
  // Estoque com quantidade, entrada e saída no lugar do Inventário (dono, 2026-10-19).
  { to: '/mkt/estoque', icon: Boxes, label: 'Estoque', title: 'Estoque do Marketing', secao: DIA },
  { to: '/mkt/beneficio', icon: Gift, label: 'Benefício de sexta', title: 'Produtos que o colaborador leva na sexta e devolve segunda', secao: DIA },
  { to: '/mkt/fornecedores', icon: Truck, label: 'Fornecedores', secao: CADASTROS },
  { to: '/mkt/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de Marketing', secao: RELATORIOS },
  { to: '/mkt/diretrizes', icon: BookMarked, label: 'Diretrizes do Marketing', secao: DO_SETOR },
  { to: '/mkt/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de Marketing', secao: DO_SETOR },
];

const qualidadeMenuItems: MenuItem[] = [
  { to: '/qualidade/chamados', icon: Ticket, label: 'Chamados internos', title: 'Os chamados que a equipe abre para a Qualidade', secao: DIA },
  { to: '/qualidade/sacs', icon: MessageSquare, label: 'SAC de clientes', title: 'Os chamados que os clientes abrem', secao: DIA },
  // Os chamados que outros setores abrem para a Qualidade, como todo setor (dono, 2026-10-06);
  // o painel dos SACs de clientes continua ao lado, com nome próprio.
  { to: '/qualidade/indicadores', icon: BarChart3, label: 'Indicadores dos chamados', title: 'Indicadores dos chamados internos da Qualidade', secao: RELATORIOS },
  { to: '/qualidade/dashboard', icon: PieChart, label: 'Indicadores do SAC', title: 'Indicadores dos SACs de clientes', secao: RELATORIOS },
  { to: '/qualidade/relatorios/reclamacoes-por-produto', icon: FileBarChart, label: 'Reclamação por produto e lote', title: 'Que produto e que lote geram SAC', secao: RELATORIOS },
  { to: '/qualidade/tutoriais', icon: Lightbulb, label: 'Escrever tutoriais', title: 'Escrever e publicar tutoriais da Qualidade', secao: DO_SETOR },
  { to: '/qualidade/diretrizes', icon: BookMarked, label: 'Diretrizes da Qualidade', secao: DO_SETOR },
  { to: '/qualidade/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de Qualidade', secao: DO_SETOR },
];

const rhMenuItems: MenuItem[] = [
  { to: '/rh/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de RH', secao: DIA },
  { to: '/rh/aprovacoes', icon: CheckCircle2, label: 'Aprovações', secao: DIA },
  { to: '/rh/solicitacoes', icon: ClipboardList, label: 'Pedidos ao RH', title: 'Dados, benefício, documento, dúvida de folha e conversa confidencial', secao: DIA },
  { to: '/rh/faltas', icon: CalendarOff, label: 'Faltas e Atestados', secao: DIA },
  { to: '/rh/colaboradores', icon: Users, label: 'Colaboradores', secao: 'Pessoas' },
  { to: '/rh/folha', icon: Banknote, label: 'Folha de Pagamento', secao: 'Pessoas' },
  { to: '/rh/holerites', icon: Receipt, label: 'Holerites', secao: 'Pessoas' },
  { to: '/rh/beneficios', icon: HeartPulse, label: 'Benefícios', secao: 'Pessoas' },
  { to: '/rh/documentos', icon: FolderLock, label: 'Documentos', secao: 'Pessoas' },
  { to: '/rh/reembolsos', icon: Wallet, label: 'Vales e auxílios', title: 'Vale-alimentação, vale-transporte, combustível e descontos do mês', secao: 'Pessoas' },
  { to: '/rh/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de RH', secao: RELATORIOS },
  { to: '/ausencias', icon: CalendarOff, label: 'Calendário de ausências', title: 'Quem estará fora e quando', secao: RELATORIOS },
  { to: '/rh/diretrizes', icon: BookMarked, label: 'Diretrizes do RH', secao: DO_SETOR },
  { to: '/rh/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de RH', secao: DO_SETOR },
];

// A caixinha do perfil que abre cada tela mora em `@/config/telas-do-perfil` desde 2026-10-02 (era
// um mapa só do RH aqui): o menu e a guarda das rotas leem a mesma lista.

// COMPRAS SAIU DAQUI em 2026-09-27 (leva N). O dono: o Financeiro estava "poluído
// demais por conta do setor de compras" — e era medível: 4 dos 10 itens deste menu
// eram de Compras, e o título do primeiro dizia "Chamados **e compras**".
const comprasMenuItems: MenuItem[] = [
  { to: '/compras', icon: ShoppingCart, label: 'Pedidos de compra', title: 'Os pedidos de compra: cotar, comprar e registrar', secao: DIA },
  // Saiu da Diretoria (dono, 2026-10-09): quem tem "Aprovar / reprovar compra" decide aqui.
  { to: '/compras/aprovacoes', icon: CheckCircle2, label: 'Aprovar compras', title: 'Compras aguardando aprovação', secao: DIA },
  // Suprimentos (folhas, café, copos…): entra pela compra, sai pela retirada (dono, 2026-10-15).
  { to: '/compras/estoque', icon: Boxes, label: 'Estoque', title: 'Estoque de suprimentos', secao: DIA },
  { to: '/compras/catalogo', icon: Package, label: 'Catálogo de Produtos', secao: CADASTROS },
  // Mesma tela de /mkt/fornecedores: o cadastro de fornecedor é um só (leva I).
  { to: '/compras/fornecedores', icon: Truck, label: 'Fornecedores', secao: CADASTROS },
  { to: '/compras/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de Compras', secao: RELATORIOS },
  { to: '/compras/relatorios/ciclo-da-compra', icon: FileBarChart, label: 'Ciclo da compra', title: 'Dias de pedido até a nota, onde trava, que aprovador demora', secao: RELATORIOS },
  { to: '/compras/relatorios/economia-na-cotacao', icon: FileBarChart, label: 'Economia na cotação', title: 'Quanto se economizou escolhendo entre os orçamentos', secao: RELATORIOS },
  { to: '/compras/relatorios/consumo-do-estoque', icon: FileBarChart, label: 'Consumo do estoque', title: 'O que saiu do estoque de suprimentos, por produto e por pessoa', secao: RELATORIOS },
  { to: '/compras/diretrizes', icon: BookMarked, label: 'Diretrizes de Compras', secao: DO_SETOR },
];

// O Financeiro (dono, 2026-10-28): "Solicitações" no topo é a fila onde chega TUDO o que os setores pedem ao Financeiro
// pelo Novo — reembolso, adiantamento, pagamento a fornecedor, nota fiscal e boleto, cobrança, desconto, outros (é a
// fila `module = 'financeiro'`, que se chamava "Chamados"). Saíram o Fluxo e a Previsão de caixa ("não trabalhamos com
// fluxo de caixa") e "Reembolsos e adiantamentos" (a fila dos pedidos tipados, que nunca recebeu nenhum).
// ponytail: as rotas /reembolsos-e-adiantamentos, /fluxo-de-caixa e /previsao-de-caixa continuam (link antigo não
// quebra); saem quando ninguém mais abrir.
const financeiroMenuItems: MenuItem[] = [
  { to: '/financeiro/chamados', icon: Inbox, label: 'Solicitações', title: 'Tudo o que os setores pedem ao Financeiro: reembolso, pagamento, nota fiscal, cobrança…', secao: DIA },
  { to: '/financeiro/conferencia-de-pedidos', icon: PackageCheck, label: 'Conferência de pedidos', title: 'Checklist dos pedidos do Comercial', secao: DIA },
  { to: '/financeiro/caixinha', icon: PiggyBank, label: 'Caixinha', title: 'Caixinha do dia a dia', secao: DIA },
  { to: '/financeiro/contas-a-pagar', icon: Banknote, label: 'Contas a Pagar', secao: 'Contas' },
  { to: '/financeiro/contas-a-receber', icon: Wallet, label: 'Contas a Receber', secao: 'Contas' },
  { to: '/financeiro/relatorio-de-compras', icon: FileBarChart, label: 'Relatório de compras', secao: RELATORIOS },
  { to: '/financeiro/relatorios/gasto-por-fornecedor', icon: FileBarChart, label: 'Gasto por fornecedor e setor', title: 'Com quem e em que a empresa gasta, mês a mês', secao: RELATORIOS },
  { to: '/financeiro/relatorios/reembolsos-e-adiantamentos', icon: FileBarChart, label: 'Reembolsos e adiantamentos', title: 'Quem pediu, quanto, quando foi pago e a sobra a devolver', secao: RELATORIOS },
  { to: '/financeiro/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores financeiros', secao: RELATORIOS },
  { to: '/financeiro/diretrizes', icon: BookMarked, label: 'Diretrizes do Financeiro', secao: DO_SETOR },
  { to: '/financeiro/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Financeiro', secao: DO_SETOR },
];

// CRM é módulo próprio (ADR-009): vendas aqui; o Comercial fica só com chamados.
const crmMenuItems: MenuItem[] = [
  { to: '/crm/funil', icon: KanbanSquare, label: 'Funil', title: 'Funil de vendas' },
  { to: '/crm/contatos', icon: Users, label: 'Contatos' },
  { to: '/crm/pedidos', icon: ShoppingCart, label: 'Pedidos' },
  { to: '/crm/produtos', icon: Package, label: 'Produtos' },
  { to: '/crm/formularios', icon: FileText, label: 'Formulários' },
  { to: '/crm/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de venda' },
  { to: '/crm/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do CRM' },
];

// O Comercial por QUEM USA (dono, 2026-10-14: "o setor mais bagunçado de informações; a ideia é praticidade para o
// colaborador"). O balde "Insights" acabou: cada análise é item do grupo dela, com rota e caixinha próprias
// (`@/config/comercial-insights`). O que mostra o lançado (o que a vendedora registra) fica no "Meu dia"; o que vem
// da nota do Forteplus, em "Relatórios" (dono, 2026-10-15: o nome de todo setor); o que a gestão concede, em "Gestão".
const MEU_DIA = 'Meu dia';
const visoesDoGrupo = (grupo: string): MenuItem[] => VISOES.filter((v) => v.grupo === grupo).map((v) => ({
  to: v.rota, icon: v.valor === 'atendimento' ? Ticket : BarChart3, label: v.rotulo, title: v.descricao, secao: grupo,
}));

const comercialMenuItems: MenuItem[] = [
  // A planilha de Gestão Comercial dentro do sistema (LEVA O, 2026-09-28): a aba de cada
  // vendedora vira Lançamentos, e o Painel do Gestor vira Indicadores.
  { to: '/comercial/lancamentos', icon: ClipboardList, label: 'Lançamentos', title: 'Registrar contatos, vendas e ações do dia', secao: MEU_DIA },
  { to: '/comercial/carteiras', icon: Briefcase, label: 'Carteira', title: 'Cada cliente da carteira, e a carteira contra a meta da Diretoria', secao: MEU_DIA },
  { to: '/comercial/indicadores', icon: Gauge, label: 'Indicadores', title: 'Meta e realizado de cada indicador (os seus, ou da equipe para o gestor)', secao: MEU_DIA },
  { to: '/comercial/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados do Comercial', secao: MEU_DIA },
  { to: '/comercial/distribuidores', icon: Store, label: 'Distribuidores', title: 'Os distribuidores no portal: salões, estoque, pedidos e carrinhos abertos', secao: MEU_DIA },
  ...visoesDoGrupo(RELATORIOS),
  ...visoesDoGrupo('Gestão'),
  { to: '/comercial/diretrizes', icon: BookMarked, label: 'Diretrizes do Comercial', secao: DO_SETOR },
  { to: '/comercial/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Comercial', secao: DO_SETOR },
];

// Expedição e Produção: setores de atendimento desde 2026-10-02 (decisão do dono) — fila de
// chamados, indicadores e configurações. O estoque e a separação da Expedição saíram.
const expedicaoMenuItems: MenuItem[] = [
  { to: '/expedicao/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados da Expedição', secao: DIA },
  { to: '/expedicao/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores da Expedição', secao: RELATORIOS },
  { to: '/expedicao/diretrizes', icon: BookMarked, label: 'Diretrizes da Expedição', secao: DO_SETOR },
  { to: '/expedicao/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações da Expedição', secao: DO_SETOR },
];

const producaoMenuItems: MenuItem[] = [
  { to: '/producao/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados da Produção', secao: DIA },
  { to: '/producao/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores da Produção', secao: RELATORIOS },
  { to: '/producao/diretrizes', icon: BookMarked, label: 'Diretrizes da Produção', secao: DO_SETOR },
  { to: '/producao/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações da Produção', secao: DO_SETOR },
];

// Diretoria e visao: um item so, sem configuracoes nem fila propria (D6).
// Mesmo mecanismo do Insights do Comercial desde a Frente 3 — "Insights"
// abre as visões recuadas abaixo dele, com a lista vindo de
// `@/config/diretoria-insights` (menu e tela nunca discordam). O dono
// perguntou se o nome não deveria ser Insights também, como o do Comercial
// — sim, é mais fácil de achar.
const diretoriaMenuItems: MenuItem[] = [
  {
    to: '/diretoria',
    icon: Building2,
    label: 'Insights',
    title: 'Metas, carteiras, clientes e produtos, do ponto de vista do diretor',
    children: VISOES_DIRETORIA.map((v) => ({
      to: rotaDaVisaoDiretoria(v.valor),
      icon: ChevronRight,
      label: v.rotulo,
      title: v.descricao,
    })),
  },
  // A Diretoria lê as diretrizes de todos os setores (decisão do dono, 2026-10-04).
  { to: '/diretoria/diretrizes', icon: BookMarked, label: 'Diretrizes', title: 'As diretrizes de todos os setores' },
  { to: '/diretoria/distribuidores', icon: Store, label: 'Distribuidores', title: 'O canal Distribuidor: salões, venda aos salões, estoque e pedidos' },
];

const educacionalMenuItems: MenuItem[] = [
  { to: '/educacional/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados do Educacional', secao: DIA },
  { to: '/educacional/treinamentos', icon: GraduationCap, label: 'Treinamentos', title: 'Treinamentos, turmas e participantes', secao: DIA },
  { to: '/educacional/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores do Educacional', secao: RELATORIOS },
  { to: '/educacional/diretrizes', icon: BookMarked, label: 'Diretrizes do Educacional', secao: DO_SETOR },
  { to: '/educacional/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Educacional', secao: DO_SETOR },
];

// Itens da empresa (só dono/admin). As configurações de cada módulo entram no mesmo grupo,
// para quem tem acesso administrativo ao módulo (ADR-009: "num lugar só").
const configMenuItems: MenuItem[] = [
  { to: '/configuracoes/sistema', icon: Users, label: 'Pessoas e acessos', title: 'Quem entra no sistema, em quais setores, e com qual perfil', secao: 'Empresa' },
  { to: '/configuracoes/identidade-visual', icon: Palette, label: 'Identidade Visual', secao: 'Empresa' },
  { to: '/configuracoes/lyra', icon: Sparkles, label: 'IA / Lyra', secao: 'Empresa' }, // label ajustado em runtime com o nome do assistente
];


const inicioMenuItems = (showPortal: boolean): MenuItem[] => ([
  // Rodada 3, etapa B: um lugar só para acompanhar o que eu pedi ("Meus chamados" e "Pedidos" eram dois).
  // "Minhas solicitações": um nome só para chamado e pedido (dono, 2026-10-28).
  { to: '/meus', icon: Inbox, label: 'Minhas solicitações', title: 'Tudo o que você pediu, com quem está e o que falta' },
  { to: '/meu-rh', icon: Users, label: 'Meu RH' },
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/meus-treinamentos', icon: GraduationCap, label: 'Meus treinamentos', title: 'As turmas em que você está inscrito e as horas que já concluiu' },
  { to: '/metas', icon: Target, label: 'Metas', title: 'Objetivos da empresa e o que se mede embaixo deles' },
  { to: '/projetos', icon: FolderKanban, label: 'Projetos', title: 'Projetos por setor: briefing, cronograma e as suas tarefas' },
  { to: '/chat', icon: MessageSquare, label: 'Chat', title: 'Conversa da equipe, por canal' },
  { to: '/diretrizes', icon: BookMarked, label: 'Diretrizes', title: 'As diretrizes de todos os setores que você pode ler' },
  // "Jornal" → "Notícias" (dono, 2026-10-28); a rota continua /jornal.
  { to: '/jornal', icon: Newspaper, label: 'Notícias', title: 'Notícias da empresa: avisos, novos colaboradores, feriados e festas' },
  ...(showPortal
    ? [{ to: '/base-conhecimento', icon: BookOpen, label: 'Consultar tutoriais', title: 'Base de conhecimento: consultar tutoriais publicados' }]
    : []),
] as MenuItem[]).filter((i) => !estaPausada(i.to));

const allMenuItems = () => [
  ...tiMenuItems, ...mktMenuItems, ...qualidadeMenuItems, ...rhMenuItems, ...financeiroMenuItems, ...comprasMenuItems,
  ...crmMenuItems, ...expedicaoMenuItems, ...producaoMenuItems, ...comercialMenuItems, ...educacionalMenuItems, ...diretoriaMenuItems, ...configMenuItems, ...inicioMenuItems(true),
];

/* Labels & breadcrumb helpers (kept exported for AppLayout compat) */
export const getCurrentPageLabel = (pathname: string): string => {
  const hit = allMenuItems().find(i => i.to === pathname);
  if (hit) return hit.label;
  if (pathname === '/inicio') return 'Início';
  if (pathname === '/nova-solicitacao') return 'Novo';
  if (pathname.startsWith('/helpdesk/')) return 'Detalhe do chamado';
  if (pathname.startsWith('/ti')) return 'TI';
  if (pathname.startsWith('/mkt')) return 'Marketing';
  if (pathname.startsWith('/qualidade')) return 'Qualidade';
  if (pathname.startsWith('/rh')) return 'RH';
  if (pathname.startsWith('/financeiro')) return 'Financeiro';
  if (pathname.startsWith('/compras')) return 'Compras';
  if (pathname.startsWith('/crm')) return 'CRM';
  if (pathname.startsWith('/expedicao')) return 'Expedição';
  if (pathname.startsWith('/producao')) return 'Produção';
  if (pathname.startsWith('/comercial')) return 'Comercial';
  if (pathname.startsWith('/educacional')) return 'Educacional';
  if (pathname.startsWith('/diretoria')) return 'Diretoria';
  if (pathname.startsWith('/configuracoes')) return 'Configurações';
  if (pathname.startsWith('/chat')) return 'Chat';
  return 'Página';
};

/** Resolve rotas de detalhe (`/ti/chamados/:id`, `/ti/pops/:id/editar`, etc.). */
function detailCrumb(pathname: string, items: MenuItem[]): { parent?: MenuItem; leaf?: string } {
  const parent = items
    .filter(i => pathname.startsWith(i.to + '/'))
    .sort((a, b) => b.to.length - a.to.length)[0];
  if (!parent) return {};
  const rest = pathname.slice(parent.to.length + 1).split('/');
  const id = rest[0];
  const action = rest[1];
  if (id === 'novo' || id === 'nova') return { parent, leaf: parent.to === '/projetos' ? 'Novo projeto' : 'Novo registro' };
  // O identificador curto ajuda onde ele significa algo para quem lê (o número
  // do chamado). Num projeto não significa nada, e o nome do projeto já está
  // no título logo abaixo — aqui o id cru era só ruído.
  if (parent.to === '/projetos') return { parent, leaf: id === 'minhas' ? 'Minhas tarefas' : 'Projeto' };
  // O nome do canal já aparece no cabeçalho da conversa — o id cru aqui
  // seria só ruído, mesmo motivo do quadro de projetos, acima.
  if (parent.to === '/chat') return { parent, leaf: 'Conversa' };
  const short = id.length > 8 ? `${id.slice(0, 8)}…` : id;
  const leaf = action === 'editar' ? `# ${short} — Editar` : `# ${short} — Detalhe`;
  return { parent, leaf };
}

export const getBreadcrumb = (pathnameRaw: string): { label: string; path?: string }[] => {
  const pathname = stripTenantPrefix(pathnameRaw);
  const segments: { label: string; path?: string }[] = [{ label: 'Início', path: '/inicio' }];

  const push = (moduleLabel: string, home: string, items: MenuItem[]) => {
    segments.push({ label: moduleLabel, path: home });
    const sub = items.find(i => i.to === pathname);
    if (sub) { segments.push({ label: sub.label }); return; }
    const { parent, leaf } = detailCrumb(pathname, items);
    if (parent) {
      segments.push({ label: parent.label, path: parent.to });
      if (leaf) segments.push({ label: leaf });
    }
  };

  if (pathname.startsWith('/ti') || pathname.startsWith('/inventario')) {
    push('TI', '/ti/chamados', tiMenuItems);
  } else if (pathname.startsWith('/mkt')) {
    push('Marketing', '/mkt/chamados', mktMenuItems);
  } else if (pathname.startsWith('/qualidade')) {
    push('Qualidade', '/qualidade/chamados', qualidadeMenuItems);
  } else if (pathname.startsWith('/rh')) {
    push('RH', '/rh/chamados', rhMenuItems);
  } else if (pathname.startsWith('/financeiro')) {
    push('Financeiro', '/financeiro/contas-a-pagar', financeiroMenuItems);
  } else if (pathname.startsWith('/crm')) {
    push('CRM', '/crm/funil', crmMenuItems);
  } else if (pathname.startsWith('/expedicao')) {
    push('Expedição', '/expedicao/chamados', expedicaoMenuItems);
  } else if (pathname.startsWith('/producao')) {
    push('Produção', '/producao/chamados', producaoMenuItems);
  } else if (pathname.startsWith('/comercial')) {
    push('Comercial', '/comercial/chamados', comercialMenuItems);
  } else if (pathname.startsWith('/educacional')) {
    push('Educacional', '/educacional/chamados', educacionalMenuItems);
  } else if (pathname.startsWith('/configuracoes')) {
    segments.push({ label: 'Configurações' });
    const sub = configMenuItems.find(i => i.to === pathname);
    if (sub) segments.push({ label: sub.label });
  } else if (pathname !== '/inicio') {
    const personal = inicioMenuItems(true);
    const sub = personal.find(i => i.to === pathname);
    if (sub) { segments.push({ label: sub.label }); return segments; }
    const { parent, leaf } = detailCrumb(pathname, personal);
    if (parent) {
      segments.push({ label: parent.label, path: parent.to });
      if (leaf) segments.push({ label: leaf });
    } else {
      segments.push({ label: getCurrentPageLabel(pathname) });
    }
  }
  return segments;
};


function stripTenantPrefix(pathname: string): string {
  const m = pathname.match(/^\/t\/[^/]+(\/.*)?$/);
  return m ? (m[1] || '/') : pathname;
}

function getActiveGroupId(pathname: string): string {
  const p = stripTenantPrefix(pathname);
  // Configurações de módulo vivem no grupo "Configurações" (ADR-009), não no grupo do módulo.
  if (p.endsWith('/configuracoes') || p.startsWith('/configuracoes')) return 'config';
  if (p.startsWith('/ti') || p.startsWith('/inventario')) return 'ti';
  if (p.startsWith('/crm')) return 'crm';
  if (p.startsWith('/expedicao')) return 'expedicao';
  if (p.startsWith('/producao')) return 'producao';
  if (p.startsWith('/mkt')) return 'mkt';
  if (p.startsWith('/qualidade')) return 'qualidade';
  if (p.startsWith('/rh')) return 'rh';
  if (p.startsWith('/financeiro')) return 'financeiro';
  if (p.startsWith('/comercial')) return 'comercial';
  if (p.startsWith('/educacional')) return 'educacional';
  if (p.startsWith('/diretoria')) return 'diretoria';
  return 'inicio';
}

const COLLAPSE_KEY = 'helpoint.sidebar.collapsed';
const OPEN_GROUP_KEY = 'helpoint.sidebar.openGroup';
const TODOS_KEY = 'helpoint.sidebar.todosOsSetores';
/** A linha "Todos os setores" entre os grupos do menu do celular. */
const TODOS_OS_SETORES = 'todos-os-setores' as const;

interface AppSidebarProps {
  /** Em telas pequenas a sidebar vira gaveta sobreposta. */
  isDrawer?: boolean;
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
}

export function AppSidebar({ isDrawer = false, drawerOpen = false, onCloseDrawer }: AppSidebarProps) {
  const { profile, signOut } = useAuth();
  const modules = useVisibleModules();
  const { data: caixinhas = [] } = useCaixinhas();
  const emBreve = useTelasEmBreve();
  const location = useLocation();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: purchaseCounters } = usePurchaseCounters();
  // Atualizações do sistema ainda não lidas: o número azul do Jornal (2026-10-14).
  const { data: jornalNaoLidas } = useAtualizacoesNaoLidas();
  const { data: chatNaoLidas } = useNaoLidas();
  // A mesma consulta (e o mesmo cache) da tela Meus treinamentos: só as turmas da própria pessoa.
  const { data: temTurma = false } = useQuery({
    queryKey: ['meus-treinamentos', profile?.id], enabled: !!profile?.id,
    queryFn: async () => unwrap(await supabase.rpc('meus_treinamentos' as never)) as unknown as unknown[],
    select: (linhas) => linhas.length > 0,
  });
  const avisos = useContadoresDeAvisos();
  const { can: canCompras } = useDepartmentPermissions('compras');
  // Frente 6 (.scratch/plano-frente6-importacoes.md §3): o item
  // "Importações" segue uma regra DIFERENTE do resto de "Configurações" —
  // não é dono/admin (`showSettings`), é `vendas.importar` OU
  // `metas.definir`, a MESMA função que decide os cartões dentro da tela
  // (`src/lib/importacoes-acesso.ts`), para as duas portas nunca discordar.
  const { canComoOBanco: canComercial } = useDepartmentPermissions('comercial');
  // Cada tela com caixinha no perfil aparece para quem tem "Ver" nela — começou no RH (2026-10-01)
  // e vale para todos os setores desde 2026-10-02 (`TELAS_DO_PERFIL`, a mesma lista da guarda).
  // Enquanto o perfil carrega (ou se a leitura falhar), o menu não esconde: a guarda decide.
  const perfilDasTelas = useConfiguracaoDosSetores();
  const abreTela = (to: string) => {
    const tela = telaDoPerfil(to);
    if (!tela || perfilDasTelas.isLoading || perfilDasTelas.isError) return true;
    return abreATela(tela, perfilDasTelas.pode);
  };
  const podeVerImportacoes = resolverAcessoImportacoes({
    podeImportarVendas: canComercial('vendas', 'importar'),
    podeDefinirMetas: canComercial('metas', 'definir'),
  }).mostrarItemDeMenu;
  const [tenantInfo, setTenantInfo] = useState<{ name: string; logo_url: string | null; icon_url: string | null } | null>(null);

  useEffect(() => {
    if (!profile?.tenant_id) return;
    const load = async () => {
      const { data, error } = await supabase.from('tenants').select('name,logo_url,settings').eq('id', profile.tenant_id).maybeSingle();
      if (error) { console.error(error); return; }
      if (data) setTenantInfo({
        name: data.name,
        logo_url: data.logo_url,
        icon_url: ((data.settings as any)?.branding?.iconUrl as string) || null,
      });
    };
    load();
    // Re-busca quando o painel Identidade Visual salva/reseta o branding.
    window.addEventListener('tenant-branding-updated', load);
    return () => window.removeEventListener('tenant-branding-updated', load);
  }, [profile?.tenant_id]);


  const assistantName = useAssistantName();
  // "Configurações" num lugar só (ADR-009). Duas seções (LEVA P): o que é da EMPRESA, e os
  // SETORES — um item só, que abre a grade dos setores (dono, 2026-09-29: "a pessoa clica em
  // Setores e abre o menu para selecionar qual setor, igual quando abre chamado"). Eram nove itens,
  // um por setor. O item aparece para quem configura PELO MENOS UM setor; qual setor fica ativo
  // na grade é o perfil de acesso de cada um (`useSetoresQueConfiguro`).
  const { algum: configuraAlgumSetor } = useSetoresQueConfiguro();
  const configItems: MenuItem[] = [
    ...(modules.showSettings ? configMenuItems.map(i => i.to === '/configuracoes/lyra' ? { ...i, label: `IA / ${assistantName}` } : i) : []),
    ...(podeVerImportacoes ? [{
      to: '/configuracoes/importacoes', icon: Upload, label: 'Importações',
      title: 'Importar vendas, clientes e metas — atualiza Comercial e Diretoria de um lugar só',
      secao: 'Empresa',
    }] : []),
    // Cadastro de clientes: só em Configurações, só dono e administradores (dono, 2026-10-15). A pergunta é a
    // mesma do INSERT no banco (`clientes.cadastrar`, desligada em todo perfil; dono/admin passam sempre).
    ...(canComercial('clientes', 'cadastrar') ? [{
      to: '/configuracoes/clientes', icon: IdCard, label: 'Cadastro de clientes',
      title: 'Cadastrar cliente novo e completar os que existem',
      secao: 'Empresa',
    }] : []),
    ...(configuraAlgumSetor ? [{
      to: ROTA_DOS_SETORES, icon: Settings, label: 'Setores',
      title: 'As configurações de cada setor: categorias, prazos, automações e o que é só dele',
      secao: 'Setores',
    }] : []),
  ];
  // Configurações do setor no grupo "Do setor" (2026-10-14), só para quem abre a configuração daquele setor; os
  // outros chegam lá por Configurações › Setores, como antes.
  const withoutConfig = (items: MenuItem[], setor?: Department) =>
    items.filter(i => !i.to.endsWith('/configuracoes') || (!!setor && !perfilDasTelas.isLoading && perfilDasTelas.abre(setor)));

  // O responsável de uma Caixinha sem o Financeiro entra nela pelo Início (dono, 2026-10-20).
  const responsavelDeCaixinha = !!profile?.id && caixinhas.some((c) => c.responsavel_id === profile.id);
  const caixinhaNoInicio = responsavelDeCaixinha
    && !abreTela('/financeiro/caixinha');
  const groups: MenuGroup[] = [
    { id: 'inicio',    label: 'Início',       icon: Home,
      // "Meus treinamentos" só para quem tem turma (dono, 2026-10-28).
      items: [...inicioMenuItems(modules.showPortal).filter((i) => i.to !== '/meus-treinamentos' || temTurma),
        ...(caixinhaNoInicio ? [{ to: '/caixinha', icon: PiggyBank, label: 'Caixinha', title: 'A Caixinha que você cuida' }] : []),
        // O estoque que a Caixinha abastece, para o responsável sem o Estoque de Compras (etapa 0b, 2026-10-25).
        ...(responsavelDeCaixinha && !abreTela('/compras/estoque')
          ? [{ to: '/estoque-de-suprimentos', icon: Boxes, label: 'Estoque de suprimentos', title: 'O que a Caixinha comprou e o que foi retirado' }] : [])],
      show: true, home: '/inicio' },
    { id: 'ti',        label: 'TI',           icon: Monitor,     items: withoutConfig(tiMenuItems, 'ti'),        show: modules.showTI,        home: '/ti/chamados' },
    { id: 'qualidade', label: 'Qualidade',    icon: ShieldCheck, items: withoutConfig(qualidadeMenuItems, 'qualidade'), show: modules.showQuality,   home: '/qualidade/chamados' },
    { id: 'rh',        label: 'RH',           icon: Users,       items: withoutConfig(rhMenuItems, 'rh'),        show: modules.showRH,        home: '/rh/chamados' },
    { id: 'mkt',       label: 'Marketing',    icon: Megaphone,   items: withoutConfig(mktMenuItems, 'marketing'),       show: modules.showMarketing, home: '/mkt/chamados' },
    { id: 'financeiro', label: 'Financeiro',   icon: Banknote,    items: withoutConfig(financeiroMenuItems, 'financeiro'), show: modules.showFinanceiro, home: '/financeiro/contas-a-pagar' },
    // Compras, grupo próprio desde 2026-09-27 (leva N). A configuração dele (LEVA P) mora em
    // Configurações › Setores, como a dos outros.
    { id: 'compras',   label: 'Compras',       icon: ShoppingCart,  items: comprasMenuItems,                  show: modules.showCompras,   home: '/compras' },
    { id: 'crm',       label: 'CRM',           icon: KanbanSquare,   items: withoutConfig(crmMenuItems),       show: modules.showCRM,       home: '/crm/funil' },
    { id: 'expedicao', label: 'Expedição',     icon: PackageCheck,   items: withoutConfig(expedicaoMenuItems, 'expedicao'), show: modules.showExpedicao, home: '/expedicao/chamados' },
    { id: 'producao',  label: 'Produção',      icon: Factory,        items: withoutConfig(producaoMenuItems, 'producao'),  show: modules.showProducao,  home: '/producao/chamados' },
    { id: 'comercial', label: 'Comercial',     icon: Handshake,      items: withoutConfig(comercialMenuItems, 'comercial'), show: modules.showComercial,
      // Quem entra no Comercial cai no trabalho dela, não na fila de chamados (etapa 4 · Comercial, 2026-10-24): a
      // vendedora em Lançamentos, o gestor (vê a equipe) na Carteira.
      home: canComercial('reports', 'view_team_metrics') ? '/comercial/carteiras' : '/comercial/lancamentos' },
    { id: 'educacional', label: 'Educacional', icon: GraduationCap, items: withoutConfig(educacionalMenuItems, 'educacional'), show: modules.showEducacional, home: '/educacional/chamados' },
    { id: 'diretoria', label: 'Diretoria',   icon: Building2,     items: withoutConfig(diretoriaMenuItems), show: modules.showDiretoria, home: '/diretoria' },
    { id: 'config',    label: 'Configurações',icon: Settings,    items: configItems,        show: configItems.length > 0,  home: modules.showSettings ? '/configuracoes/sistema' : (configItems[0]?.to ?? '/inicio') },
  ];

  const activeGroupId = getActiveGroupId(location.pathname);

  /* Um grupo aberto por vez, persistido em localStorage */
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    try { return localStorage.getItem(OPEN_GROUP_KEY) || activeGroupId; } catch { return activeGroupId; }
  });

  /* Os grupos de dentro de cada setor (Dia a dia, Relatórios…) que a pessoa abriu ou fechou — também lembrados. */
  const [secoesAbertas, setSecoesAbertas] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('helpoint.menu.secoes') ?? '{}') as Record<string, boolean>; } catch { return {}; }
  });
  const alternarSecao = (chave: string, aberta: boolean) => setSecoesAbertas((s) => {
    const novo = { ...s, [chave]: !aberta };
    try { localStorage.setItem('helpoint.menu.secoes', JSON.stringify(novo)); } catch { /* sem armazenamento: só não lembra */ }
    return novo;
  });

  useEffect(() => {
    setOpenGroup(activeGroupId);
  }, [activeGroupId]);

  useEffect(() => {
    try { if (openGroup) localStorage.setItem(OPEN_GROUP_KEY, openGroup); } catch { /* noop */ }
  }, [openGroup]);

  const toggleGroup = (id: string) => setOpenGroup(prev => (prev === id ? null : id));

  /**
   * Cabeçalho de grupo: fora do grupo → navega para `group.home`;
   * já dentro do grupo → apenas abre/fecha a lista de sub-itens.
   */
  const handleGroupClick = (group: MenuGroup) => {
    if (group.id !== activeGroupId) {
      setOpenGroup(group.id);
      go(group.home);
      return;
    }
    toggleGroup(group.id);
  };


  /* Colapso (248px → 64px), persistido */
  const [collapsedPref, setCollapsedPref] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { return false; }
  });
  const collapsed = isDrawer ? false : collapsedPref;
  const toggleCollapsed = () => {
    setCollapsedPref(prev => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* noop */ }
      return next;
    });
  };

  /* Filtro de menu (case e acento insensível) */
  const [menuQuery, setMenuQuery] = useState('');
  const normalize = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isFiltering = !collapsed && menuQuery.trim().length > 0;
  const noCelular = useIsBelow(LARGURA_DO_CELULAR);
  const visibleGroups = groups
    .filter(g => g.show)
    // A tela com caixinha no perfil só aparece com "Ver" marcado (2026-10-02, todos os setores) —
    // a mesma lista que a guarda das rotas lê (`TELAS_DO_PERFIL`).
    // O item com sub-itens (Insights) fica enquanto algum sub-item abre, e leva ao primeiro deles: as abas da
    // Diretoria têm "Ver" cada uma desde 2026-10-24 (decisão 5).
    .map(g => ({ ...g, items: g.items
      .map(i => {
        if (!i.children) return i;
        const children = i.children.filter(c => abreTela(c.to));
        return { ...i, children, to: abreTela(i.to) ? i.to : children[0]?.to ?? i.to };
      })
      .filter(i => (i.children ? i.children.length > 0 : abreTela(i.to))) }))
    // A entrada do grupo é a primeira tela que a pessoa abre (quem só aprova compras entra em "Aprovar
    // compras", não em Solicitações, que ela não abre).
    // No celular, só o dia a dia (dono, 2026-10-28, `config/celular`): relatório e cadastro saem do menu; a Diretoria
    // vira o "Resumo do diretor" (a mesma rota, que no celular abre o resumo).
    .map(g => (!noCelular ? g : {
      ...g,
      items: g.items.filter(i => ficaNoCelular(i.to))
        .map(i => (i.to === '/diretoria' ? { ...i, label: 'Resumo do diretor', children: undefined } : i)),
    }))
    .filter(g => !noCelular || g.items.length > 0)
    .map(g => ({ ...g, home: abreTela(g.home) && (!noCelular || ficaNoCelular(g.home)) ? g.home : g.items[0]?.to ?? g.home }))
    .map(g => {
      if (!isFiltering) return g;
      const q = normalize(menuQuery);
      if (normalize(g.label).includes(q)) return g;
      // Um item fica quando o nome dele casa OU quando um sub-item casa —
      // procurar "atendimento" tem que achar a visão dentro do Insights,
      // não só o item que a contém.
      return {
        ...g,
        items: g.items.filter(i =>
          normalize(i.label).includes(q) ||
          (i.children ?? []).some(f => normalize(f.label).includes(q))),
      };
    })
    .filter(g => !isFiltering || g.items.length > 0);


  // Contador do grupo (decisão do dono, 2026-10-02): no Início, todos os avisos não lidos (os do
  // "Lyra avisa"); no setor, os avisos de chamados dele. Aparece em qualquer tela.
  const grupoBadge = (grupo: string) => {
    if (grupo === 'inicio') return avisos.total;
    return Object.entries(avisos.porModulo)
      .filter(([modulo]) => lugarNoMenuDoModulo(modulo).grupo === grupo)
      .reduce((soma, [, qtd]) => soma + qtd, 0);
  };

  const itemBadge = (to: string) => {
    if (to === '/jornal') return jornalNaoLidas?.size ?? 0;
    if (to === '/chat') {
      // Decisão 7 (L11b): a bolinha do menu é o total de mensagens não
      // lidas — o mesmo dado de `chat_nao_lidas()`, sem sistema de aviso
      // novo. Zera sozinha quando a pessoa abre o canal (`useEntrarNoCanal`
      // grava `last_read_at`).
      return (chatNaoLidas ?? []).reduce((soma, n) => soma + n.qtd, 0);
    }
    // A bolinha mudou de endereço com o módulo (leva N): era `/financeiro/compras`.
    // E a permissão mudou de departamento: `financeiro:purchases:*` virou
    // `compras:solicitacoes:*`.
    // A fila de chamados de cada setor: os avisos de chamados dele (2026-10-02).
    const avisosDaFila = Object.entries(avisos.porModulo)
      .find(([modulo]) => lugarNoMenuDoModulo(modulo).fila === to)?.[1];
    if (avisosDaFila) return avisosDaFila;
    // Compras esperando decisão: em "Aprovar compras" (saiu da Diretoria em 2026-10-09), só para quem decide.
    if (to === '/compras/aprovacoes') {
      return canCompras('solicitacoes', 'approve') ? purchaseCounters?.pendingApproval ?? 0 : 0;
    }
    // Em Solicitações, as aprovadas esperando a compra — para quem compra.
    if (to === '/compras') {
      return canCompras('solicitacoes', 'execute') ? purchaseCounters?.pendingExecution ?? 0 : 0;
    }
    return 0;
  };

  const isItemActive = (to: string) => {
    const p = stripTenantPrefix(location.pathname);
    const [caminho] = to.split('?');
    // "Setores" fica aceso também dentro da configuração de um setor (`/rh/configuracoes`…):
    // é por ele que se chega lá.
    if (caminho === ROTA_DOS_SETORES && p.endsWith('/configuracoes')) return true;
    return p === caminho || p.startsWith(caminho + '/');
  };

  /**
   * Sub-item marcado: o caminho bate E a visão bate. As visões da Diretoria
   * (Comercial e, desde a Frente 3, Diretoria) dividem a mesma rota e só se
   * distinguem pelo `?visao=` — comparar só o caminho deixaria todas
   * acesas ao mesmo tempo.
   *
   * Ausência de `?visao=` na barra significa a visão padrão (é o que a
   * página renderiza), então ela é resolvida dos dois lados antes de
   * comparar: `/comercial/insights` e `…?visao=vendas` acendem o mesmo
   * item — e o mesmo vale para `/diretoria` e `…?visao=resumo`.
   *
   * Agora que é o SEGUNDO recurso com sub-itens, generaliza (ponytail: o
   * segundo caso é que vira regra geral, não o primeiro) — o resolvedor
   * certo é escolhido pelo caminho antes da `?`.
   */
  const isSubItemActive = (to: string) => {
    if (!isItemActive(to)) return false;
    const [caminho, query] = to.split('?');
    const resolver = resolverVisaoDiretoria;
    const doItem = resolver(new URLSearchParams(query ?? '').get('visao'));
    const daBarra = resolver(new URLSearchParams(location.search).get('visao'));
    return doItem === daBarra;
  };

  const go = (to: string) => {
    navigate(tenantPath(to));
    onCloseDrawer?.();
  };

  // "Fixados" e "Usados por último" saíram do menu, no computador e no celular (dono, 2026-10-28: "não ficou legal").

  // Celular e tablet (o menu que desliza): os setores da pessoa em cima e "Todos os setores" recolhido (rodada 2, decisão
  // 3). Abre sozinho quando a tela atual é de um setor de fora, e quando a pessoa procura um menu.
  const { data: meusSetores } = useMeusSetores();
  const separado = isDrawer && !isFiltering
    ? separarOMenu(visibleGroups, meusSetores)
    : { meus: visibleGroups, outros: [] as typeof visibleGroups, fim: [] as typeof visibleGroups };
  const [todosAbertos, setTodosAbertos] = useState(() => {
    try { return localStorage.getItem(TODOS_KEY) === '1'; } catch { return false; }
  });
  const alternarTodos = (abrir: boolean) => {
    setTodosAbertos(abrir);
    try { localStorage.setItem(TODOS_KEY, abrir ? '1' : '0'); } catch { /* sem armazenamento: só não lembra */ }
  };
  const todosVisiveis = todosAbertos || separado.outros.some((g) => g.id === activeGroupId);
  const linhasDoMenu: Array<(typeof visibleGroups)[number] | typeof TODOS_OS_SETORES> = [
    ...separado.meus,
    ...(separado.outros.length ? [TODOS_OS_SETORES, ...(todosVisiveis ? separado.outros : [])] : []),
    ...separado.fim,
  ];

  const aside = (
    <aside
      className={cn(
        'flex flex-col shrink-0 text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200',
        isDrawer ? 'h-full w-full' : 'sticky top-0 h-screen',
        !isDrawer && (collapsed ? 'w-[72px]' : 'w-[240px]'),
      )}
      style={{ backgroundColor: 'hsl(var(--sidebar-background))' }}
    >
      {/* Logo */}
      <div
        className={cn('h-[70px] flex items-center gap-2 shrink-0', collapsed ? 'px-2 justify-center' : 'px-5')}
        style={{ borderBottom: '1px solid hsl(var(--sidebar-border))' }}
      >
        <button
          onClick={() => go('/inicio')}
          className="flex items-center gap-2.5 group min-w-0 flex-1"
          title="Ir para o início"
        >
          {(() => {
            const mark = collapsed
              ? (tenantInfo?.icon_url || tenantInfo?.logo_url)
              : tenantInfo?.logo_url;
            const tenantName = tenantInfo?.name?.trim();
            if (mark) {
              return (
                <>
                  <img
                    src={mark}
                    alt={tenantName || 'Logo'}
                    className="w-9 h-9 rounded-lg object-cover bg-muted shrink-0"
                  />
                  {!collapsed && tenantName && (
                    <span className="font-extrabold text-[18px] text-sidebar-foreground tracking-[-0.01em] truncate">
                      {tenantName}
                    </span>
                  )}
                </>
              );
            }
            const hasOwnBrand = !!tenantName;
            return (
              <>
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shadow-sm shrink-0"
                  style={{ backgroundColor: 'hsl(var(--accent))' }}
                >
                  <span className="text-primary-foreground font-extrabold text-base font-display">
                    {hasOwnBrand ? tenantName!.charAt(0).toUpperCase() : 'H'}
                  </span>
                </div>
                {!collapsed && (
                  <div className="flex flex-col leading-tight text-left">
                    <span className="font-extrabold text-[18px] text-sidebar-foreground tracking-[-0.01em] truncate">
                      {hasOwnBrand ? tenantName : 'Helpoint'}
                    </span>
                    {!hasOwnBrand && (
                      <span className="text-[12px] text-muted-foreground uppercase tracking-wider font-semibold">Gestão integrada</span>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </button>
        {isDrawer ? (
          <button
            type="button"
            onClick={onCloseDrawer}
            aria-label="Fechar menu"
            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sidebar-foreground shrink-0"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        ) : (
          !collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Recolher menu"
              title="Recolher menu"
              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sidebar-foreground shrink-0"
            >
              <PanelLeftClose className="w-4 h-4" aria-hidden="true" />
            </button>
          )
        )}
      </div>

      {/* Ação primária: sempre visível */}
      <div className={cn('shrink-0 pt-4 pb-1', collapsed ? 'px-2' : 'px-6')}>
        <button
          type="button"
          onClick={() => go('/nova-solicitacao')}
          title="Novo chamado (algo quebrou, preciso de ajuda) ou pedido (algo que alguém aprova e entrega)"
          aria-label="Novo chamado ou pedido"
          className={cn(
            'w-full h-[43px] flex items-center rounded-md bg-primary text-primary-foreground text-[14px] font-bold hover:bg-primary/90 transition-colors',
            collapsed ? 'justify-center' : 'justify-center gap-2',
          )}
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          {!collapsed && <span>Novo</span>}
        </button>
      </div>

      {collapsed ? (
        <div className="px-2 pt-2 pb-1 shrink-0">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Expandir menu"
            title="Expandir menu"
            className="w-full h-9 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-sidebar-foreground"
          >
            <PanelLeftOpen className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      ) : (
        /* Search — filtra os itens de menu em tempo real */
        <div className="px-6 pt-3 pb-2 shrink-0">
          <div className="relative">
            <label htmlFor="sidebar-menu-search" className="sr-only">Encontrar um menu</label>
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" strokeWidth={2} aria-hidden="true" />
            <input
              id="sidebar-menu-search"
              type="search"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Encontrar um menu…"
              className="w-full h-[38px] pl-9 pr-3 rounded-full text-[14px] bg-background border border-input text-foreground placeholder:text-muted-foreground focus:border-primary transition-colors"
            />
          </div>
          {isFiltering && visibleGroups.length === 0 && (
            <p className="mt-2 px-1 text-[12px] text-muted-foreground">Nenhum menu encontrado.</p>
          )}
        </div>
      )}

      {/* Groups */}
      <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-2')} aria-label="Navegação principal">
        {linhasDoMenu.map(group => {
          if (group === TODOS_OS_SETORES) {
            return (
              <button key="todos-os-setores" type="button" aria-expanded={todosVisiveis}
                onClick={() => alternarTodos(!todosVisiveis)}
                className="w-full flex items-center gap-3.5 h-11 mt-1 px-4 rounded-md text-[12px] font-bold [text-transform:uppercase] tracking-[0.3px] text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-muted">
                <span className="flex-1 text-left">Todos os setores ({separado.outros.length})</span>
                <ChevronDown className={cn('w-3.5 h-3.5 transition-transform duration-200', todosVisiveis ? 'rotate-0' : '-rotate-90')} aria-hidden="true" />
              </button>
            );
          }
          const isActiveGroup = group.id === activeGroupId;
          const Icon = group.icon;
          const naoLidos = grupoBadge(group.id);

          if (collapsed) {
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => go(group.home)}
                title={group.label}
                aria-label={group.label}
                aria-current={isActiveGroup ? 'page' : undefined}
                className={cn(
                  'relative w-full h-10 mb-1 flex items-center justify-center rounded-md transition-colors',
                  isActiveGroup ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-muted',
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={isActiveGroup ? 2.2 : 1.8} aria-hidden="true" />
                {naoLidos > 0 && (
                  <span aria-hidden="true" className="absolute top-1.5 right-2 h-2 w-2 rounded-full bg-primary" />
                )}
              </button>
            );
          }

          const isOpen = isFiltering ? true : openGroup === group.id;
          const panelId = `sidebar-group-${group.id}`;
          return (
            <div key={group.id} className="mb-0.5">
              <button
                type="button"
                onClick={() => handleGroupClick(group)}
                aria-expanded={isOpen}
                aria-controls={panelId}
                className={cn(
                  'w-full flex items-center gap-3.5 h-[46px] px-4 rounded-md transition-colors duration-150 tracking-[0.3px]',
                  isActiveGroup ? 'text-primary' : 'text-sidebar-foreground hover:bg-muted'
                )}
              >
                <Icon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActiveGroup ? 2.2 : 1.8} aria-hidden="true" />
                <span className={cn('flex-1 text-left text-[14px]', isActiveGroup ? 'font-bold' : 'font-semibold')}>{group.label}</span>
                {naoLidos > 0 && (
                  <span
                    className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-aviso text-primary-foreground text-[12px] font-bold flex items-center justify-center"
                    title={group.id === 'inicio' ? 'Avisos não lidos (na tela inicial)' : 'Avisos de chamados deste setor'}
                  >
                    {naoLidos > 99 ? '99+' : naoLidos}
                  </span>
                )}
                <ChevronDown
                  className={cn('w-3.5 h-3.5 transition-transform duration-200', isOpen ? 'rotate-0' : '-rotate-90')}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <ul id={panelId} className="mt-1 mb-2 pl-4 space-y-1">
                  {group.items.map((item, idx, itens) => {
                    const isActive = isItemActive(item.to);
                    const SubIcon = item.icon;
                    const abreSecao = !!item.secao && item.secao !== itens[idx - 1]?.secao;
                    // Grupo que abre e fecha (dono, 2026-10-14). Aberto: o que a pessoa deixou aberto; senão, o
                    // "Dia a dia" (ou todos, onde não há Dia a dia). O grupo da tela atual e a busca abrem sempre.
                    const chaveDaSecao = `${group.id}:${item.secao}`;
                    const secaoAberta = !item.secao || isFiltering
                      || itens.some((i) => i.secao === item.secao && isItemActive(i.to))
                      || (secoesAbertas[chaveDaSecao] ?? (['Dia a dia', 'Meu dia'].includes(item.secao) || !itens.some((i) => ['Dia a dia', 'Meu dia'].includes(i.secao ?? ''))));
                    if (!abreSecao && !secaoAberta) return null;
                    return (
                      <li key={item.to}>
                        {abreSecao && (
                          <button type="button" aria-expanded={secaoAberta}
                            onClick={() => alternarSecao(chaveDaSecao, secaoAberta)}
                            className={cn('w-full flex items-center gap-1 px-4 pb-1 text-[12px] font-bold [text-transform:uppercase] tracking-[0.3px] text-sidebar-foreground/60 hover:text-sidebar-foreground', idx > 0 && 'pt-3')}>
                            <span className="flex-1 text-left">{item.secao}</span>
                            <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', secaoAberta ? 'rotate-0' : '-rotate-90')} aria-hidden="true" />
                          </button>
                        )}
                        {!secaoAberta ? null : emBreve[item.to] ? (
                          // Em breve: aparece apagado, com o motivo (dono, 2026-10-03). No celular não há "passar o mouse":
                          // tocar mostra o motivo (rodada 2, R3).
                          <button
                            type="button"
                            aria-disabled="true"
                            title={emBreve[item.to]}
                            onClick={() => toast.info(`${item.label}: em breve`, { description: emBreve[item.to] })}
                            className="w-full text-left flex items-center gap-3 min-h-[44px] px-4 rounded-md text-[14px] font-semibold text-muted-foreground/50 select-none"
                          >
                            <SubIcon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} aria-hidden="true" />
                            <span className="truncate">{item.label}</span>
                            <span className="ml-auto shrink-0 text-[12px] uppercase tracking-wide">em breve</span>
                          </button>
                        ) : (
                        <NavLink
                          to={tenantPath(item.to)}
                          onClick={() => onCloseDrawer?.()}
                          title={item.title || item.label}
                          aria-label={item.title || item.label}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-3 min-h-[44px] px-4 rounded-md text-[14px] tracking-[0.3px] transition-colors duration-150',
                            isActive
                              ? 'bg-primary text-primary-foreground font-bold'
                              : 'font-semibold text-sidebar-foreground hover:bg-muted'
                          )}
                        >
                          {/* A barrinha na borda do menu, como na DashStack: 8px do nav + 16px do recuo da lista. */}
                          {isActive && (
                            <span aria-hidden="true" className="absolute -left-[24px] top-0 bottom-0 w-1 rounded-r bg-primary" />
                          )}
                          <SubIcon className="w-[18px] h-[18px] shrink-0" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                          {itemBadge(item.to) > 0 && (
                            <span
                              className={cn('ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full text-[12px] font-bold flex items-center justify-center',
                                isActive ? 'bg-primary-foreground text-primary' : 'bg-aviso text-primary-foreground')}
                              title={item.to === '/chat' ? 'Mensagens não lidas' : item.to === '/jornal' ? 'Atualizações do sistema que você ainda não leu' : item.to === '/compras' ? 'Compras pendentes da sua ação' : item.to === '/diretoria' ? 'Compras esperando sua decisão' : 'Avisos de chamados não lidos'}
                            >
                              {itemBadge(item.to)}
                            </span>
                          )}
                        </NavLink>
                        )}

                        {/* Sub-itens: aparecem quando se está dentro do item
                            (dono, 2026-09-21 — as opções do Insights ficam no
                            menu, não num seletor no canto da tela). Comercial
                            e, desde a Frente 3, Diretoria usam isto. */}
                        {item.children && (isActive || isFiltering) && (
                          <ul className="mt-1 ml-4 pl-3 space-y-0.5">
                            {/* Filtrando, mostra só os que casam — quem procura
                                "curva" tem que VER a opção, não só o item que a
                                contém (achado A5 da auditoria). */}
                            {item.children
                              .filter(f => !isFiltering || normalize(f.label).includes(normalize(menuQuery)))
                              .map(filho => {
                              const filhoAtivo = isSubItemActive(filho.to);
                              const FilhoIcon = filho.icon;
                              return (
                                <li key={filho.to}>
                                  {/* `Link`, não `NavLink`: o NavLink calcula o
                                      `aria-current` sozinho a partir do PATHNAME
                                      e ignora o que se passa (react-router-dom
                                      `dist/index.js:851`). As visões dividem o
                                      mesmo pathname, então as cinco saíam como
                                      "página atual" para leitor de tela, embora
                                      só uma acendesse na tela. Aqui quem decide
                                      é `isSubItemActive`, que olha a visão. */}
                                  <Link
                                    to={tenantPath(filho.to)}
                                    onClick={() => onCloseDrawer?.()}
                                    title={filho.title || filho.label}
                                    aria-label={filho.title || filho.label}
                                    aria-current={filhoAtivo ? 'page' : undefined}
                                    className={cn(
                                      'flex items-center gap-2 min-h-[34px] px-3 rounded-md text-[13px] transition-colors duration-150',
                                      filhoAtivo
                                        ? 'bg-primary/10 text-primary font-bold'
                                        : 'font-semibold text-sidebar-foreground hover:bg-muted'
                                    )}
                                  >
                                    <FilhoIcon
                                      className="w-3 h-3 shrink-0"
                                      strokeWidth={filhoAtivo ? 2.4 : 1.8}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">{filho.label}</span>
                                    {itemBadge(filho.to) > 0 && (
                                      <span className="ml-auto shrink-0 min-w-[16px] h-[16px] px-1 rounded-full bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center"
                                        title="Compras esperando sua decisão">
                                        {itemBadge(filho.to)}
                                      </span>
                                    )}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Pé do menu como na DashStack (2026-10-28): "Sair". A pessoa e o "Meu perfil" foram para o topo (ContaNoTopo). */}
      <div className={cn('shrink-0 py-3', collapsed ? 'px-2' : 'px-6')} style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}>
        <button type="button" onClick={() => signOut()} title="Sair" aria-label="Sair"
          className={cn('w-full h-11 flex items-center rounded-md text-[14px] font-semibold tracking-[0.3px] text-sidebar-foreground hover:bg-muted transition-colors',
            collapsed ? 'justify-center' : 'gap-3.5 px-4')}>
          <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );

  if (!isDrawer) return aside;

  return (
    <>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/40"
          aria-hidden="true"
          onClick={onCloseDrawer}
        />
      )}
      {/* A caixa que desliza é ela mesma fixa, com largura e camada (2026-10-25, vídeo do dono no celular): antes ela era
          um item de largura zero do layout, e "-100% da largura" não a tirava da tela — o menu ficava sempre aberto, por
          baixo da página, que pintava por cima dele. */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-[min(300px,85vw)] shadow-lg transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
        aria-hidden={!drawerOpen}
        role="dialog"
        aria-modal={drawerOpen}
        aria-label="Menu de navegação"
      >
        {aside}
      </div>
    </>
  );
}
