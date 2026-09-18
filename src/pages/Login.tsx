import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Shield, Zap, Database, Copy, Lock } from 'lucide-react';
import { toast } from 'sonner';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const { signIn } = useAuth();

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    // Cooldown local 60s para evitar atingir o rate limit do servidor
    const key = `pwreset:${forgotEmail.trim().toLowerCase()}`;
    const last = Number(localStorage.getItem(key) || 0);
    const elapsed = Date.now() - last;
    if (last && elapsed < 60_000) {
      const wait = Math.ceil((60_000 - elapsed) / 1000);
      toast.error(`Aguarde ${wait}s antes de solicitar novamente.`);
      return;
    }

    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('rate limit') || msg.includes('over_email_send_rate_limit') || (error as any).status === 429) {
        toast.error('Muitas solicitações em pouco tempo.', {
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
      setError('Credenciais inválidas. Verifique email e senha.');
    } else {
      // Busca o slug do tenant do usuário para redirecionar para /t/{slug}/inicio
      try {
        const { user } = unwrap(await supabase.auth.getUser());
        if (user) {
          const prof = unwrap(await supabase.from('profiles').select('tenant_id').eq('id', user.id).maybeSingle());
          if (prof?.tenant_id) {
            const t = unwrap(await supabase.from('tenants').select('slug').eq('id', prof.tenant_id).maybeSingle());
            if (t?.slug) { navigate(`/t/${t.slug}/inicio`); setIsLoading(false); return; }
          }
        }
      } catch {}
      navigate('/inicio');
    }
    setIsLoading(false);
  };


  return (
    <div className="min-h-dvh bg-surface-2 flex flex-col">
      {/* Faixa superior com a marca */}
      <header className="w-full border-b border-border bg-card">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 min-h-11" aria-label="Voltar para a página inicial do Helpoint">
            <span className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-extrabold text-sm">H</span>
            </span>
            <span className="font-display font-extrabold text-lg tracking-tight text-primary">Helpoint</span>
          </Link>
          <Link to="/sac/acesso" className="text-[13px] font-semibold text-muted-foreground hover:text-primary inline-flex items-center min-h-11 px-2">
            Portal do cliente
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-10 md:py-14">
        <div className="text-center max-w-xl mx-auto mb-8">
          <span className="inline-flex items-center gap-1.5 rounded-full badge-info px-3 py-1 text-[12px] font-semibold">
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
            Área restrita da sua empresa
          </span>
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-foreground tracking-tight mt-3">
            Acesse o seu Helpoint
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            Chamados de TI, Qualidade, Marketing e RH — com a Lyra organizando o seu dia.
          </p>
        </div>

        <div className="max-w-[460px] mx-auto">
          <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
            {/* Cabeçalho do cartão: identidade da marca + contexto de segurança */}
            <div className="border-b border-border px-5 py-4 flex items-center gap-3">
              <span className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <span className="text-primary-foreground font-extrabold text-base">H</span>
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-foreground leading-tight">Painel Helpoint</p>
                <p className="text-[12px] text-muted-foreground leading-tight">
                  Entrada restrita a quem trabalha na Minasflor.
                </p>
              </div>
            </div>

            <div className="px-5 pb-6 pt-5">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="text-[13px] font-medium text-foreground">E-mail</label>
                  <Input id="login-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@email.com" required />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="login-password" className="text-[13px] font-medium text-foreground">Senha</label>
                  <Input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Sua senha" required />
                </div>

                {error && (
                  <div role="alert" className="bg-monday-red/10 border border-monday-red/20 text-status-danger text-[13px] p-3 rounded-lg">{error}</div>
                )}

                <Button type="submit" className="w-full font-semibold min-h-11" disabled={isLoading}>
                  {isLoading ? 'Autenticando...' : 'Entrar'}
                </Button>

                <button type="button" onClick={() => setForgotOpen(true)} className="w-full text-center text-[13px] text-muted-foreground hover:text-primary transition-colors font-medium min-h-11">
                  Esqueceu sua senha?
                </button>
              </form>
            </div>
          </div>

          {/* Provas de valor abaixo do cartão */}
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Zap, title: 'Lyra resume seu dia', desc: 'Prioridades e pendências em um resumo.' },
              { icon: Shield, title: 'Acesso por pessoa', desc: 'Cada um vê os módulos que recebeu.' },
              { icon: Database, title: 'Sem planilhas soltas', desc: 'Histórico e prazos em um só lugar.' },
            ].map(item => (
              <li key={item.title} className="rounded-lg border border-border bg-card p-3 flex sm:flex-col items-start gap-2.5">
                <span className="w-8 h-8 rounded-md badge-info flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4" aria-hidden="true" />
                </span>
                <div>
                  <span className="text-[12.5px] font-semibold text-foreground leading-snug block">{item.title}</span>
                  <span className="text-[11.5px] text-muted-foreground leading-snug block mt-0.5">{item.desc}</span>
                </div>
              </li>
            ))}
          </ul>


          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            Ao continuar, você aceita os{' '}
            <Link to="/termos" className="text-primary font-medium underline underline-offset-2">Termos de Uso</Link>.
          </p>
          <p className="mt-1 text-center text-[12px] text-muted-foreground">© {new Date().getFullYear()} Helpoint</p>
        </div>
      </main>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar Senha</DialogTitle>
            <DialogDescription>Informe seu email e enviaremos um link para redefinir sua senha.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleForgotPassword} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium text-foreground">Email</label>
              <Input type="email" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} placeholder="seu@email.com" required />
            </div>
            <Button type="submit" className="w-full font-semibold" disabled={forgotLoading}>
              {forgotLoading ? 'Enviando...' : 'Enviar Link de Recuperação'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
