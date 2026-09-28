import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import EmConstrucao from '@/telas/EmConstrucao';
import { StaffRoute } from '@/components/auth/StaffRoute';
import { RequireOwnerOrAdmin } from '@/components/auth/RequireOwnerOrAdmin';
import { RequireDiretoria } from '@/components/auth/RequireDiretoria';
import { RequireComercial } from '@/components/auth/RequireComercial';
import Dashboard from '@/telas/Dashboard';
import { CollaboratorView } from '@/components/helpdesk/CollaboratorView';
import { TechnicianView } from '@/components/helpdesk/TechnicianView';
import { QualidadeSACList, QualidadeSACDetail } from '@/telas/qualidade/SACManagement';
import NotFound from '@/telas/NotFound';

const S = (el: React.ReactNode) => <StaffRoute>{el}</StaffRoute>;

/** Redireciona `…/comercial/x/:id` para `…/crm/x/:id` mantendo o id (endereços antigos de vendas, ADR-009). */
function RedirectWithParams({ to }: { to: string }) {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`../${to}/${id}`} replace />;
}

/**
 * Sub-app das rotas autenticadas, montado em `/*`. Desde a ADR-010 não há
 * mais montagem por tenant: `/t/:slug/*` é o endereço antigo — vira
 * `TenantSlugRedirect`, que tira o prefixo e entrega aqui mesmo, sem slug.
 */
