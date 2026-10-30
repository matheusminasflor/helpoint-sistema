import { TelaDeAnalise } from '@/components/comercial/TelaDeAnalise';
import { Suspense, lazy, type ReactNode } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import EmConstrucao from '@/telas/EmConstrucao';
import { RequireCadastrarClientes } from '@/components/auth/RequireCadastrarClientes';
import { StaffRoute } from '@/components/auth/StaffRoute';
import { estaPausada } from '@/config/telas-pausadas';
import { useMeuRHLigado } from '@/hooks/useMeuRHLigado';
import { RequireOwnerOrAdmin } from '@/components/auth/RequireOwnerOrAdmin';
import { GuardaDoSetor } from '@/components/auth/GuardaDoSetor';
import { RequireDiretoria } from '@/components/auth/RequireDiretoria';
import { RequireComercial } from '@/components/auth/RequireComercial';
import { RequireConfigDoSetor } from '@/components/auth/RequireConfigDoSetor';
import Dashboard from '@/telas/Dashboard';
import { CollaboratorView } from '@/components/helpdesk/CollaboratorView';
import { TechnicianView } from '@/components/helpdesk/TechnicianView';
import { QualidadeSACList, QualidadeSACDetail } from '@/telas/qualidade/SACManagement';
import NotFound from '@/telas/NotFound';

