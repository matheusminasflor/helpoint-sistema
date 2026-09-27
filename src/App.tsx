import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { ID_DO_AVISO_DE_CONSULTA, avisoDaConsulta, deveAvisar } from "@/lib/aviso-de-consulta";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./telas/Login";
import ResetPassword from "./telas/ResetPassword";
import Terms from "./telas/Terms";
import ContaSemEmpresa from "./telas/ContaSemEmpresa";
import SACPublicForm from "./telas/sac/PublicForm";
import SACGateway from "./telas/sac/Gateway";
import SACOTPLogin from "./telas/sac/OTPLogin";
import SACRegister from "./telas/sac/Register";
import { CustomerKnowledgeBase, CustomerKnowledgeDetail } from "./telas/sac/KnowledgeBase";
import { MyTickets as SACMyTickets, MyTicketDetail as SACMyTicketDetail } from "./telas/sac/MyTickets";
import AcceptInvite from "./telas/AcceptInvite";
import PagamentoStatus from "./telas/PagamentoStatus";
import PropostaPublica from "./telas/PropostaPublica";
import FormularioPublico from "./telas/crm/FormularioPublico";
import { StaffAppRoutes } from "./routes/StaffAppRoutes";
import { TenantSlugRedirect } from "./components/auth/TenantSlugRedirect";
import { StaffAwayFromSAC } from "./components/auth/StaffAwayFromSAC";

/**
 * O aviso que não existia (leva C, 2026-09-26). Até aqui o cliente era
 * `new QueryClient()` sem tratamento de erro: **toda leitura que falhava morria
 * em silêncio** e a tela mostrava vazio. `unwrap` (regra 1 das cinco) lançava
 * direito; ninguém escutava. Falha de RLS virava "nenhum registro", que é
 * exatamente o que a regra 1 existe para impedir — uma camada acima dela.
 *
 * Isto é o CHÃO, não o teto: os componentes que já tratam `isError` com texto
 * próprio (a ficha do cliente, a conciliação, o cashback do diretor, a tela de
 * Importações) continuam valendo, porque eles sabem QUAL número faltou e este
 * aviso não sabe.
 *
 * Só `queryCache`, nunca `mutationCache`: as escritas do sistema já dão o
 * próprio toast, uma por uma, e um aviso global somaria dois para o mesmo erro.
 *
 * O formato é o que o dono escolheu: vermelho no canto, saindo sozinho. `sonner`
 * é o que o resto do sistema usa (não o `Toaster` do shadcn, que fica até
 * alguém fechar), e o `id` fixo colapsa oito falhas simultâneas num aviso só.
 */
const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (erro) => {
      if (!deveAvisar(erro)) return;
      const { titulo, detalhe } = avisoDaConsulta(erro);
      toast.error(titulo, { id: ID_DO_AVISO_DE_CONSULTA, description: detalhe });
    },
  }),
});

const App = () => (
  /**
   * MODO ESCURO (leva J, 2026-09-26). `next-themes` já era dependência — o
   * `sonner.tsx` chamava `useTheme()` desde sempre — e **nenhum provider estava
   * montado**: o toast lia o padrão e ninguém percebia, porque nenhum token tinha
   * valor escuro de qualquer forma.
   *
   * Por que a dependência e não uma classe à mão: ela resolve as três coisas que
   * um `classList.toggle` não resolve — lembra a escolha entre sessões
   * (`localStorage`), segue o sistema operacional quando a pessoa não escolheu
   * (`defaultTheme="system"`), e escreve a classe ANTES da primeira pintura, o que
   * evita a tela piscar branca ao abrir no escuro.
   *
   * `disableTransitionOnChange` porque o sistema tem transição em quase tudo: sem
   * isso, trocar de tema anima 400 elementos ao mesmo tempo e parece travamento.
   */
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
  <QueryClientProvider client={queryClient}>
    <BrowserRouter>
      <TooltipProvider>
        <AuthProvider>
          <Toaster />
          <Sonner />
          <Routes>
            {/* Públicas */}
            <Route path="/" element={<Navigate to="/inicio" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/t/:slug/login" element={<Navigate to="/login" replace />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/termos" element={<Terms />} />
            <Route path="/conta-sem-empresa" element={<ContaSemEmpresa />} />
            <Route path="/convite/:id" element={<AcceptInvite />} />
            <Route path="/pagamento/:status" element={<PagamentoStatus />} />
            <Route path="/proposta/:token" element={<PropostaPublica />} />
            {/* Formulário do site (CRM-3a): aberto, sem login, e também usado
                dentro do site da empresa por `?embed=1`. */}
            <Route path="/f/:slug/:form" element={<FormularioPublico />} />

            {/* SAC público / clientes */}
            <Route path="/sac" element={<Navigate to="/sac/acesso" replace />} />
            <Route element={<StaffAwayFromSAC />}>
              <Route path="/sac/acesso" element={<SACGateway />} />
              <Route path="/sac/entrar" element={<SACOTPLogin />} />
              <Route path="/sac/cadastro" element={<SACRegister />} />
              <Route path="/sac/novo" element={<SACPublicForm />} />
              <Route path="/sac/login" element={<Navigate to="/sac/entrar" replace />} />
              <Route path="/sac/meus-chamados" element={<SACMyTickets />} />
              <Route path="/sac/meus-chamados/:id" element={<SACMyTicketDetail />} />
              <Route path="/sac/base-conhecimento" element={<CustomerKnowledgeBase />} />
              <Route path="/sac/base-conhecimento/:id" element={<CustomerKnowledgeDetail />} />
            </Route>

            {/* Endereço antigo, de quando o sistema era multi-empresa (antes
                da ADR-010). Continua atendendo para não quebrar link salvo:
                tira o prefixo e segue. */}
            <Route path="/t/:slug/*" element={<TenantSlugRedirect />} />

            <Route path="/*" element={<StaffAppRoutes />} />
          </Routes>
        </AuthProvider>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
