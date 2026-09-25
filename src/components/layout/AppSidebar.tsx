import { useState, useEffect } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Ticket, BookOpen, HardDrive, Monitor,
  BarChart3, Settings, LogOut, Plus,
  Inbox, FileText, Key, Wrench, Lightbulb, Megaphone,
  Calendar, Share2, Sparkles, Truck, Home, Target, FolderKanban,
  ShieldCheck, MessageSquare, ChevronDown, ChevronRight, Search, Users,
  CheckCircle2, Receipt, HeartPulse, FolderLock, UserCog, Palette,
  Banknote, CalendarOff, PanelLeftClose, PanelLeftOpen, X, Wallet, TrendingUp,
  ShoppingCart, Package, Handshake, GraduationCap, KanbanSquare, PackageCheck, Boxes, Building2, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { getRoleLabel } from '@/types/database';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ProfileDialog } from '@/components/profile/ProfileDialog';
import { supabase } from '@/integrations/supabase/client';
import { useTenantPath } from '@/hooks/useTenantPath';
import { usePurchaseCounters } from '@/hooks/usePurchases';
import { useNaoLidas } from '@/hooks/useChat';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { useAssistantName } from '@/hooks/useAssistantName';
import { VISOES, rotaDaVisao, resolverVisao } from '@/config/comercial-insights';
import { VISOES_DIRETORIA, rotaDaVisaoDiretoria, resolverVisaoDiretoria } from '@/config/diretoria-insights';
import { resolverAcessoImportacoes } from '@/lib/importacoes-acesso';


/* ── Menu definitions ── */

/**
 * `children`: sub-itens que aparecem recuados sob o item quando se está
 * dentro dele. Primeiro e único caso hoje: as visões do Insights do
 * Comercial (dono, 2026-09-21 — "ao clicar em Insights, as opções ficam no
 * menu lateral"). O item pai continua navegável: clicar nele abre a visão
 * padrão e revela a lista.
 */
type MenuItem = { to: string; icon: any; label: string; title?: string; children?: MenuItem[] };
type MenuGroup = { id: string; label: string; icon: any; items: MenuItem[]; show: boolean; home: string };

const tiMenuItems: MenuItem[] = [
  { to: '/ti/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de TI' },
  { to: '/inventario', icon: HardDrive, label: 'Inventário', title: 'Inventário de TI' },
  { to: '/ti/contratos', icon: FileText, label: 'Contratos' },
  { to: '/ti/licencas', icon: Key, label: 'Licenças' },
  { to: '/ti/manutencoes', icon: Wrench, label: 'Manutenções' },
  { to: '/ti/pops', icon: Lightbulb, label: 'Escrever tutoriais', title: 'Escrever e publicar tutoriais' },
  { to: '/ti/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de TI' },
  { to: '/ti/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de TI' },
];

const mktMenuItems: MenuItem[] = [
  { to: '/mkt/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de Marketing' },
  { to: '/mkt/social', icon: Share2, label: 'Cronograma Social' },
  { to: '/mkt/inventario', icon: HardDrive, label: 'Inventário', title: 'Inventário de Marketing' },
  { to: '/mkt/fornecedores', icon: Truck, label: 'Fornecedores' },
  { to: '/mkt/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de Marketing' },
  { to: '/mkt/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de Marketing' },
];