// ── Uma tela, um pedaço (leva L, passo 4) ──────────────────────────────────
// Antes daqui eram 76 imports diretos, e o pacote saía com 4,1 MB num pedaço
// só: quem abria o Login baixava o RH, o Comercial e a Diretoria para ver um
// formulário. `lazy` faz cada tela virar um pedaço que chega quando alguém
// abre a rota dela. O que decide acesso continua direto — ver o script.
const TicketDetail = lazy(() => import('@/telas/TicketDetail'));
const Inventory = lazy(() => import('@/telas/Inventory'));
const NewRequest = lazy(() => import('@/telas/NewRequest'));
const Licenses = lazy(() => import('@/telas/Licenses'));
const Contracts = lazy(() => import('@/telas/Contracts'));
const Maintenances = lazy(() => import('@/telas/Maintenances'));
const TIConfiguracoes = lazy(() => import('@/telas/TIConfiguracoes'));
const POPs = lazy(() => import('@/telas/POPs'));
const TutorialEditor = lazy(() => import('@/telas/TutorialEditor'));
const Portal = lazy(() => import('@/telas/Portal'));
const TutorialViewer = lazy(() => import('@/telas/TutorialViewer'));
const SystemSettings = lazy(() => import('@/telas/SystemSettings'));
const LyraSettings = lazy(() => import('@/telas/LyraSettings'));
const ConfiguracoesImportacoes = lazy(() => import('@/telas/ConfiguracoesImportacoes'));
const MKTSocialCalendar = lazy(() => import('@/telas/MKTSocialCalendar'));
const ComprasFornecedores = lazy(() => import('@/telas/compras/Fornecedores'));
const MKTConfiguracoes = lazy(() => import('@/telas/MKTConfiguracoes'));
const MKTInventory = lazy(() => import('@/telas/MKTInventory'));
const TIRelatorios = lazy(() => import('@/telas/TIRelatorios'));
const Agenda = lazy(() => import('@/telas/Agenda'));
const Metas = lazy(() => import('@/telas/Metas'));
const Chat = lazy(() => import('@/telas/Chat'));
const Projetos = lazy(() => import('@/telas/Projetos'));
const ProjetoQuadro = lazy(() => import('@/telas/ProjetoQuadro'));
const QualidadeDashboard = lazy(() => import('@/telas/qualidade/QualidadeDashboard'));
const QualidadeSettings = lazy(() => import('@/telas/qualidade/QualidadeSettings'));
const TechnicalReport = lazy(() => import('@/telas/qualidade/TechnicalReport'));
const QualidadeChamados = lazy(() => import('@/telas/qualidade/QualidadeChamados'));
const MKTRelatorios = lazy(() => import('@/telas/MKTRelatorios'));
const RHRelatorios = lazy(() => import('@/telas/RHRelatorios'));
const RHConfiguracoes = lazy(() => import('@/telas/RHConfiguracoes'));
const MeuRH = lazy(() => import('@/telas/MeuRH'));
const RHColaboradores = lazy(() => import('@/telas/rh/RHColaboradores'));
const RHAprovacoes = lazy(() => import('@/telas/rh/RHAprovacoes'));
const RHHolerites = lazy(() => import('@/telas/rh/RHHolerites'));
const RHBeneficios = lazy(() => import('@/telas/rh/RHBeneficios'));
const RHDocumentos = lazy(() => import('@/telas/rh/RHDocumentos'));
const RHFolha = lazy(() => import('@/telas/rh/RHFolha'));
const RHFaltas = lazy(() => import('@/telas/rh/RHFaltas'));
const RHReembolsos = lazy(() => import('@/telas/rh/RHReembolsos'));
const FinPayables = lazy(() => import('@/telas/financeiro/FinPayables'));
const FinReceivables = lazy(() => import('@/telas/financeiro/FinReceivables'));
const FinCashFlow = lazy(() => import('@/telas/financeiro/FinCashFlow'));
const FinIndicators = lazy(() => import('@/telas/financeiro/FinIndicators'));
const FinSettings = lazy(() => import('@/telas/financeiro/FinSettings'));
const FinTickets = lazy(() => import('@/telas/financeiro/FinTickets'));
const ComprasCatalogo = lazy(() => import('@/telas/compras/Catalogo'));
const ComprasSolicitacoes = lazy(() => import('@/telas/compras/Solicitacoes'));
const ComprasIndicadores = lazy(() => import('@/telas/compras/Indicadores'));
const BrandingSettings = lazy(() => import('@/telas/BrandingSettings'));
const ComercialRelatorios = lazy(() => import('@/telas/crm/ComercialRelatorios'));
const CRMConfiguracoes = lazy(() => import('@/telas/crm/CRMConfiguracoes'));
const ComercialConfiguracoes = lazy(() => import('@/telas/comercial/ComercialConfiguracoes'));
const ComercialInsights = lazy(() => import('@/telas/comercial/ComercialInsights'));
const ComercialCadastroClientes = lazy(() => import('@/telas/comercial/ComercialCadastroClientes'));
const ComercialFunil = lazy(() => import('@/telas/crm/ComercialFunil'));
const ComercialNegocio = lazy(() => import('@/telas/crm/ComercialNegocio'));
const ComercialContatos = lazy(() => import('@/telas/crm/ComercialContatos'));
const ComercialProdutos = lazy(() => import('@/telas/crm/ComercialProdutos'));
const ComercialFormularios = lazy(() => import('@/telas/crm/ComercialFormularios'));
const ComercialPedidos = lazy(() => import('@/telas/crm/ComercialPedidos'));
const ComercialPedido = lazy(() => import('@/telas/crm/ComercialPedido'));
const ComercialImportar = lazy(() => import('@/telas/crm/ComercialImportar'));
const AutomacaoEditor = lazy(() => import('@/telas/AutomacaoEditor'));
const AutomacaoExecucoes = lazy(() => import('@/telas/AutomacaoExecucoes'));
const ExpedicaoFila = lazy(() => import('@/telas/expedicao/ExpedicaoFila'));
const ExpedicaoSeparacao = lazy(() => import('@/telas/expedicao/ExpedicaoSeparacao'));
const ExpedicaoEstoque = lazy(() => import('@/telas/expedicao/ExpedicaoEstoque'));
const ExpedicaoConfiguracoes = lazy(() => import('@/telas/expedicao/ExpedicaoConfiguracoes'));
const EducacionalRelatorios = lazy(() => import('@/telas/educacional/EducacionalRelatorios'));
const EducacionalTreinamentos = lazy(() => import('@/telas/educacional/EducacionalTreinamentos'));
const DiretoriaPainel = lazy(() => import('@/telas/diretoria/DiretoriaPainel'));
const EducacionalConfiguracoes = lazy(() => import('@/telas/educacional/EducacionalConfiguracoes'));

