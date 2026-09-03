import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Shield, Zap, Database, Eye, EyeOff, Sparkles, Copy, Check, Lock } from 'lucide-react';
import { toast } from 'sonner';
import PasswordStrength, { evaluatePassword, generateStrongPassword } from '@/components/auth/PasswordStrength';



export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [signupSuccess, setSignupSuccess] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const handleSuggestPassword = async () => {
    const pw = generateStrongPassword(16);
    setPassword(pw);
    setConfirmPassword(pw);
    setShowPassword(true);
    try {
      await navigator.clipboard.writeText(pw);
      toast.success('Senha forte gerada e copiada', { description: 'Salve em um local seguro.' });
    } catch {
      toast.success('Senha forte gerada');
    }
  };

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
        const { data: u } = await supabase.auth.getUser();
        if (u.user) {
          const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', u.user.id).maybeSingle();
          if (prof?.tenant_id) {
            const { data: t } = await supabase.from('tenants').select('slug').eq('id', prof.tenant_id).maybeSingle();
            if (t?.slug) { navigate(`/t/${t.slug}/inicio`); setIsLoading(false); return; }
          }
        }
      } catch {}
      navigate('/inicio');
    }
    setIsLoading(false);
  };


  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('As senhas não conferem. Verifique e tente novamente.');
      return;
    }
    const { level } = evaluatePassword(password);
    if (level < 2) {
      setError('Senha muito fraca. Use ao menos 8 caracteres com letras, números e símbolos.');
      return;
    }
    setIsLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/staff-signup`;
      const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName,
          redirect_to: `${window.location.origin}/onboarding/empresa`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) {
        const raw = String(data?.error || '').toLowerCase();
        let msg = data?.detail || data?.error || 'Não foi possível criar a conta.';
        if (raw.includes('already_confirmed')) {
          msg = 'Este e-mail já está confirmado. Faça login normalmente.';
        } else if (raw.includes('already') || raw.includes('registered') || raw.includes('exist')) {
          msg = 'Este e-mail já está cadastrado. Faça login ou recupere a senha.';
        } else if (raw.includes('weak') || raw.includes('pwned') || raw.includes('known')) {
          msg = 'Essa senha aparece em vazamentos públicos. Clique em "Gerar senha forte" ou crie uma única e original.';
        } else if (raw.includes('send_failed')) {
          msg = 'Falha ao enviar o e-mail de confirmação. Verifique o endereço e tente novamente.';
        }
        setError(msg);
      } else {
        setSignupSuccess(true);
      }
    } catch (err: any) {
      setError(err?.message || 'Erro de rede ao criar a conta.');
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
                  Entrada segura — cada empresa vê apenas os próprios dados.
                </p>
              </div>
            </div>

            <div className="px-5 pb-6 pt-5">
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>


              <TabsContent value="login" className="mt-0">
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
              </TabsContent>

              <TabsContent value="signup" className="mt-0">
                {signupSuccess ? (
                  <div className="space-y-4 text-center py-4">
                    <div className="w-12 h-12 mx-auto rounded-full bg-monday-green/15 flex items-center justify-center">
                      <Check className="w-6 h-6 text-status-success" aria-hidden="true" />
                    </div>
                    <h2 className="font-bold text-foreground">Confirme seu e-mail</h2>
                    <p className="text-[13px] text-muted-foreground">
                      Enviamos um link de confirmação para <strong>{email}</strong>.
                      Clique no link e depois cadastre sua empresa.
                    </p>
                    <Button variant="outline" className="w-full min-h-11" onClick={() => setSignupSuccess(false)}>
                      Voltar
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleSignUp} className="space-y-3">
                    <p className="text-[12px] text-muted-foreground bg-surface-2 p-3 rounded-lg">
                      Crie sua conta. Depois você cadastra sua empresa e vira administrador do próprio painel.
                    </p>
                    <div className="space-y-1.5">
                      <label htmlFor="signup-name" className="text-[13px] font-medium text-foreground">Nome completo</label>
                      <Input id="signup-name" type="text" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" required />
                    </div>
                    <div className="space-y-1.5">
                      <label htmlFor="signup-email" className="text-[13px] font-medium text-foreground">E-mail</label>
                      <Input id="signup-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="seu@empresa.com" required />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label htmlFor="signup-password" className="text-[13px] font-medium text-foreground">Senha</label>
                        <button type="button" onClick={handleSuggestPassword} className="text-[12px] font-medium text-primary hover:underline inline-flex items-center gap-1 min-h-11 px-1">
                          <Sparkles className="w-3.5 h-3.5" aria-hidden="true" /> Gerar senha forte
                        </button>
                      </div>
                      <div className="relative">
                        <Input
                          id="signup-password"
                          type={showPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mínimo 8 caracteres"
                          minLength={8}
                          required
                          className="pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 h-11 w-11 inline-flex items-center justify-center text-muted-foreground hover:text-foreground rounded-md"
                          aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                          aria-pressed={showPassword}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                        </button>
                      </div>
                      <PasswordStrength password={password} />
                    </div>

                    <div className="space-y-1.5">
                      <label htmlFor="signup-confirm" className="text-[13px] font-medium text-foreground">Confirmar senha</label>
                      <Input
                        id="signup-confirm"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a senha"
                        required
                      />
                      {confirmPassword && confirmPassword !== password && (
                        <p className="text-[12px] text-status-danger">As senhas não conferem.</p>
                      )}
                      {confirmPassword && confirmPassword === password && (
                        <p className="text-[12px] text-status-success">Senhas iguais.</p>
                      )}
                    </div>

                    <p className="text-[12px] text-muted-foreground bg-surface-2 p-2 rounded-md">
                      Sua senha é verificada contra vazamentos públicos. Evite "123456", seu nome, data de nascimento ou senhas usadas em outros sites.
                    </p>

                    {error && (
                      <div role="alert" className="bg-monday-red/10 border border-monday-red/20 text-status-danger text-[13px] p-3 rounded-lg">{error}</div>
                    )}

                    <Button type="submit" className="w-full font-semibold min-h-11" disabled={isLoading}>
                      {isLoading ? 'Criando conta...' : 'Criar conta'}
                    </Button>
                  </form>
                )}
              </TabsContent>
            </Tabs>
            </div>
          </div>

          {/* Provas de valor abaixo do cartão */}
          <ul className="mt-6 grid gap-2.5 sm:grid-cols-3">
            {[
              { icon: Zap, title: 'Lyra resume seu dia', desc: 'Prioridades e pendências em um resumo.' },
              { icon: Shield, title: 'Dados isolados', desc: 'Cada empresa acessa só o que é dela.' },
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