const qualidadeMenuItems: MenuItem[] = [
  { to: '/qualidade/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de Qualidade' },
  { to: '/qualidade/sacs', icon: MessageSquare, label: 'SACs de Clientes' },
  { to: '/qualidade/dashboard', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de Qualidade' },
  { to: '/qualidade/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de Qualidade' },
];

const rhMenuItems: MenuItem[] = [
  { to: '/rh/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados de RH' },
  { to: '/rh/colaboradores', icon: Users, label: 'Colaboradores' },
  { to: '/rh/folha', icon: Banknote, label: 'Folha de Pagamento' },
  { to: '/rh/faltas', icon: CalendarOff, label: 'Faltas e Atestados' },
  { to: '/rh/aprovacoes', icon: CheckCircle2, label: 'Aprovações' },
  { to: '/rh/holerites', icon: Receipt, label: 'Holerites' },
  { to: '/rh/beneficios', icon: HeartPulse, label: 'Benefícios' },
  { to: '/rh/documentos', icon: FolderLock, label: 'Documentos' },
  { to: '/rh/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores de RH' },
  { to: '/rh/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações de RH' },
];

const financeiroMenuItems: MenuItem[] = [
  { to: '/financeiro/chamados', icon: Inbox, label: 'Chamados', title: 'Chamados e compras do Financeiro' },
  { to: '/financeiro/compras', icon: ShoppingCart, label: 'Compras', title: 'Solicitações de compra' },
  { to: '/financeiro/produtos', icon: Package, label: 'Catálogo de Produtos' },
  { to: '/financeiro/compras/indicadores', icon: BarChart3, label: 'Indicadores de Compras' },
  { to: '/financeiro/contas-a-pagar', icon: Banknote, label: 'Contas a Pagar' },
  { to: '/financeiro/contas-a-receber', icon: Wallet, label: 'Contas a Receber' },
  { to: '/financeiro/fluxo-de-caixa', icon: TrendingUp, label: 'Fluxo de Caixa' },
  { to: '/financeiro/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores financeiros' },
  { to: '/financeiro/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Financeiro' },
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

const comercialMenuItems: MenuItem[] = [
  { to: '/comercial/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados do Comercial' },
  // Uma porta só para o que o Comercial mede. As visões vêm de
  // `@/config/comercial-insights` — a mesma lista que a página usa para
  // decidir o que renderizar, para menu e tela nunca discordarem.
  {
    to: '/comercial/insights',
    icon: BarChart3,
    label: 'Insights',
    title: 'Vendas e atendimento do Comercial',
    children: VISOES.map((v) => ({
      to: rotaDaVisao(v.valor),
      icon: ChevronRight,
      label: v.rotulo,
      title: v.descricao,
    })),
  },
  { to: '/comercial/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Comercial' },
];

// Expedição (EXP-1, ADR-009): domínio próprio, sem fila de chamados — como o CRM.
const expedicaoMenuItems: MenuItem[] = [
  { to: '/expedicao/fila', icon: PackageCheck, label: 'A separar', title: 'Fila da Expedição: pedidos pagos' },
  { to: '/expedicao/estoque', icon: Boxes, label: 'Estoque', title: 'Saldo por produto e por lote' },
  { to: '/expedicao/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações da Expedição' },
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
];

const educacionalMenuItems: MenuItem[] = [
  { to: '/educacional/chamados', icon: Ticket, label: 'Fila de chamados', title: 'Fila de chamados do Educacional' },
  { to: '/educacional/treinamentos', icon: GraduationCap, label: 'Treinamentos', title: 'Treinamentos, turmas e participantes' },
  { to: '/educacional/indicadores', icon: BarChart3, label: 'Indicadores', title: 'Indicadores do Educacional' },
  { to: '/educacional/configuracoes', icon: Settings, label: 'Configurações', title: 'Configurações do Educacional' },
];

// Itens da empresa (só dono/admin). As configurações de cada módulo entram no mesmo grupo,
// para quem tem acesso administrativo ao módulo (ADR-009: "num lugar só").
const configMenuItems: MenuItem[] = [
  { to: '/configuracoes/sistema', icon: Users, label: 'Usuários e acessos' },
  { to: '/configuracoes/identidade-visual', icon: Palette, label: 'Identidade Visual' },
  { to: '/configuracoes/lyra', icon: Sparkles, label: 'IA / Lyra' }, // label ajustado em runtime com o nome do assistente
];

/** A entrada "Configurações" de cada módulo, na ordem dos grupos do menu. */
const MODULE_CONFIG_ITEMS: { to: string; label: string; show: (m: ReturnType<typeof useVisibleModules>) => boolean }[] = [
  { to: '/ti/configuracoes',          label: 'TI',          show: (m) => m.showTI },
  { to: '/qualidade/configuracoes',   label: 'Qualidade',   show: (m) => m.showQuality },
  { to: '/rh/configuracoes',          label: 'RH',          show: (m) => m.showRH },
  { to: '/mkt/configuracoes',         label: 'Marketing',   show: (m) => m.showMarketing },
  { to: '/financeiro/configuracoes',  label: 'Financeiro',  show: (m) => m.showFinanceiro },
  { to: '/crm/configuracoes',         label: 'CRM',         show: (m) => m.showCRM },
  { to: '/expedicao/configuracoes',   label: 'Expedição',   show: (m) => m.showExpedicao },
  { to: '/comercial/configuracoes',   label: 'Comercial',   show: (m) => m.showComercial },
  { to: '/educacional/configuracoes', label: 'Educacional', show: (m) => m.showEducacional },
];

const inicioMenuItems = (showPortal: boolean): MenuItem[] => [
  { to: '/helpdesk', icon: Inbox, label: 'Meus chamados' },
  { to: '/meu-rh', icon: Users, label: 'Meu RH' },
  { to: '/agenda', icon: Calendar, label: 'Agenda' },
  { to: '/metas', icon: Target, label: 'Metas', title: 'Objetivos da empresa e o que se mede embaixo deles' },
  { to: '/projetos', icon: FolderKanban, label: 'Projetos', title: 'Projetos que voce participa, com o quadro de tarefas' },
  { to: '/chat', icon: MessageSquare, label: 'Chat', title: 'Conversa da equipe, por canal' },
  ...(showPortal
    ? [{ to: '/base-conhecimento', icon: BookOpen, label: 'Consultar tutoriais', title: 'Base de conhecimento: consultar tutoriais publicados' }]
    : []),
];

const allMenuItems = () => [
  ...tiMenuItems, ...mktMenuItems, ...qualidadeMenuItems, ...rhMenuItems, ...financeiroMenuItems,
  ...crmMenuItems, ...expedicaoMenuItems, ...comercialMenuItems, ...educacionalMenuItems, ...diretoriaMenuItems, ...configMenuItems, ...inicioMenuItems(true),
];

/* Labels & breadcrumb helpers (kept exported for AppLayout compat) */
export const getCurrentPageLabel = (pathname: string): string => {
  const hit = allMenuItems().find(i => i.to === pathname);
  if (hit) return hit.label;
  if (pathname === '/inicio') return 'Início';
  if (pathname === '/nova-solicitacao') return 'Nova solicitação';
  if (pathname.startsWith('/helpdesk/')) return 'Detalhe do chamado';
  if (pathname.startsWith('/ti')) return 'TI';
  if (pathname.startsWith('/mkt')) return 'Marketing';
  if (pathname.startsWith('/qualidade')) return 'Qualidade';
  if (pathname.startsWith('/rh')) return 'RH';
  if (pathname.startsWith('/financeiro')) return 'Financeiro';
  if (pathname.startsWith('/crm')) return 'CRM';
  if (pathname.startsWith('/expedicao')) return 'Expedição';
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
  if (id === 'novo' || id === 'nova') return { parent, leaf: 'Novo registro' };
  // O identificador curto ajuda onde ele significa algo para quem lê (o número
  // do chamado). No quadro de um projeto não significa nada, e o nome do
  // projeto já está no título logo abaixo — aqui o id cru era só ruído.
  if (parent.to === '/projetos') return { parent, leaf: 'Quadro' };
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
    push('Expedição', '/expedicao/fila', expedicaoMenuItems);
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

interface AppSidebarProps {
  /** Em telas pequenas a sidebar vira gaveta sobreposta. */
  isDrawer?: boolean;
  drawerOpen?: boolean;
  onCloseDrawer?: () => void;
}

export function AppSidebar({ isDrawer = false, drawerOpen = false, onCloseDrawer }: AppSidebarProps) {
  const { profile, role, signOut } = useAuth();
  const modules = useVisibleModules();
  const location = useLocation();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: purchaseCounters } = usePurchaseCounters();
  const { data: chatNaoLidas } = useNaoLidas();
  const { can: canFin } = useDepartmentPermissions('financeiro');
  // Frente 6 (.scratch/plano-frente6-importacoes.md §3): o item
  // "Importações" segue uma regra DIFERENTE do resto de "Configurações" —
  // não é dono/admin (`showSettings`), é `vendas.importar` OU
  // `metas.definir`, a MESMA função que decide os cartões dentro da tela
  // (`src/lib/importacoes-acesso.ts`), para as duas portas nunca discordar.
  const { canComoOBanco: canComercial } = useDepartmentPermissions('comercial');
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
  // "Configurações" num lugar só (ADR-009): itens da empresa para dono/admin + a configuração de
  // cada módulo para quem tem o módulo. Quem pode ver o quê DENTRO da tela continua sendo do
  // perfil de acesso (`useDepartmentPermissions`) — filtrar aqui por gerente tiraria o menu de
  // quem tem permissão por perfil e não é gerente (auditoria de 2026-09-12).
  const moduleConfigItems: MenuItem[] = MODULE_CONFIG_ITEMS
    .filter(i => i.show(modules))
    .map(i => ({ to: i.to, icon: Settings, label: i.label, title: `Configurações de ${i.label}` }));
  const configItems: MenuItem[] = [
    ...(modules.showSettings ? configMenuItems.map(i => i.to === '/configuracoes/lyra' ? { ...i, label: `IA / ${assistantName}` } : i) : []),
    ...(podeVerImportacoes ? [{
      to: '/configuracoes/importacoes', icon: Upload, label: 'Importações',
      title: 'Importar vendas, clientes e metas — atualiza Comercial e Diretoria de um lugar só',
    }] : []),
    ...moduleConfigItems,
  ];
  const withoutConfig = (items: MenuItem[]) => items.filter(i => !i.to.endsWith('/configuracoes'));

  const groups: MenuGroup[] = [
    { id: 'inicio',    label: 'Início',       icon: Home,        items: inicioMenuItems(modules.showPortal), show: true,                   home: '/inicio' },
    { id: 'ti',        label: 'TI',           icon: Monitor,     items: withoutConfig(tiMenuItems),        show: modules.showTI,        home: '/ti/chamados' },
    { id: 'qualidade', label: 'Qualidade',    icon: ShieldCheck, items: withoutConfig(qualidadeMenuItems), show: modules.showQuality,   home: '/qualidade/chamados' },
    { id: 'rh',        label: 'RH',           icon: Users,       items: withoutConfig(rhMenuItems),        show: modules.showRH,        home: '/rh/chamados' },
    { id: 'mkt',       label: 'Marketing',    icon: Megaphone,   items: withoutConfig(mktMenuItems),       show: modules.showMarketing, home: '/mkt/chamados' },
    { id: 'financeiro', label: 'Financeiro',   icon: Banknote,    items: withoutConfig(financeiroMenuItems), show: modules.showFinanceiro, home: '/financeiro/contas-a-pagar' },
    { id: 'crm',       label: 'CRM',           icon: KanbanSquare,   items: withoutConfig(crmMenuItems),       show: modules.showCRM,       home: '/crm/funil' },
    { id: 'expedicao', label: 'Expedição',     icon: PackageCheck,   items: withoutConfig(expedicaoMenuItems), show: modules.showExpedicao, home: '/expedicao/fila' },
    { id: 'comercial', label: 'Comercial',     icon: Handshake,      items: withoutConfig(comercialMenuItems), show: modules.showComercial, home: '/comercial/chamados' },
    { id: 'educacional', label: 'Educacional', icon: GraduationCap, items: withoutConfig(educacionalMenuItems), show: modules.showEducacional, home: '/educacional/chamados' },
    { id: 'diretoria', label: 'Diretoria',   icon: Building2,     items: withoutConfig(diretoriaMenuItems), show: modules.showDiretoria, home: '/diretoria' },
    { id: 'config',    label: 'Configurações',icon: Settings,    items: configItems,        show: configItems.length > 0,  home: modules.showSettings ? '/configuracoes/sistema' : (configItems[0]?.to ?? '/inicio') },
  ];

  const activeGroupId = getActiveGroupId(location.pathname);

  /* Um grupo aberto por vez, persistido em localStorage */
  const [openGroup, setOpenGroup] = useState<string | null>(() => {
    try { return localStorage.getItem(OPEN_GROUP_KEY) || activeGroupId; } catch { return activeGroupId; }
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
  const visibleGroups = groups
    .filter(g => g.show)
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


  const [profileOpen, setProfileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [avatarSignedUrl, setAvatarSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!profile?.avatar_url) { setAvatarSignedUrl(null); return; }
    (async () => {
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(profile.avatar_url!, 3600);
      if (error) { console.error(error); if (!cancelled) setAvatarSignedUrl(null); return; }
      if (!cancelled) setAvatarSignedUrl(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [profile?.avatar_url]);

  const shortName = (() => {
    const full = (profile?.full_name || '').trim();
    if (!full) return profile?.email || '';
    const parts = full.split(/\s+/);
    if (parts.length === 1) return parts[0];
    return `${parts[0]} ${parts[parts.length - 1]}`;
  })();

  const initials = profile?.full_name
    ?.split(' ').map((n: string) => n[0]).slice(0, 2).join('').toUpperCase() || '?';

  const itemBadge = (to: string) => {
    if (to === '/chat') {
      // Decisão 7 (L11b): a bolinha do menu é o total de mensagens não
      // lidas — o mesmo dado de `chat_nao_lidas()`, sem sistema de aviso
      // novo. Zera sozinha quando a pessoa abre o canal (`useEntrarNoCanal`
      // grava `last_read_at`).
      return (chatNaoLidas ?? []).reduce((soma, n) => soma + n.qtd, 0);
    }
    if (to !== '/financeiro/compras') return 0;
    let count = 0;
    if (canFin('purchases', 'approve')) count += purchaseCounters?.pendingApproval ?? 0;
    if (canFin('purchases', 'execute')) count += purchaseCounters?.pendingExecution ?? 0;
    return count;
  };

  const isItemActive = (to: string) => {
    const p = stripTenantPrefix(location.pathname);
    const [caminho] = to.split('?');
    return p === caminho || p.startsWith(caminho + '/');
  };

  /**
   * Sub-item marcado: o caminho bate E a visão bate. As visões do Insights
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
    const resolver = caminho.startsWith('/diretoria') ? resolverVisaoDiretoria : resolverVisao;
    const doItem = resolver(new URLSearchParams(query ?? '').get('visao'));
    const daBarra = resolver(new URLSearchParams(location.search).get('visao'));
    return doItem === daBarra;
  };

  const go = (to: string) => {
    navigate(tenantPath(to));
    onCloseDrawer?.();
  };

  const aside = (
    <aside
      className={cn(
        'flex flex-col shrink-0 text-sidebar-foreground border-r border-sidebar-border transition-[width] duration-200',
        isDrawer ? 'fixed inset-y-0 left-0 z-50 h-full w-[264px] shadow-lg' : 'sticky top-0 h-screen',
        !isDrawer && (collapsed ? 'w-[64px]' : 'w-[248px]'),
      )}
      style={{ backgroundColor: 'hsl(var(--sidebar-background))' }}
    >
      {/* Logo */}
      <div
        className={cn('h-[56px] flex items-center gap-2 shrink-0', collapsed ? 'px-2 justify-center' : 'px-3')}
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
                    <span className="font-display font-extrabold text-[15px] text-sidebar-foreground tracking-tight truncate">
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
                    <span className="font-display font-extrabold text-[15px] text-sidebar-foreground tracking-tight truncate">
                      {hasOwnBrand ? tenantName : 'Helpoint'}
                    </span>
                    {!hasOwnBrand && (
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wider font-semibold">Gestão integrada</span>
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
      <div className={cn('shrink-0 pt-3 pb-1', collapsed ? 'px-2' : 'px-3')}>
        <button
          type="button"
          onClick={() => go('/nova-solicitacao')}
          title="Nova solicitação"
          aria-label="Nova solicitação"
          className={cn(
            'w-full h-9 flex items-center rounded-md bg-primary text-primary-foreground text-[12.5px] font-semibold hover:opacity-90 transition-opacity',
            collapsed ? 'justify-center' : 'justify-center gap-2',
          )}
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={2.4} aria-hidden="true" />
          {!collapsed && <span>Nova solicitação</span>}
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
        <div className="px-3 pt-2 pb-2 shrink-0">
          <div className="relative">
            <label htmlFor="sidebar-menu-search" className="sr-only">Encontrar um menu</label>
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" strokeWidth={2} aria-hidden="true" />
            <input
              id="sidebar-menu-search"
              type="search"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Encontrar um menu..."
              className="w-full h-9 pl-8 pr-3 rounded-md text-[12.5px] bg-secondary border border-border text-foreground placeholder:text-muted-foreground focus:bg-card focus:border-accent transition-colors"
            />
          </div>
          {isFiltering && visibleGroups.length === 0 && (
            <p className="mt-2 px-1 text-[11px] text-muted-foreground">Nenhum menu encontrado.</p>
          )}
        </div>
      )}

      {/* Groups */}
      <nav className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-2')} aria-label="Navegação principal">
        {visibleGroups.map(group => {
          const isActiveGroup = group.id === activeGroupId;
          const Icon = group.icon;

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
                  'w-full h-10 mb-1 flex items-center justify-center rounded-md transition-colors',
                  isActiveGroup ? 'bg-secondary text-primary' : 'text-muted-foreground hover:bg-muted hover:text-sidebar-foreground',
                )}
              >
                <Icon className="w-4 h-4" strokeWidth={isActiveGroup ? 2.2 : 1.8} aria-hidden="true" />
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
                  'w-full flex items-center gap-2.5 h-11 px-2.5 rounded-md transition-colors duration-150',
                  isActiveGroup ? 'text-sidebar-foreground bg-secondary' : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-muted'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" strokeWidth={isActiveGroup ? 2.2 : 1.8} style={isActiveGroup ? { color: 'hsl(var(--primary))' } : undefined} aria-hidden="true" />
                <span className={cn('flex-1 text-left text-[13px]', isActiveGroup ? 'font-semibold' : 'font-medium')}>{group.label}</span>
                <ChevronDown
                  className={cn('w-3.5 h-3.5 transition-transform duration-200', isOpen ? 'rotate-0' : '-rotate-90')}
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </button>
              {isOpen && (
                <ul id={panelId} className="mt-0.5 mb-1 ml-3 pl-3 space-y-0.5" style={{ borderLeft: '1px solid hsl(var(--sidebar-border))' }}>
                  {group.items.map(item => {
                    const isActive = isItemActive(item.to);
                    const SubIcon = item.icon;
                    return (
                      <li key={item.to}>
                        <NavLink
                          to={tenantPath(item.to)}
                          onClick={() => onCloseDrawer?.()}
                          title={item.title || item.label}
                          aria-label={item.title || item.label}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'relative flex items-center gap-2.5 min-h-[38px] px-2.5 rounded-md text-[12.5px] transition-colors duration-150',
                            isActive
                              ? 'text-primary font-semibold'
                              : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-muted'
                          )}
                          style={isActive ? { backgroundColor: 'hsl(var(--primary) / 0.08)' } : undefined}
                        >
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute -left-[13px] top-1 bottom-1 w-[3px] rounded-r"
                              style={{ backgroundColor: 'hsl(var(--primary))' }}
                            />
                          )}
                          <SubIcon className="w-3.5 h-3.5 shrink-0" strokeWidth={isActive ? 2.2 : 1.8} aria-hidden="true" />
                          <span className="truncate">{item.label}</span>
                          {itemBadge(item.to) > 0 && (
                            <span
                              className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center"
                              title={item.to === '/chat' ? 'Mensagens não lidas' : 'Compras pendentes da sua ação'}
                            >
                              {itemBadge(item.to)}
                            </span>
                          )}
                        </NavLink>

                        {/* Sub-itens: aparecem quando se está dentro do item
                            (dono, 2026-09-21 — as opções do Insights ficam no
                            menu, não num seletor no canto da tela). Comercial
                            e, desde a Frente 3, Diretoria usam isto. */}
                        {item.children && (isActive || isFiltering) && (
                          <ul className="mt-0.5 ml-3 pl-3 space-y-0.5" style={{ borderLeft: '1px solid hsl(var(--sidebar-border))' }}>
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
                                      'flex items-center gap-2 min-h-[32px] px-2 rounded-md text-[12px] transition-colors duration-150',
                                      filhoAtivo
                                        ? 'text-primary font-semibold'
                                        : 'text-muted-foreground hover:text-sidebar-foreground hover:bg-muted'
                                    )}
                                    style={filhoAtivo ? { backgroundColor: 'hsl(var(--primary) / 0.08)' } : undefined}
                                  >
                                    <FilhoIcon
                                      className="w-3 h-3 shrink-0"
                                      strokeWidth={filhoAtivo ? 2.4 : 1.8}
                                      aria-hidden="true"
                                    />
                                    <span className="truncate">{filho.label}</span>
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

      {/* Footer: user + menu */}
      {profile && (
        <Popover open={userMenuOpen} onOpenChange={setUserMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Menu da conta de ${shortName}`}
              title={shortName}
              className={cn(
                'w-full py-3 min-h-[44px] shrink-0 flex items-center gap-2.5 hover:bg-muted transition-colors text-left',
                collapsed ? 'px-2 justify-center' : 'px-3',
              )}
              style={{ borderTop: '1px solid hsl(var(--sidebar-border))' }}
            >
              <Avatar className="w-9 h-9 shrink-0">
                {avatarSignedUrl && <AvatarImage src={avatarSignedUrl} alt="" />}
                <AvatarFallback className="text-[11px] font-bold text-primary-foreground" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold truncate text-sidebar-foreground leading-tight">
                      {shortName}
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
                      {role && getRoleLabel(role)}
                      {profile.department && ` · ${profile.department}`}
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                </>
              )}
            </button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-60 p-1.5">
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); setProfileOpen(true); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-md text-[13px] hover:bg-secondary transition-colors text-left"
            >
              <UserCog className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <span>Meu perfil</span>
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); signOut(); }}
              className="w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-md text-[13px] text-destructive hover:bg-destructive/10 transition-colors text-left"
            >
              <LogOut className="w-4 h-4" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </PopoverContent>
        </Popover>
      )}
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
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
      <div
        className={cn(
          'transition-transform duration-200',
          drawerOpen ? 'translate-x-0' : '-translate-x-full pointer-events-none',
        )}
        role="dialog"
        aria-modal={drawerOpen}
        aria-label="Menu de navegação"
      >
        {aside}
      </div>
    </>
  );
}