export function StaffAppRoutes() {
  return (
    /**
     * UMA fronteira de `Suspense` em volta de tudo (leva L, passo 4).
     *
     * Uma por rota daria um lugar melhor para a espera aparecer, e são 127 rotas:
     * a que faltasse derrubaria a tela com "A component suspended while responding
     * to synchronous input". Uma só não pode faltar.
     *
     * O `fallback` é um retângulo com a cor do fundo, e não "Carregando…": o pedaço
     * de uma tela chega em milissegundos na rede da empresa, e uma palavra que
     * pisca é pior que um espaço que não pisca.
     */
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
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
      {/* Frente 6 (.scratch/plano-frente6-importacoes.md §3): DIFERENTE das
          outras rotas de "Configurações" acima — não é `RequireOwnerOrAdmin`.
          Quem tem `vendas.importar` ou `metas.definir` entra mesmo sem ser
          dono/admin; a tela mostra os três cartões e só habilita o que a
          permissão da pessoa cobre (regra 2 das cinco, do lado da tela:
          nunca um botão que responde com erro depois do clique).
          `vendas.substituir` NÃO dá entrada, e é de propósito: substituir
          sem poder importar não passa na policy de INSERT de
          `com_vendas_importacoes` — o botão responderia com erro, que é
          exatamente o que esta regra existe para impedir. (O comentário
          anterior dizia que dava; dizia errado — achado da auditoria de
          2026-09-25.) */}
      <Route path="configuracoes/importacoes" element={S(<ConfiguracoesImportacoes />)} />
      <Route path="mkt" element={<Navigate to="chamados" replace />} />
      <Route path="mkt/chamados" element={S(<TechnicianView module="marketing" />)} />
      <Route path="mkt/social" element={S(<MKTSocialCalendar />)} />
      <Route path="mkt/inventario" element={S(<MKTInventory />)} />
      {/* O cadastro de fornecedor é UM (leva I): a mesma tela em dois
          endereços, porque quem procura fornecedor entra pelo módulo em que
          trabalha. Duas telas seriam a segunda divergência esperando.
          A tela mora em `telas/compras/` desde a leva N — é de lá que ela vem
          para os dois endereços, e continua sendo uma só. */}
      <Route path="mkt/fornecedores" element={S(<ComprasFornecedores />)} />
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
      {/* COMPRAS SAIU DO FINANCEIRO em 2026-09-27 (leva N, pedido do dono: o módulo
          estava "poluído demais por conta do setor de compras" — eram 4 das 10
          telas). Os quatro endereços antigos ficam como REDIRECIONAMENTO: ninguém
          usa o sistema ainda, mas link velho que devolve "página não existe" é o
          tipo de coisa que faz a pessoa achar que a função foi apagada. */}
      <Route path="financeiro/compras" element={<Navigate to="/compras" replace />} />
      <Route path="financeiro/produtos" element={<Navigate to="/compras/catalogo" replace />} />
      <Route path="financeiro/fornecedores" element={<Navigate to="/compras/fornecedores" replace />} />
      <Route path="financeiro/compras/indicadores" element={<Navigate to="/compras/indicadores" replace />} />
      <Route path="financeiro/contas-a-pagar" element={S(<FinPayables />)} />
      <Route path="financeiro/contas-a-receber" element={S(<FinReceivables />)} />
      <Route path="financeiro/fluxo-de-caixa" element={S(<FinCashFlow />)} />
      <Route path="financeiro/indicadores" element={S(<FinIndicators />)} />
      <Route path="financeiro/configuracoes" element={S(<FinSettings />)} />
      {/* Compras, módulo próprio (leva N). Sem rota de chamados, por decisão do
          dono: a solicitação de compra JÁ é o pedido, e uma segunda caixa de entrada
          seria dois lugares para olhar a mesma coisa. */}
      <Route path="compras" element={S(<ComprasSolicitacoes />)} />
      {/* O chamado da compra (2026-09-28): `compras_solicitacoes.ticket_id` é NOT
          NULL — toda compra tem um chamado por baixo, que é onde ficam a conversa, os
          anexos e o prazo. Ele era do módulo `financeiro` e lido em
          `/financeiro/chamados/:id`; agora é de Compras, e `ticketDetailPath('compras',
          id)` aponta para cá. Não é uma "fila de chamados de Compras" — é a mesma
          tela de detalhe, no endereço do módulo a que o chamado pertence. */}
      <Route path="compras/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="compras/catalogo" element={S(<ComprasCatalogo />)} />
      <Route path="compras/fornecedores" element={S(<ComprasFornecedores />)} />
      <Route path="compras/indicadores" element={S(<ComprasIndicadores />)} />
      {/* CRM — EM CONSTRUÇÃO desde 2026-09-21 (decisão do dono).
          Todo endereço `/crm/*` cai numa tela que diz isso, em vez de numa tela
          pela metade ou num "não encontrado" que pareceria defeito. As telas, as
          tabelas, os fluxos e as provas do CRM continuam de pé — voltar é
          restaurar estas linhas e o `showCRM` de `useVisibleModules`. */}
      <Route path="crm/*" element={S(
        <EmConstrucao
          modulo="CRM"
          motivo="O CRM está fora do ar enquanto o Comercial é retrabalhado em cima do painel de vendas. Nada do que foi cadastrado se perdeu."
        />,
      )} />
      <Route path="automacoes/:id" element={S(<AutomacaoEditor />)} />
      <Route path="automacoes/:id/execucoes" element={S(<AutomacaoExecucoes />)} />
      {/* Expedição (EXP-1): domínio próprio, sem fila de chamados. */}
      <Route path="expedicao" element={<Navigate to="fila" replace />} />
      <Route path="expedicao/fila" element={S(<ExpedicaoFila />)} />
      <Route path="expedicao/separar/:id" element={S(<ExpedicaoSeparacao />)} />
      <Route path="expedicao/estoque" element={S(<ExpedicaoEstoque />)} />
      <Route path="expedicao/configuracoes" element={S(<ExpedicaoConfiguracoes />)} />
      <Route path="comercial" element={<Navigate to="chamados" replace />} />
      <Route path="comercial/funil" element={<Navigate to="../crm/funil" replace />} />
      <Route path="comercial/negocios/:id" element={<RedirectWithParams to="crm/negocios" />} />
      <Route path="comercial/contatos" element={<Navigate to="../crm/contatos" replace />} />
      <Route path="comercial/importar" element={<Navigate to="../crm/importar" replace />} />
      <Route path="comercial/produtos" element={<Navigate to="../crm/produtos" replace />} />
      <Route path="comercial/pedidos" element={<Navigate to="../crm/pedidos" replace />} />
      <Route path="comercial/pedidos/:id" element={<RedirectWithParams to="crm/pedidos" />} />
      {/* Insights: uma porta para as duas visões (Vendas e Atendimento), a
          escolha em `?visao=`. Os dois endereços antigos continuam existindo
          e levam à visão certa — link salvo no navegador não pode virar
          "não encontrado" (pedido do dono, 2026-09-21). */}
      {/* `RequireComercial` entrou na leva B (2026-09-25): estas duas eram as
          telas de módulo sem guarda nenhuma, e quem não tem o Comercial chegava
          nelas pela URL para ler a página inteira zerada — a RLS devolve zero
          linha sem erro, então a pessoa concluiria que a empresa não vendeu nada.
          Os dois redirecionamentos abaixo não levam guarda: eles só apontam para
          `comercial/insights`, que já é guardado — guardar duas vezes o mesmo
          caminho é o tipo de repetição que uma das cópias perde depois. */}
      <Route path="comercial/insights" element={S(<RequireComercial><ComercialInsights /></RequireComercial>)} />
      <Route path="comercial/painel" element={<Navigate to="/comercial/insights?visao=vendas" replace />} />
      <Route path="comercial/indicadores" element={<Navigate to="/comercial/insights?visao=atendimento" replace />} />
      <Route path="comercial/chamados" element={S(<TechnicianView module="comercial" />)} />
      <Route path="comercial/chamados/:id" element={S(<TicketDetail />)} />
      {/* Cadastro de clientes: tela própria desde 2026-09-28 — era aba do Insights,
          e o dono apontou que cadastro não é medição. Mesmo guarda do Insights. */}
      <Route path="comercial/clientes" element={S(<RequireComercial><ComercialCadastroClientes /></RequireComercial>)} />
      <Route path="comercial/configuracoes" element={S(<RequireComercial><ComercialConfiguracoes /></RequireComercial>)} />
      <Route path="educacional" element={<Navigate to="chamados" replace />} />
      <Route path="educacional/chamados" element={S(<TechnicianView module="educacional" />)} />
      <Route path="educacional/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="educacional/treinamentos" element={S(<EducacionalTreinamentos />)} />
      <Route path="diretoria" element={S(<RequireDiretoria><DiretoriaPainel /></RequireDiretoria>)} />
      <Route path="educacional/indicadores" element={S(<EducacionalRelatorios />)} />
      <Route path="educacional/configuracoes" element={S(<EducacionalConfiguracoes />)} />
      <Route path="meu-rh" element={S(<MeuRH />)} />
      <Route path="nova-solicitacao" element={S(<NewRequest />)} />
      <Route path="agenda" element={S(<Agenda />)} />
      <Route path="metas" element={S(<Metas />)} />
      <Route path="projetos" element={S(<Projetos />)} />
      <Route path="projetos/:id" element={S(<ProjetoQuadro />)} />
      <Route path="chat" element={S(<Chat />)} />
      <Route path="chat/:id" element={S(<Chat />)} />
      {/* O painel da Lyra manda "Projeto" para ca desde antes de Projetos existir. */}
      <Route path="kanban" element={<Navigate to="../projetos" replace />} />
      <Route path="base-conhecimento" element={S(<Portal />)} />
      <Route path="base-conhecimento/:id" element={S(<TutorialViewer />)} />
      <Route path="portal" element={<Navigate to="../base-conhecimento" replace />} />
      <Route path="portal/:id" element={S(<TutorialViewer />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </Suspense>
  );
}
