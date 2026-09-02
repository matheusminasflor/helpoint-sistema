import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useTenantBranding, applyTenantBrandingVars } from '@/hooks/useTenantBranding';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function TenantLogin() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const { tenant, loading } = useTenantBranding(slug || null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);

  useEffect(() => { applyTenantBrandingVars(tenant); return () => applyTenantBrandingVars(null); }, [tenant]);

  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando...</div>;
  if (!tenant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
        <h1 className="text-xl font-bold mb-2">Empresa não encontrada</h1>
        <p className="text-sm text-muted-foreground mb-4">Confira o link recebido ou acesse o login padrão.</p>
        <Link to="/login" className="text-primary underline text-sm">Ir para o login padrão</Link>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr('');
    const { error } = await signIn(email, password);
    if (error) setErr('Credenciais inválidas.');
    else navigate(`/t/${slug}/inicio`);
    setBusy(false);
  };


  const forgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else { toast.success('E-mail enviado.'); setForgotOpen(false); }
    setForgotBusy(false);
  };

  const banner = tenant.login_banner_url;
  const logo = tenant.logo_url;
  const welcome = tenant.welcome_text || `Bem-vindo(a) ao painel da ${tenant.name}`;

  return (
    <div className="min-h-screen flex bg-background">
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-primary relative overflow-hidden text-white">
        {banner && (
          <img src={banner} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />
        )}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-12">
            {logo ? (
              <img src={logo} alt={tenant.name} className="w-12 h-12 rounded-lg object-cover bg-white/20" />
            ) : (
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center font-bold text-xl">
                {tenant.name.charAt(0).toUpperCase()}
              </div>
            )}
            <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
          </div>
          <h2 className="text-3xl font-bold mb-4 leading-tight">{welcome}</h2>
          <p className="text-white/80 max-w-md">Acesse seu painel e continue de onde parou.</p>
        </div>
        <div className="relative z-10 text-white/60 text-xs">Powered by HELPOINT</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8 justify-center">
            {logo ? <img src={logo} alt={tenant.name} className="w-10 h-10 rounded-lg object-cover" /> : null}
            <h1 className="text-xl font-bold">{tenant.name}</h1>
          </div>

          <div className="rounded-xl p-8 border border-border bg-card shadow-card">
            <h2 className="text-lg font-bold mb-1">Entrar</h2>
            <p className="text-sm text-muted-foreground mb-6">Painel {tenant.name}</p>

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">E-mail</label>
                <Input type="email" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-medium">Senha</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
              </div>
              {err && <div className="bg-monday-red/10 border border-monday-red/20 text-monday-red text-[13px] p-3 rounded-lg">{err}</div>}
              <Button type="submit" className="w-full font-semibold" disabled={busy}>
                {busy ? 'Autenticando...' : 'Acessar'}
              </Button>
              <button type="button" onClick={() => setForgotOpen(true)} className="w-full text-center text-[13px] text-muted-foreground hover:text-primary">
                Esqueceu sua senha?
              </button>
            </form>
          </div>
          <p className="mt-6 text-center text-[12px] text-muted-foreground">
            Powered by <Link to="/login" className="hover:underline">HELPOINT</Link>
          </p>
        </div>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Recuperar Senha</DialogTitle>
            <DialogDescription>Enviaremos um link de redefinição.</DialogDescription>
          </DialogHeader>
          <form onSubmit={forgot} className="space-y-4">
            <Input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="seu@email.com" required />
            <Button type="submit" className="w-full" disabled={forgotBusy}>{forgotBusy ? 'Enviando...' : 'Enviar link'}</Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
