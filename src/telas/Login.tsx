import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTenantBranding, applyTenantBrandingVars } from '@/hooks/useTenantBranding';
import { useTenantSlug } from '@/hooks/useTenantPath';
import { env } from '@/lib/env';

/**
 * A marca da empresa na tela de entrada.
 *
 * Ela vinha de `TenantLogin.tsx`, que era a tela `/t/<empresa>/login` e foi
 * apagada com o endereço por empresa (ADR-010). A auditoria pegou o que
 * sobrou: Configurações → Marca continuava oferecendo logo, banner e mensagem
 * de boas-vindas **da tela de login**, com prévia e link para copiar, e a tela
 * real tinha virado a branca do Helpoint. Campo que só se escreve e ninguém lê.
 *
 * De onde sai o slug, nesta ordem:
 *  1. o domínio próprio, quando a pessoa entra por ele (`useTenantSlug`);
 *  2. `VITE_TENANT_SLUG`, a empresa deste ambiente.
 *
 * O segundo passo só é honesto porque o sistema é de **uma** empresa
 * (ADR-010) — no modelo antigo a tela não teria como saber de quem é a marca
 * antes de alguém entrar. Sem a variável, o login aparece sem marca, que é o
 * que acontecia até agora; nada quebra.
 */
function useMarcaDaEmpresa() {
  const slugDoHost = useTenantSlug();
  // ponytail: a produção nunca teve `VITE_TENANT_SLUG` (o login mostrava "Helpoint", dono 2026-10-29). O sistema é de
  // uma empresa só (ADR-010), então o slug dela é o padrão; se um dia houver outra, ela vem pelo domínio ou pela variável.
  const slug = slugDoHost || env('TENANT_SLUG') || 'minasflor';
  const { tenant } = useTenantBranding(slug);
  useEffect(() => {
    applyTenantBrandingVars(tenant);
    return () => applyTenantBrandingVars(null);
  }, [tenant]);
  return tenant;
}

export default function Login() {
  const marca = useMarcaDaEmpresa();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [verSenha, setVerSenha] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const { signIn } = useAuth();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Cooldown local 60s para evitar atingir o rate limit do servidor
    const key = `pwreset:${forgotEmail.trim().toLowerCase()}`;
    const last = Number(localStorage.getItem(key) || 0);
    const elapsed = Date.now() - last;
    if (last && elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      toast.error(`Aguarde ${wait}s antes de pedir de novo.`);
      return;
    }

    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || (error as any).status === 429) {
        toast.error('Muitas tentativas em pouco tempo.', {
          description: 'Aguarde alguns minutos antes de tentar novamente. Se já recebeu o e-mail, use o link mais recente.',
        });
      } else {
        toast.error('Erro ao enviar email: ' + error.message);
      }
    } else {
      localStorage.setItem(key, String(Date.now()));
      toast.success('Email de recuperação enviado! Verifique sua caixa de entrada.');
      setForgotOpen(false);
      setForgotEmail('');
    }
    setForgotLoading(false);
  };
  const navigate = useNavigate();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    const { error } = await signIn(email, password);
    if (error) {
      setError('E-mail ou senha não conferem. Confira e tente de novo.');
    } else {
      navigate('/inicio');
    }
    setIsLoading(false);
  };


  // O nome da empresa — nunca "Helpoint" na porta de entrada (dono, 2026-10-29).
  const nome = marca?.name || 'Minasflor';

  // Desenho da DashStack (2026-10-29), pelas Leis de UX: só o essencial à vista (Hick, estética-usabilidade); "Esqueceu
  // a senha?" onde todo mundo procura, ao lado do rótulo (Jakob); o Entrar na largura toda (Fitts); senha visível e
  // aviso de Caps Lock, para a senha não falhar sem a pessoa entender por quê (Postel); o cartão branco no azul da
  // marca, para o olho ir direto ao formulário (Von Restorff).
  return (
    <div className="relative min-h-dvh overflow-hidden bg-primary flex flex-col items-center justify-center px-4 py-10">
      {/* As formas claras do fundo da DashStack — só enfeite, fora da leitura de tela. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-[420px] w-[420px] rotate-12 rounded-[80px] bg-white/10" />
        <div className="absolute -right-32 top-1/3 h-[520px] w-[520px] -rotate-12 rounded-[100px] bg-white/10" />
        <div className="absolute left-1/4 -bottom-40 h-[360px] w-[360px] rotate-45 rounded-[72px] bg-white/[0.07]" />
      </div>

      <main className="relative w-full max-w-[460px] rounded-3xl bg-card px-6 py-9 shadow-2xl sm:px-10">
        <div className="flex justify-center">
          {marca?.logo_url ? (
            <img src={marca.logo_url} alt={nome} className="h-20 w-auto rounded-xl bg-white object-contain" />
          ) : (
            <span className="font-display text-[28px] font-extrabold tracking-tight text-foreground">{nome}</span>
          )}
        </div>
        <h1 className="mt-4 text-center text-[26px] font-bold text-foreground">Entrar no sistema</h1>
        <p className="mt-1 text-center text-[15px] text-muted-foreground">Use o e-mail e a senha da {nome}.</p>

        <form onSubmit={handleSignIn} className="mt-7 space-y-5">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-[14px] font-semibold text-foreground">E-mail</label>
            <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@minasflor.com.br" required className="h-12 bg-muted text-[16px]" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="login-password" className="text-[14px] font-semibold text-foreground">Senha</label>
              <button type="button" onClick={() => setForgotOpen(true)} className="text-[14px] font-semibold text-primary hover:underline">
                Esqueceu a senha?
              </button>
            </div>
            <div className="relative">
              <Input id="login-password" type={verSenha ? 'text' : 'password'} autoComplete="current-password" value={password}
                onChange={(e) => setPassword(e.target.value)} onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                placeholder="Sua senha" required className="h-12 bg-muted pr-12 text-[16px]" />
              <button type="button" onClick={() => setVerSenha((v) => !v)} aria-label={verSenha ? 'Esconder a senha' : 'Mostrar a senha'}
                className="absolute right-1 top-1/2 -translate-y-1/2 inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:text-foreground">
                {verSenha ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            {capsLock && <p className="text-[13px] font-semibold text-status-warning">Caps Lock ligado.</p>}
          </div>

          {error && (
            <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-[14px] text-status-danger">{error}</div>
          )}

          <Button type="submit" className="h-12 w-full rounded-lg text-[16px] font-bold" disabled={isLoading}>
            {isLoading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-7 text-center text-[14px] text-muted-foreground">
          É cliente?{' '}
          <Link to="/sac/acesso" className="font-semibold text-primary hover:underline">Abrir ou acompanhar um SAC</Link>
        </p>
      </main>

      <p className="relative mt-6 text-center text-[13px] text-white/85">
        © {new Date().getFullYear()} {nome} ·{' '}
        <Link to="/termos" className="underline underline-offset-2 hover:text-white">Termos de uso</Link>
      </p>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar a senha</DialogTitle>
            <DialogDescription>Informe o seu e-mail e enviamos um link para criar uma senha nova.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="esqueci-email" className="text-[14px] font-medium text-foreground">E-mail</label>
              <Input id="esqueci-email" type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="seu@minasflor.com.br" required />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={forgotLoading}>
              {forgotLoading ? 'Enviando…' : 'Enviar o link'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
