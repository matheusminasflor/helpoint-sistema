import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { StaffRoute } from '@/components/auth/StaffRoute';
import { RequireOwnerOrAdmin } from '@/components/auth/RequireOwnerOrAdmin';
import Dashboard from '@/pages/Dashboard';
import { CollaboratorView } from '@/components/helpdesk/CollaboratorView';
import { TechnicianView } from '@/components/helpdesk/TechnicianView';
import TicketDetail from '@/pages/TicketDetail';
import Inventory from '@/pages/Inventory';
import NewRequest from '@/pages/NewRequest';
import Licenses from '@/pages/Licenses';
import Contracts from '@/pages/Contracts';
import Maintenances from '@/pages/Maintenances';
import TIConfiguracoes from '@/pages/TIConfiguracoes';
import POPs from '@/pages/POPs';
import TutorialEditor from '@/pages/TutorialEditor';
import Portal from '@/pages/Portal';
import TutorialViewer from '@/pages/TutorialViewer';
import SystemSettings from '@/pages/SystemSettings';
import LyraSettings from '@/pages/LyraSettings';
import MKTSocialCalendar from '@/pages/MKTSocialCalendar';
import MKTSuppliers from '@/pages/MKTSuppliers';
import MKTConfiguracoes from '@/pages/MKTConfiguracoes';
import MKTInventory from '@/pages/MKTInventory';
import TIRelatorios from '@/pages/TIRelatorios';
import Agenda from '@/pages/Agenda';
import { QualidadeSACList, QualidadeSACDetail } from '@/pages/qualidade/SACManagement';
import QualidadeDashboard from '@/pages/qualidade/QualidadeDashboard';
import QualidadeSettings from '@/pages/qualidade/QualidadeSettings';
import TechnicalReport from '@/pages/qualidade/TechnicalReport';
import QualidadeChamados from '@/pages/qualidade/QualidadeChamados';
import MKTRelatorios from '@/pages/MKTRelatorios';
import RHRelatorios from '@/pages/RHRelatorios';
import RHConfiguracoes from '@/pages/RHConfiguracoes';
import MeuRH from '@/pages/MeuRH';
import RHColaboradores from '@/pages/rh/RHColaboradores';
import RHAprovacoes from '@/pages/rh/RHAprovacoes';
import RHHolerites from '@/pages/rh/RHHolerites';
import RHBeneficios from '@/pages/rh/RHBeneficios';
import RHDocumentos from '@/pages/rh/RHDocumentos';
import RHFolha from '@/pages/rh/RHFolha';
import RHFaltas from '@/pages/rh/RHFaltas';
import RHReembolsos from '@/pages/rh/RHReembolsos';
import FinPayables from '@/pages/financeiro/FinPayables';
import FinReceivables from '@/pages/financeiro/FinReceivables';
import FinCashFlow from '@/pages/financeiro/FinCashFlow';
import FinIndicators from '@/pages/financeiro/FinIndicators';
import FinSettings from '@/pages/financeiro/FinSettings';
import FinTickets from '@/pages/financeiro/FinTickets';
import FinProducts from '@/pages/financeiro/FinProducts';
import FinPurchaseRequests from '@/pages/financeiro/FinPurchaseRequests';
import FinPurchaseIndicators from '@/pages/financeiro/FinPurchaseIndicators';
import BrandingSettings from '@/pages/BrandingSettings';
import ComercialRelatorios from '@/pages/crm/ComercialRelatorios';
import CRMConfiguracoes from '@/pages/crm/CRMConfiguracoes';
import ComercialConfiguracoes from '@/pages/comercial/ComercialConfiguracoes';
import ComercialChamadosRelatorios from '@/pages/comercial/ComercialChamadosRelatorios';
import ComercialFunil from '@/pages/crm/ComercialFunil';
import ComercialNegocio from '@/pages/crm/ComercialNegocio';
import ComercialContatos from '@/pages/crm/ComercialContatos';
import ComercialProdutos from '@/pages/crm/ComercialProdutos';
import ComercialPedidos from '@/pages/crm/ComercialPedidos';
import ComercialPedido from '@/pages/crm/ComercialPedido';
import ComercialImportar from '@/pages/crm/ComercialImportar';
import AutomacaoEditor from '@/pages/AutomacaoEditor';
import AutomacaoExecucoes from '@/pages/AutomacaoExecucoes';
import EducacionalRelatorios from '@/pages/educacional/EducacionalRelatorios';
import EducacionalConfiguracoes from '@/pages/educacional/EducacionalConfiguracoes';
import NotFound from '@/pages/NotFound';