const S = (el: React.ReactNode) => <StaffRoute>{el}</StaffRoute>;

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
const TermosDeResponsabilidade = lazy(() => import('@/telas/TermosDeResponsabilidade'));
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
const MKTEstoque = lazy(() => import('@/telas/MKTEstoque'));
const MKTBeneficioDeSexta = lazy(() => import('@/telas/MKTBeneficioDeSexta'));
const TIRelatorios = lazy(() => import('@/telas/TIRelatorios'));
const Agenda = lazy(() => import('@/telas/Agenda'));
const Rotinas = lazy(() => import('@/telas/Rotinas'));
const Metas = lazy(() => import('@/telas/Metas'));
const Chat = lazy(() => import('@/telas/Chat'));
const TodosOsAvisos = lazy(() => import('@/telas/TodosOsAvisos'));
const Pedidos = lazy(() => import('@/telas/solicitacoes/Pedidos'));
const MeusPedidosEChamados = lazy(() => import('@/telas/MeusPedidosEChamados'));
const DetalheDaSolicitacao = lazy(() => import('@/telas/solicitacoes/DetalheDaSolicitacao'));
const SolicitacoesDoSetor = lazy(() => import('@/telas/solicitacoes/SolicitacoesDoSetor'));
const DistribuidoresDaTI = lazy(() => import('@/telas/ti/Distribuidores'));
// Os relatórios novos (etapa 5): um modelo só (components/relatorios/ModeloDeRelatorio), uma tela cada.
const RelCicloDaCompra = lazy(() => import('@/telas/relatorios/CicloDaCompra'));
const RelEconomiaNaCotacao = lazy(() => import('@/telas/relatorios/EconomiaNaCotacao'));
const RelGastoPorFornecedor = lazy(() => import('@/telas/relatorios/GastoPorFornecedor'));
const MeusTreinamentos = lazy(() => import('@/telas/MeusTreinamentos'));
const RelReembolsos = lazy(() => import('@/telas/relatorios/ReembolsosEAdiantamentos'));
const RelConsumoDoEstoque = lazy(() => import('@/telas/relatorios/ConsumoDoEstoque'));
const RelPrevisaoDeCaixa = lazy(() => import('@/telas/relatorios/PrevisaoDeCaixa'));
const RelVendaPorFamilia = lazy(() => import('@/telas/relatorios/VendaPorFamilia'));
const RelRetornosDaEquipe = lazy(() => import('@/telas/relatorios/RetornosDaEquipe'));
const RelCalendarioDeAusencias = lazy(() => import('@/telas/relatorios/CalendarioDeAusencias'));
const RelCienciaDasDiretrizes = lazy(() => import('@/telas/relatorios/CienciaDasDiretrizes'));
const RelReclamacoesPorProduto = lazy(() => import('@/telas/relatorios/ReclamacoesPorProduto'));
const Projetos = lazy(() => import('@/telas/Projetos'));
const NovoProjeto = lazy(() => import('@/telas/projetos/NovoProjeto'));
const ProjetoDetalhe = lazy(() => import('@/telas/projetos/ProjetoDetalhe'));
const MinhasAtividades = lazy(() => import('@/telas/projetos/MinhasAtividades'));
const QualidadeDashboard = lazy(() => import('@/telas/qualidade/QualidadeDashboard'));
const QualidadeRelatorios = lazy(() => import('@/telas/qualidade/QualidadeRelatorios'));
const QualidadeSettings = lazy(() => import('@/telas/qualidade/QualidadeSettings'));
const TechnicalReport = lazy(() => import('@/telas/qualidade/TechnicalReport'));
const QualidadeChamados = lazy(() => import('@/telas/qualidade/QualidadeChamados'));
const MKTRelatorios = lazy(() => import('@/telas/MKTRelatorios'));
const RHRelatorios = lazy(() => import('@/telas/RHRelatorios'));
const RHConfiguracoes = lazy(() => import('@/telas/RHConfiguracoes'));
const MeuRH = lazy(() => import('@/telas/MeuRH'));
const RepassarFerias = lazy(() => import('@/telas/RepassarFerias'));
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
const FinConferenciaPedidos = lazy(() => import('@/telas/financeiro/FinConferenciaPedidos'));
const FinCaixinha = lazy(() => import('@/telas/financeiro/FinCaixinha'));
const FinRelatorioCompras = lazy(() => import('@/telas/financeiro/FinRelatorioCompras'));
const ComprasCatalogo = lazy(() => import('@/telas/compras/Catalogo'));
const ComprasEstoque = lazy(() => import('@/telas/compras/Estoque'));
const ComprasSolicitacoes = lazy(() => import('@/telas/compras/Solicitacoes'));
const ComprasIndicadores = lazy(() => import('@/telas/compras/Indicadores'));
const ComprasAprovar = lazy(() => import('@/telas/compras/AprovarCompras'));
const ComprasConfiguracoes = lazy(() => import('@/telas/compras/ComprasConfiguracoes'));
const ConfiguracoesDosSetores = lazy(() => import('@/telas/ConfiguracoesDosSetores'));
const BrandingSettings = lazy(() => import('@/telas/BrandingSettings'));
const ComercialRelatorios = lazy(() => import('@/telas/crm/ComercialRelatorios'));
const CRMConfiguracoes = lazy(() => import('@/telas/crm/CRMConfiguracoes'));
const ComercialConfiguracoes = lazy(() => import('@/telas/comercial/ComercialConfiguracoes'));
const ComercialInsights = lazy(() => import('@/telas/comercial/ComercialInsights'));
const ConfiguracoesClientes = lazy(() => import('@/telas/ConfiguracoesClientes'));
const ComercialPainel = lazy(() => import('@/telas/comercial/ComercialPainel').then((m) => ({ default: m.ComercialPainel })));
const DistribuidoresDoComercial = lazy(() => import('@/telas/comercial/Distribuidores').then((m) => ({ default: m.DistribuidoresDoComercial })));
const FichaDoDistribuidor = lazy(() => import('@/telas/comercial/Distribuidores').then((m) => ({ default: m.FichaDoDistribuidor })));
const ComercialClientes = lazy(() => import('@/telas/comercial/ComercialClientes'));
const ComercialBonificacao = lazy(() => import('@/telas/comercial/ComercialBonificacao'));
const ComercialCashback = lazy(() => import('@/telas/comercial/ComercialCashback'));
const ComercialDiretrizes = lazy(() => import('@/telas/comercial/ComercialDiretrizes'));
const ComercialChamadosRelatorios = lazy(() => import('@/telas/comercial/ComercialChamadosRelatorios'));
const ComercialLancamentos = lazy(() => import('@/telas/comercial/ComercialLancamentos'));
const ComercialPedidosEnviados = lazy(() => import('@/telas/comercial/ComercialPedidosEnviados'));
const ComercialIndicadores = lazy(() => import('@/telas/comercial/ComercialIndicadores'));
const ComercialCarteiras = lazy(() => import('@/telas/comercial/ComercialCarteiras'));
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
const ExpedicaoRelatorios = lazy(() => import('@/telas/expedicao/ExpedicaoRelatorios'));
const ExpedicaoConfiguracoes = lazy(() => import('@/telas/expedicao/ExpedicaoConfiguracoes'));
const ProducaoRelatorios = lazy(() => import('@/telas/producao/ProducaoRelatorios'));
const ProducaoConfiguracoes = lazy(() => import('@/telas/producao/ProducaoConfiguracoes'));
const EducacionalRelatorios = lazy(() => import('@/telas/educacional/EducacionalRelatorios'));
const EducacionalTreinamentos = lazy(() => import('@/telas/educacional/EducacionalTreinamentos'));
const DiretoriaPainel = lazy(() => import('@/telas/diretoria/DiretoriaPainel'));
const EducacionalConfiguracoes = lazy(() => import('@/telas/educacional/EducacionalConfiguracoes'));
const ConsultaDeDiretrizes = lazy(() => import('@/telas/diretrizes/ConsultaDeDiretrizes'));
const Jornal = lazy(() => import('@/telas/Jornal'));
const NoticiaAberta = lazy(() => import('@/telas/NoticiaAberta'));

