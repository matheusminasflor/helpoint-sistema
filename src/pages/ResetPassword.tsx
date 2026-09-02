import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Terminal, ArrowLeft, Loader2, Eye, EyeOff, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import PasswordStrength, { evaluatePassword, generateStrongPassword } from '@/components/auth/PasswordStrength';


export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const handledRef = useRef(false);

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


  useEffect(() => {
    let cancelled = false;

    const markReady = () => {
      if (cancelled) return;
      setSessionReady(true);
      setIsProcessing(false);
    };

    const pollSession = async (timeoutMs = 4000) => {
      const start = Date.now();
      while (Date.now() - start < timeoutMs) {
        const { data } = await supabase.auth.getSession();
        if (data.session) return true;
        await new Promise((r) => setTimeout(r, 200));
      }
      return false;
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') && session) {
        markReady();
      }
    });

    (async () => {
      if (handledRef.current) return;
      handledRef.current = true;

      const code = searchParams.get('code');
      const type = searchParams.get('type');
      const hash = window.location.hash || '';
      const hashHasRecovery = hash.includes('type=recovery') || hash.includes('access_token=');

      try {
        // PKCE flow
        if (code && (type === 'recovery' || !type)) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            setErrorMsg('Link de recuperação inválido ou expirado.');
            setIsProcessing(false);
            return;
          }
          // Limpa querystring
          window.history.replaceState({}, '', window.location.pathname);
          markReady();
          return;
        }

        // Implicit/hash flow — detectSessionInUrl do client processa automaticamente
        if (hashHasRecovery) {
          const ok = await pollSession(5000);
          if (ok) {
            window.history.replaceState({}, '', window.location.pathname);
            markReady();
            return;
          }
        }

        // Última tentativa: verificar se já existe sessão de recovery
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          markReady();
          return;
        }

        setErrorMsg('Link de recuperação inválido ou expirado. Volte ao login e solicite novamente.');
        setIsProcessing(false);
      } catch (e) {
        setErrorMsg('Não foi possível validar o link. Tente novamente.');
        setIsProcessing(false);
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    if (password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres');
      return;
    }
    const { level } = evaluatePassword(password);
    if (level < 2) {
      toast.error('Senha muito fraca. Use letras, números e símbolos — ou clique em "Gerar senha forte".');
      return;
    }


    setIsLoading(true);
    try {
      // Revalida sessão antes do updateUser
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        toast.error('Sessão de recuperação expirada. Reabra o link enviado por e-mail.');
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error('Erro ao redefinir senha: ' + error.message);
        setIsLoading(false);
        return;
      }

      toast.success('Senha redefinida com sucesso Faça login novamente.');
      await supabase.auth.signOut();
      navigate('/login');
    } catch (err: any) {
      toast.error('Erro ao redefinir senha: ' + (err?.message || 'desconhecido'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 mb-10 justify-center">
          <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center  shadow-indigo-600/25">
            <Terminal className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">HELPOINT</h1>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-8 ">
          <h2 className="text-xl font-semibold text-foreground mb-2">Redefinir Senha</h2>

          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Validando link de recuperação...</p>
            </div>
          ) : sessionReady ? (
            <>
              <p className="text-sm text-muted-foreground mb-6">Digite sua nova senha abaixo.</p>
              <form onSubmit={handleReset} className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-foreground">Nova Senha</label>
                    <button
                      type="button"
                      onClick={handleSuggestPassword}
                      className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Gerar senha forte
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Mínimo 8 caracteres"
                      minLength={8}
                      required
                      className="h-11 bg-background border-border pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Mostrar/ocultar senha"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <PasswordStrength password={password} />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Confirmar Senha</label>
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    minLength={8}
                    required
                    className="h-11 bg-background border-border"
                  />
                  {confirmPassword && confirmPassword !== password && (
                    <p className="text-[11px] text-monday-red">As senhas não coincidem</p>
                  )}
                </div>

                <Button type="submit" className="w-full h-11 font-medium rounded-full" disabled={isLoading}>
                  {isLoading ? 'Redefinindo...' : 'Redefinir Senha'}
                </Button>
              </form>

            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              {errorMsg ?? 'Link inválido ou expirado. Volte ao login e solicite a recuperação de senha novamente.'}
            </p>
          )}

          <button
            onClick={() => navigate('/login')}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mt-6 mx-auto transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Login
          </button>
        </div>
      </div>
    </div>
  );
}