const S = (el: React.ReactNode) => <StaffRoute>{el}</StaffRoute>;

/** Redireciona `…/comercial/x/:id` para `…/crm/x/:id` mantendo o id (endereços antigos de vendas, ADR-009). */
function RedirectWithParams({ to }: { to: string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`../${to}/${id}`} replace />;
}

/**
 * Sub-app das rotas autenticadas. Reaproveitado em duas montagens:
 *   - `/*`              (rotas legadas)
 *   - `/t/:slug/*`      (URLs por tenant)
 */
export function StaffAppRoutes() {
  return (
    <Routes>
      <Route path="inicio" element={S(<Dashboard />)} />
      <Route path="helpdesk" element={S(<CollaboratorView />)} />
      <Route path="helpdesk/:id" element={S(<TicketDetail />)} />
      <Route path="ti" element={<Navigate to="chamados" replace />} />
      <Route path="ti/chamados" element={S(<TechnicianView module="tickets" />)} />
      <Route path="ti/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="ti/licencas" element={S(<Licenses />)} />
      <Route path="ti/contratos" element={S(<Contracts />)} />
      <Route path="ti/manutencoes" element={S(<Maintenances />)} />
      <Route path="ti/indicadores" element={S(<TIRelatorios />)} />
      <Route path="ti/configuracoes" element={S(<TIConfiguracoes />)} />
      <Route path="ti/pops" element={S(<POPs />)} />
      <Route path="ti/pops/novo" element={S(<TutorialEditor />)} />
      <Route path="ti/pops/:id/editar" element={S(<TutorialEditor />)} />
      <Route path="inventario" element={S(<Inventory />)} />
      {/* O grupo "Configurações" é de dono/admin (showSettings). O sidebar já o
          esconde; a tranca abaixo é o que impede a URL de abrir mesmo assim. */}
      <Route path="configuracoes/sistema" element={S(<RequireOwnerOrAdmin><SystemSettings /></RequireOwnerOrAdmin>)} />
      <Route path="configuracoes/identidade-visual" element={S(<RequireOwnerOrAdmin><BrandingSettings /></RequireOwnerOrAdmin>)} />
      <Route path="configuracoes/lyra" element={S(<RequireOwnerOrAdmin><LyraSettings /></RequireOwnerOrAdmin>)} />
      <Route path="mkt" element={<Navigate to="chamados" replace />} />
      <Route path="mkt/chamados" element={S(<TechnicianView module="marketing" />)} />
      <Route path="mkt/social" element={S(<MKTSocialCalendar />)} />
      <Route path="mkt/inventario" element={S(<MKTInventory />)} />
      <Route path="mkt/fornecedores" element={S(<MKTSuppliers />)} />
      <Route path="mkt/indicadores" element={S(<MKTRelatorios />)} />
      <Route path="mkt/configuracoes" element={S(<MKTConfiguracoes />)} />
      <Route path="qualidade" element={<Navigate to="chamados" replace />} />
      <Route path="qualidade/sacs" element={S(<QualidadeSACList />)} />
      <Route path="qualidade/sacs/:id" element={S(<QualidadeSACDetail />)} />
      <Route path="qualidade/sacs/:id/laudo" element={S(<TechnicalReport />)} />
      <Route path="qualidade/dashboard" element={S(<QualidadeDashboard />)} />
      <Route path="qualidade/chamados" element={S(<QualidadeChamados />)} />
      <Route path="qualidade/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="qualidade/configuracoes" element={S(<QualidadeSettings />)} />
      <Route path="rh" element={<Navigate to="chamados" replace />} />
      <Route path="rh/chamados" element={S(<TechnicianView module="rh" />)} />
      <Route path="rh/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="rh/indicadores" element={S(<RHRelatorios />)} />
      <Route path="rh/colaboradores" element={S(<RHColaboradores />)} />
      <Route path="rh/aprovacoes" element={S(<RHAprovacoes />)} />
      <Route path="rh/holerites" element={S(<RHHolerites />)} />
      <Route path="rh/beneficios" element={S(<RHBeneficios />)} />
      <Route path="rh/folha" element={S(<RHFolha />)} />
      <Route path="rh/faltas" element={S(<RHFaltas />)} />
      <Route path="rh/reembolsos" element={S(<RHReembolsos />)} />
      <Route path="rh/documentos" element={S(<RHDocumentos />)} />
      <Route path="rh/configuracoes" element={S(<RHConfiguracoes />)} />
      <Route path="financeiro" element={<Navigate to="contas-a-pagar" replace />} />
      <Route path="financeiro/chamados" element={S(<FinTickets />)} />
      <Route path="financeiro/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="financeiro/compras" element={S(<FinPurchaseRequests />)} />
      <Route path="financeiro/produtos" element={S(<FinProducts />)} />
      <Route path="financeiro/compras/indicadores" element={S(<FinPurchaseIndicators />)} />
      <Route path="financeiro/contas-a-pagar" element={S(<FinPayables />)} />
      <Route path="financeiro/contas-a-receber" element={S(<FinReceivables />)} />
      <Route path="financeiro/fluxo-de-caixa" element={S(<FinCashFlow />)} />
      <Route path="financeiro/indicadores" element={S(<FinIndicators />)} />
      <Route path="financeiro/configuracoes" element={S(<FinSettings />)} />
      {/* CRM — módulo próprio (ADR-009). Os endereços antigos `/comercial/…` de vendas redirecionam. */}
      <Route path="crm" element={<Navigate to="funil" replace />} />
      <Route path="crm/funil" element={S(<ComercialFunil />)} />
      <Route path="crm/negocios/:id" element={S(<ComercialNegocio />)} />
      <Route path="crm/contatos" element={S(<ComercialContatos />)} />
      <Route path="crm/importar" element={S(<ComercialImportar />)} />
      <Route path="crm/produtos" element={S(<ComercialProdutos />)} />
      <Route path="crm/pedidos" element={S(<ComercialPedidos />)} />
      <Route path="crm/pedidos/:id" element={S(<ComercialPedido />)} />
      <Route path="crm/indicadores" element={S(<ComercialRelatorios />)} />
      <Route path="crm/configuracoes" element={S(<CRMConfiguracoes />)} />
      <Route path="automacoes/:id" element={S(<AutomacaoEditor />)} />
      <Route path="automacoes/:id/execucoes" element={S(<AutomacaoExecucoes />)} />
      <Route path="comercial" element={<Navigate to="chamados" replace />} />
      <Route path="comercial/funil" element={<Navigate to="../crm/funil" replace />} />
      <Route path="comercial/negocios/:id" element={<RedirectWithParams to="crm/negocios" />} />
      <Route path="comercial/contatos" element={<Navigate to="../crm/contatos" replace />} />
      <Route path="comercial/importar" element={<Navigate to="../crm/importar" replace />} />
      <Route path="comercial/produtos" element={<Navigate to="../crm/produtos" replace />} />
      <Route path="comercial/pedidos" element={<Navigate to="../crm/pedidos" replace />} />
      <Route path="comercial/pedidos/:id" element={<RedirectWithParams to="crm/pedidos" />} />
      <Route path="comercial/chamados" element={S(<TechnicianView module="comercial" />)} />
      <Route path="comercial/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="comercial/indicadores" element={S(<ComercialChamadosRelatorios />)} />
      <Route path="comercial/configuracoes" element={S(<ComercialConfiguracoes />)} />
      <Route path="educacional" element={<Navigate to="chamados" replace />} />
      <Route path="educacional/chamados" element={S(<TechnicianView module="educacional" />)} />
      <Route path="educacional/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="educacional/indicadores" element={S(<EducacionalRelatorios />)} />
      <Route path="educacional/configuracoes" element={S(<EducacionalConfiguracoes />)} />
      <Route path="meu-rh" element={S(<MeuRH />)} />
      <Route path="nova-solicitacao" element={S(<NewRequest />)} />
      <Route path="agenda" element={S(<Agenda />)} />
      <Route path="base-conhecimento" element={S(<Portal />)} />
      <Route path="base-conhecimento/:id" element={S(<TutorialViewer />)} />
      <Route path="portal" element={<Navigate to="../base-conhecimento" replace />} />
      <Route path="portal/:id" element={S(<TutorialViewer />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