/** O Meu RH e as Solicitações do RH abrem só com o interruptor ligado (Configurações do RH, 20270205010000). */
function SeMeuRHLigado({ children }: { children: ReactNode }) {
  const { data: ligado, isLoading } = useMeuRHLigado();
  if (isLoading) return null;
  return ligado ? <>{children}</> : <Navigate to="/inicio" replace />;
}

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
    <GuardaDoSetor>
    <Routes>
      <Route path="inicio" element={S(<Dashboard />)} />
      <Route path="helpdesk" element={S(<CollaboratorView />)} />
      <Route path="helpdesk/:id" element={S(<TicketDetail />)} />
      <Route path="ti" element={<Navigate to="chamados" replace />} />
      <Route path="ti/chamados" element={S(<TechnicianView module="tickets" />)} />
      <Route path="ti/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="ti/licencas" element={S(<Licenses />)} />
      <Route path="ti/contratos" element={S(<Contracts />)} />
      <Route path="ti/termos" element={S(<TermosDeResponsabilidade />)} />
      <Route path="ti/manutencoes" element={S(<Maintenances />)} />
      <Route path="ti/indicadores" element={S(<TIRelatorios />)} />
      <Route path="ti/configuracoes" element={S(<RequireConfigDoSetor><TIConfiguracoes /></RequireConfigDoSetor>)} />
      <Route path="ti/pops" element={S(<POPs />)} />
      <Route path="ti/pops/novo" element={S(<TutorialEditor />)} />
      <Route path="ti/pops/:id/editar" element={S(<TutorialEditor />)} />
      {/* A Qualidade também escreve tutorial (permissão "POPs" do perfil dela, que o banco já obedece): a mesma tela. */}
      <Route path="qualidade/tutoriais" element={S(<POPs />)} />
      <Route path="qualidade/tutoriais/novo" element={S(<TutorialEditor />)} />
      <Route path="qualidade/tutoriais/:id/editar" element={S(<TutorialEditor />)} />
      <Route path="inventario" element={S(<Inventory />)} />
      {/* O grupo "Configurações" é de dono/admin (showSettings). O sidebar já o
          esconde; a tranca abaixo é o que impede a URL de abrir mesmo assim. */}
      <Route path="configuracoes/sistema" element={S(<RequireOwnerOrAdmin><SystemSettings /></RequireOwnerOrAdmin>)} />
      <Route path="configuracoes/identidade-visual" element={S(<RequireOwnerOrAdmin><BrandingSettings /></RequireOwnerOrAdmin>)} />
      <Route path="configuracoes/lyra" element={S(<RequireOwnerOrAdmin><LyraSettings /></RequireOwnerOrAdmin>)} />
      {/* LEVA P (2026-09-29): uma grade dos setores, como a de Nova solicitação. Sem tranca própria:
          cada cartão diz se a pessoa entra, e cada rota de setor tem `RequireConfigDoSetor`. */}
      <Route path="configuracoes/setores" element={S(<ConfiguracoesDosSetores />)} />
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
      {/* O único lugar onde se cria cliente (2026-10-01): quem tem `clientes.cadastrar`. */}
      {/* Cadastro de clientes: só em Configurações, só dono e administradores (dono, 2026-10-15). */}
      <Route path="configuracoes/clientes" element={S(<RequireCadastrarClientes><ConfiguracoesClientes /></RequireCadastrarClientes>)} />
      <Route path="mkt" element={<Navigate to="chamados" replace />} />
      <Route path="mkt/chamados" element={S(<TechnicianView module="marketing" />)} />
      {/* Faltava (achado do dono, 2026-10-01): o "Abrir" da fila do Marketing ia para cá e caía
          em "página não existe". `ticket-route.test.ts` confere todo módulo contra este mapa. */}
      <Route path="mkt/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="mkt/social" element={S(<MKTSocialCalendar />)} />
      <Route path="mkt/estoque" element={S(<MKTEstoque />)} />
      <Route path="mkt/beneficio" element={S(<MKTBeneficioDeSexta />)} />
      <Route path="mkt/inventario" element={<Navigate to="../estoque" relative="path" replace />} />
      {/* O cadastro de fornecedor é UM (leva I): a mesma tela em dois
          endereços, porque quem procura fornecedor entra pelo módulo em que
          trabalha. Duas telas seriam a segunda divergência esperando.
          A tela mora em `telas/compras/` desde a leva N — é de lá que ela vem
          para os dois endereços, e continua sendo uma só. */}
      <Route path="mkt/fornecedores" element={S(<ComprasFornecedores />)} />
      <Route path="mkt/indicadores" element={S(<MKTRelatorios />)} />
      <Route path="mkt/configuracoes" element={S(<RequireConfigDoSetor><MKTConfiguracoes /></RequireConfigDoSetor>)} />
      <Route path="qualidade" element={<Navigate to="chamados" replace />} />
      <Route path="qualidade/sacs" element={S(<QualidadeSACList />)} />
      <Route path="qualidade/sacs/:id" element={S(<QualidadeSACDetail />)} />
      <Route path="qualidade/sacs/:id/laudo" element={S(<TechnicalReport />)} />
      <Route path="qualidade/dashboard" element={S(<QualidadeDashboard />)} />
      <Route path="qualidade/indicadores" element={S(<QualidadeRelatorios />)} />
      <Route path="qualidade/chamados" element={S(<QualidadeChamados />)} />
      <Route path="qualidade/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="qualidade/configuracoes" element={S(<RequireConfigDoSetor><QualidadeSettings /></RequireConfigDoSetor>)} />
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
      <Route path="rh/configuracoes" element={S(<RequireConfigDoSetor><RHConfiguracoes /></RequireConfigDoSetor>)} />
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
      <Route path="financeiro/conferencia-de-pedidos" element={S(<FinConferenciaPedidos />)} />
      <Route path="financeiro/contas-a-pagar" element={S(<FinPayables />)} />
      <Route path="financeiro/contas-a-receber" element={S(<FinReceivables />)} />
      <Route path="financeiro/fluxo-de-caixa" element={S(<FinCashFlow />)} />
      <Route path="financeiro/caixinha" element={S(<FinCaixinha />)} />
      {/* A porta do responsável da Caixinha que não tem o Financeiro (dono, 2026-10-20): fora do prefixo do setor, a
          guarda não pede a seção do perfil; o banco mostra só a Caixinha dele. */}
      <Route path="caixinha" element={S(<FinCaixinha />)} />
      {/* O estoque de suprimentos para o responsável de Caixinha sem Compras (etapa 0b): a compra da Caixinha entra
          nele, e o banco já deixa ver e lançar (`pode_no_estoque`). Fora de `compras/` para a guarda não pedir a seção. */}
      <Route path="estoque-de-suprimentos" element={S(<ComprasEstoque />)} />
      <Route path="financeiro/relatorio-de-compras" element={S(<FinRelatorioCompras />)} />
      {/* O Relatório da Caixinha virou o período e o PDF da própria Caixinha (etapa 4, 2026-10-25): o endereço antigo leva para lá. */}
      <Route path="financeiro/relatorio-da-caixinha" element={<Navigate to="../caixinha" relative="path" replace />} />
      <Route path="financeiro/indicadores" element={S(<FinIndicators />)} />
      <Route path="financeiro/configuracoes" element={S(<RequireConfigDoSetor><FinSettings /></RequireConfigDoSetor>)} />
      {/* Compras, módulo próprio (leva N). Sem rota de chamados, por decisão do
          dono: a solicitação de compra JÁ é o pedido, e uma segunda caixa de entrada
          seria dois lugares para olhar a mesma coisa. Pedir compra é em
          "Novo › Pedido › Compra"; esta tela é de quem atende. */}
      <Route path="compras" element={S(<ComprasSolicitacoes />)} />
      {/* Até a rodada 2 toda compra tinha um chamado por baixo, lido aqui. Desde
          20270206010000 a compra é um pedido (`/solicitacoes/:id`) e os chamados de
          compra foram apagados; o endereço fica para `ticketDetailPath('compras', id)`
          de um chamado de Compras que alguém ainda abra. */}
      <Route path="compras/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="compras/catalogo" element={S(<ComprasCatalogo />)} />
      <Route path="compras/estoque" element={S(<ComprasEstoque />)} />
      <Route path="compras/fornecedores" element={S(<ComprasFornecedores />)} />
      <Route path="compras/indicadores" element={S(<ComprasIndicadores />)} />
      {/* Aprovar compras: saiu da Diretoria em 2026-10-09 (dono). */}
      <Route path="compras/aprovacoes" element={S(<ComprasAprovar />)} />
      {/* LEVA P: Compras ganhou configuração — as categorias de compra e o teto de gasto. */}
      <Route path="compras/configuracoes" element={S(<RequireConfigDoSetor><ComprasConfiguracoes /></RequireConfigDoSetor>)} />
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
      {/* Expedição e Produção: setores de atendimento (2026-10-02, decisão do dono) — fila de
          chamados, indicadores e configurações, como o Educacional. O estoque e a separação da
          Expedição saíram; `fila` era o endereço antigo e leva à fila de chamados. */}
      <Route path="expedicao" element={<Navigate to="chamados" replace />} />
      <Route path="expedicao/fila" element={<Navigate to="/expedicao/chamados" replace />} />
      <Route path="expedicao/chamados" element={S(<TechnicianView module="expedicao" />)} />
      <Route path="expedicao/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="expedicao/indicadores" element={S(<ExpedicaoRelatorios />)} />
      <Route path="expedicao/configuracoes" element={S(<RequireConfigDoSetor><ExpedicaoConfiguracoes /></RequireConfigDoSetor>)} />
      <Route path="producao" element={<Navigate to="chamados" replace />} />
      <Route path="producao/chamados" element={S(<TechnicianView module="producao" />)} />
      <Route path="producao/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="producao/indicadores" element={S(<ProducaoRelatorios />)} />
      <Route path="producao/configuracoes" element={S(<RequireConfigDoSetor><ProducaoConfiguracoes /></RequireConfigDoSetor>)} />
      <Route path="comercial" element={<Navigate to="chamados" replace />} />
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
      {/* As análises, cada uma com endereço próprio (dono, 2026-10-14: o balde "Insights" acabou). A caixinha do
          perfil de cada uma é conferida pela guarda das telas (`telas-do-perfil`). */}
      <Route path="comercial/vendas" element={S(<RequireComercial><TelaDeAnalise visao="vendas"><ComercialPainel /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/clientes-parados" element={S(<RequireComercial><TelaDeAnalise visao="clientes"><ComercialClientes /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/bonificacao" element={S(<RequireComercial><TelaDeAnalise visao="bonificacao"><ComercialBonificacao /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/cashback" element={S(<RequireComercial><TelaDeAnalise visao="cashback"><ComercialCashback /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/beneficios" element={S(<RequireComercial><TelaDeAnalise visao="diretrizes"><ComercialDiretrizes /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/atendimento" element={S(<RequireComercial><TelaDeAnalise visao="atendimento"><ComercialChamadosRelatorios /></TelaDeAnalise></RequireComercial>)} />
      <Route path="comercial/painel" element={<Navigate to="/comercial/vendas" replace />} />
      {/* Era redirect para `insights?visao=atendimento`, resto do tempo em que o CRM morava
          aqui. Nenhum código navegava para ele. Em 2026-09-28 (LEVA O) o endereço que se
          esperaria para "indicadores do comercial" passou a ser os indicadores do comercial. */}
      <Route path="comercial/indicadores" element={S(<RequireComercial><ComercialIndicadores /></RequireComercial>)} />
      <Route path="comercial/lancamentos" element={S(<RequireComercial><ComercialLancamentos /></RequireComercial>)} />
      <Route path="comercial/pedidos" element={S(<RequireComercial><ComercialPedidosEnviados /></RequireComercial>)} />
      <Route path="comercial/carteiras" element={S(<RequireComercial><ComercialCarteiras /></RequireComercial>)} />
      <Route path="comercial/chamados" element={S(<TechnicianView module="comercial" />)} />
      <Route path="comercial/chamados/:id" element={S(<TicketDetail />)} />
      {/* Cadastro de clientes: tela própria desde 2026-09-28 — era aba do Insights,
          e o dono apontou que cadastro não é medição. Mesmo guarda do Insights. */}
      {/* Link antigo: era a lista de clientes do Comercial; levar ao cadastro (só administrador) bloqueava a vendedora. */}
      <Route path="comercial/clientes" element={<Navigate to="/comercial/clientes-parados" replace />} />
      <Route path="comercial/configuracoes" element={S(<RequireComercial><RequireConfigDoSetor><ComercialConfiguracoes /></RequireConfigDoSetor></RequireComercial>)} />
      <Route path="educacional" element={<Navigate to="chamados" replace />} />
      <Route path="educacional/chamados" element={S(<TechnicianView module="educacional" />)} />
      <Route path="educacional/chamados/:id" element={S(<TicketDetail />)} />
      <Route path="educacional/treinamentos" element={S(<EducacionalTreinamentos />)} />
      <Route path="diretoria" element={S(<RequireDiretoria><DiretoriaPainel /></RequireDiretoria>)} />
      <Route path="educacional/indicadores" element={S(<EducacionalRelatorios />)} />
      <Route path="educacional/configuracoes" element={S(<RequireConfigDoSetor><EducacionalConfiguracoes /></RequireConfigDoSetor>)} />
      <Route path="meu-rh" element={<SeMeuRHLigado>{S(<MeuRH />)}</SeMeuRHLigado>} />
      {/* Quem abre é o gestor da pessoa (ou administrador) — o banco confere (`ferias_demandas`). */}
      <Route path="ferias/:id/repassar" element={S(<RepassarFerias />)} />
      <Route path="nova-solicitacao" element={S(<NewRequest />)} />
      {/* Rodada 3, etapa B: os meus chamados e pedidos num lugar só (a barra de baixo e o menu levam aqui). */}
      <Route path="meus" element={S(<MeusPedidosEChamados />)} />
      <Route path="agenda" element={S(<Agenda />)} />
      {/* Rotinas do dia (dono, 2026-10-30): o cadastro; marcar é no Início. */}
      <Route path="rotinas" element={S(<Rotinas />)} />
      <Route path="meus-treinamentos" element={S(<MeusTreinamentos />)} />
      {/* Pausadas pelo dono (2026-10-03, `config/telas-pausadas.ts`): o endereço leva ao início. */}
      <Route path="metas" element={estaPausada('/metas') ? <Navigate to="../inicio" replace /> : S(<Metas />)} />
      {/* Projetos por setor (docs/plano-projetos.md, despausado em 2026-10-07). Quem vê o quê é o banco. */}
      <Route path="projetos" element={S(<Projetos />)} />
      <Route path="projetos/novo" element={S(<NovoProjeto />)} />
      <Route path="projetos/minhas" element={S(<MinhasAtividades />)} />
      <Route path="projetos/:id" element={S(<ProjetoDetalhe />)} />
      {/* Diretrizes (decisão do dono, 2026-10-04): a consulta de cada setor mora no menu dele; no
          Início, todas que a pessoa lê; na Diretoria, todas. Quem lê o quê é o banco. */}
      <Route path="diretrizes" element={S(<ConsultaDeDiretrizes />)} />
      {/* Jornal da empresa (decisão do dono, 2026-10-04): todos leem; o Marketing escreve. */}
      <Route path="jornal" element={S(<Jornal />)} />
      {/* A notícia em página própria, com link para compartilhar (dono, 2026-10-30). */}
      <Route path="jornal/:id" element={S(<NoticiaAberta />)} />
      <Route path="diretoria/diretrizes" element={S(<RequireDiretoria><ConsultaDeDiretrizes titulo="Diretrizes de todos os setores" /></RequireDiretoria>)} />
      <Route path="ti/diretrizes" element={S(<ConsultaDeDiretrizes setor="ti" />)} />
      <Route path="mkt/diretrizes" element={S(<ConsultaDeDiretrizes setor="marketing" />)} />
      <Route path="rh/diretrizes" element={S(<ConsultaDeDiretrizes setor="rh" />)} />
      <Route path="qualidade/diretrizes" element={S(<ConsultaDeDiretrizes setor="qualidade" />)} />
      <Route path="financeiro/diretrizes" element={S(<ConsultaDeDiretrizes setor="financeiro" />)} />
      <Route path="compras/diretrizes" element={S(<ConsultaDeDiretrizes setor="compras" />)} />
      <Route path="comercial/diretrizes" element={S(<RequireComercial><ConsultaDeDiretrizes setor="comercial" /></RequireComercial>)} />
      <Route path="educacional/diretrizes" element={S(<ConsultaDeDiretrizes setor="educacional" />)} />
      <Route path="expedicao/diretrizes" element={S(<ConsultaDeDiretrizes setor="expedicao" />)} />
      <Route path="producao/diretrizes" element={S(<ConsultaDeDiretrizes setor="producao" />)} />
      <Route path="chat" element={S(<Chat />)} />
      <Route path="avisos" element={S(<TodosOsAvisos />)} />
      {/* Solicitações (etapa 4b): o pedido com etapas, fora do chamado. Quem vê cada uma é o banco. */}
      <Route path="solicitacoes" element={S(<Pedidos />)} />
      <Route path="solicitacoes/:id" element={S(<DetalheDaSolicitacao />)} />
      <Route path="mkt/pedidos-de-arte" element={S(<SolicitacoesDoSetor setor="marketing" />)} />
      <Route path="ti/pedidos-de-acesso" element={S(<SolicitacoesDoSetor setor="ti" />)} />
      <Route path="ti/distribuidores" element={S(<DistribuidoresDaTI />)} />
      <Route path="financeiro/reembolsos-e-adiantamentos" element={S(<SolicitacoesDoSetor setor="financeiro" />)} />
      <Route path="rh/solicitacoes" element={<SeMeuRHLigado>{S(<SolicitacoesDoSetor setor="rh" />)}</SeMeuRHLigado>} />
      {/* Relatórios novos (etapa 5). Cada um no setor de quem usa; a Diretoria pelos mesmos, em /diretoria/relatorios. */}
      <Route path="compras/relatorios/ciclo-da-compra" element={S(<RelCicloDaCompra />)} />
      <Route path="compras/relatorios/economia-na-cotacao" element={S(<RelEconomiaNaCotacao />)} />
      <Route path="financeiro/relatorios/gasto-por-fornecedor" element={S(<RelGastoPorFornecedor />)} />
      <Route path="financeiro/relatorios/reembolsos-e-adiantamentos" element={S(<RelReembolsos />)} />
      <Route path="compras/relatorios/consumo-do-estoque" element={S(<RelConsumoDoEstoque />)} />
      <Route path="diretoria/relatorios/reembolsos-e-adiantamentos" element={S(<RequireDiretoria><RelReembolsos /></RequireDiretoria>)} />
      <Route path="diretoria/relatorios/consumo-do-estoque" element={S(<RequireDiretoria><RelConsumoDoEstoque /></RequireDiretoria>)} />
      <Route path="financeiro/previsao-de-caixa" element={S(<RelPrevisaoDeCaixa />)} />
      <Route path="comercial/relatorios/venda-por-familia" element={S(<RelVendaPorFamilia />)} />
      <Route path="comercial/agenda-de-retornos" element={S(<RelRetornosDaEquipe />)} />
      <Route path="comercial/distribuidores" element={S(<DistribuidoresDoComercial />)} />
      <Route path="comercial/distribuidores/:id" element={S(<FichaDoDistribuidor />)} />
      <Route path="diretoria/distribuidores" element={S(<RequireDiretoria><DistribuidoresDoComercial /></RequireDiretoria>)} />
      <Route path="diretoria/distribuidores/:id" element={S(<RequireDiretoria><FichaDoDistribuidor /></RequireDiretoria>)} />
      <Route path="qualidade/relatorios/reclamacoes-por-produto" element={S(<RelReclamacoesPorProduto />)} />
      <Route path="ausencias" element={S(<RelCalendarioDeAusencias />)} />
      <Route path="ciencia-das-diretrizes" element={S(<RelCienciaDasDiretrizes />)} />
      <Route path="diretoria/relatorios/ciclo-da-compra" element={S(<RequireDiretoria><RelCicloDaCompra /></RequireDiretoria>)} />
      <Route path="diretoria/relatorios/economia-na-cotacao" element={S(<RequireDiretoria><RelEconomiaNaCotacao /></RequireDiretoria>)} />
      <Route path="diretoria/relatorios/gasto-por-fornecedor" element={S(<RequireDiretoria><RelGastoPorFornecedor /></RequireDiretoria>)} />
      <Route path="diretoria/relatorios/venda-por-familia" element={S(<RequireDiretoria><RelVendaPorFamilia /></RequireDiretoria>)} />
      <Route path="chat/:id" element={S(<Chat />)} />
      {/* O painel da Lyra manda "Projeto" para ca desde antes de Projetos existir. */}
      <Route path="kanban" element={<Navigate to="../projetos" replace />} />
      <Route path="base-conhecimento" element={S(<Portal />)} />
      <Route path="base-conhecimento/:id" element={S(<TutorialViewer />)} />
      <Route path="portal" element={<Navigate to="../base-conhecimento" replace />} />
      <Route path="portal/:id" element={S(<TutorialViewer />)} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </GuardaDoSetor>
    </Suspense>
  );
}
