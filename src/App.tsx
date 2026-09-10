import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import ResetPassword from "./pages/ResetPassword";
import Terms from "./pages/Terms";
import OnboardingCompany from "./pages/OnboardingCompany";
import SACPublicForm from "./pages/sac/PublicForm";
import SACGateway from "./pages/sac/Gateway";
import SACOTPLogin from "./pages/sac/OTPLogin";
import SACRegister from "./pages/sac/Register";
import { CustomerKnowledgeBase, CustomerKnowledgeDetail } from "./pages/sac/KnowledgeBase";
import { MyTickets as SACMyTickets, MyTicketDetail as SACMyTicketDetail } from "./pages/sac/MyTickets";
import TenantLogin from "./pages/TenantLogin";
import AcceptInvite from "./pages/AcceptInvite";
import PagamentoStatus from "./pages/PagamentoStatus";
import { StaffAppRoutes } from "./routes/StaffAppRoutes";
import { TenantSlugGuard } from "./components/auth/TenantSlugGuard";
import { LegacyTenantRedirect } from "./components/auth/LegacyTenantRedirect";
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
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/t/:slug/login" element={<TenantLogin />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/termos" element={<Terms />} />
            <Route path="/onboarding/empresa" element={<OnboardingCompany />} />
            <Route path="/convite/:id" element={<AcceptInvite />} />
            <Route path="/pagamento/:status" element={<PagamentoStatus />} />

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

            {/* Painel por tenant (URL whitelabel) */}
            <Route path="/t/:slug/*" element={<TenantSlugGuard />}>
              <Route path="*" element={<StaffAppRoutes />} />
            </Route>

            {/* Painel legado (sem slug na URL) — redireciona p/ /t/{slug} no host padrão */}
            <Route path="/*" element={<LegacyTenantRedirect />}>
              <Route path="*" element={<StaffAppRoutes />} />
            </Route>
          </Routes>
        </AuthProvider>
      </TooltipProvider>
    </BrowserRouter>
  </QueryClientProvider>
);

export default App;
