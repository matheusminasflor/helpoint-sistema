import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Terms from "./pages/Terms";
import ContaSemEmpresa from "./pages/ContaSemEmpresa";
import SACPublicForm from "./pages/sac/PublicForm";
import SACGateway from "./pages/sac/Gateway";
import SACOTPLogin from "./pages/sac/OTPLogin";
import SACRegister from "./pages/sac/Register";
import { CustomerKnowledgeBase, CustomerKnowledgeDetail } from "./pages/sac/KnowledgeBase";
import { MyTickets as SACMyTickets, MyTicketDetail as SACMyTicketDetail } from "./pages/sac/MyTickets";
import AcceptInvite from "./pages/AcceptInvite";
import PagamentoStatus from "./pages/PagamentoStatus";
import PropostaPublica from "./pages/PropostaPublica";
import FormularioPublico from "./pages/crm/FormularioPublico";
import { StaffAppRoutes } from "./routes/StaffAppRoutes";
import { TenantSlugRedirect } from "./components/auth/TenantSlugRedirect";
import { StaffAwayFromSAC } from "./components/auth/StaffAwayFromSAC";

const queryClient = new QueryClient();

const App = () => (
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
);

export default App;
