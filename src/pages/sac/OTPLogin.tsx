import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Mail } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { useTenantBranding } from '@/hooks/useTenantBranding';
import { useSacTenantSlug } from '@/hooks/useSacTenantSlug';

export default function SACOTPLogin() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tenant = useSacTenantSlug();
  const prefill = search.get('email') || '';
  const { tenant: tenantBranding, loading: tenantLoading } = useTenantBranding(tenant);
  const [step, setStep] = useState<'email' | 'code'>(prefill ? 'code' : 'email');
  const [email, setEmail] = useState(prefill);
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const autoSent = useRef(false);

  const sendCode = async (overrideEmail?: string) => {
    const value = (overrideEmail ?? email).trim().toLowerCase();
    if (!value) return;
    if (!tenantBranding?.id) {
      toast.error('Empresa não identificada. Volte e acesse o link de SAC novamente.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('send-sac-otp', {
      body: { email: value, tenant_id: tenantBranding.id, purpose: 'login' },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      const errCode = (data as any)?.error || error?.message;
      const msg =
        errCode === 'not_registered' ? 'E-mail não cadastrado. Volte e clique em "Criar cadastro".'
        : errCode === 'rate_limited' ? 'Aguarde um instante antes de pedir outro código.'
        : errCode === 'blocked' ? 'Esta conta está bloqueada. Fale com o suporte.'
        : 'Não conseguimos enviar o código. Confira o e-mail.';
      toast.error(msg);
      if (errCode === 'not_registered') setStep('email');
      return;
    }
    toast.success('Código enviado! Verifique seu e-mail.');
    setStep('code');
  };

  useEffect(() => {
    if (prefill && !autoSent.current && tenantBranding) {
      autoSent.current = true;
      sendCode(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, tenantBranding]);

  const verify = async () => {
    if (code.length < 6 || !tenantBranding?.id) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('verify-sac-otp', {
      body: { email: email.trim().toLowerCase(), code, tenant_id: tenantBranding.id, purpose: 'login' },
    });
    if (error || !(data as any)?.token_hash) {
      setLoading(false);
      const errCode = (data as any)?.error;
      toast.error(errCode === 'expired' ? 'Código expirado. Peça um novo.' :
                  errCode === 'too_many_attempts' ? 'Muitas tentativas. Peça um novo código.' :
                  'Código incorreto.');
      return;
    }
    const { error: vErr } = await supabase.auth.verifyOtp({
      token_hash: (data as any).token_hash,
      type: 'magiclink',
    });
    setLoading(false);
    if (vErr) { toast.error('Não foi possível entrar. Tente novamente.'); return; }
    navigate(tenant ? `/sac/meus-chamados?tenant=${tenant}` : '/sac/meus-chamados');
  };

  if (!tenantLoading && !tenantBranding) {
    return (
      <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
        <Card className="p-6 max-w-sm w-full text-center">
          <h1 className="text-lg font-bold mb-2">Link de atendimento inválido</h1>
          <p className="text-sm text-muted-foreground">Peça à empresa o link correto do painel de atendimento ao cliente.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
      <div className="max-w-sm w-full">
        <Link to={tenant ? `/sac/acesso?tenant=${tenant}` : '/sac/acesso'} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />Voltar
        </Link>
        <Card className="p-6">
          <div className="inline-flex w-10 h-10 rounded-full bg-primary/10 items-center justify-center mb-3">
            <Mail className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-1">
            Entrar{tenantBranding?.name ? ` — ${tenantBranding.name}` : ''}
          </h1>


          {step === 'email' && (
            <form onSubmit={(e) => { e.preventDefault(); sendCode(); }} className="space-y-3 mt-4">
              <p className="text-sm text-muted-foreground">Digite seu e-mail. Enviamos um código de 6 dígitos para você entrar.</p>
              <div>
                <Label>E-mail</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </div>
              <Button type="submit" disabled={loading || tenantLoading} className="w-full">
                {loading || tenantLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{tenantLoading ? 'Carregando empresa...' : 'Enviando...'}</> : 'Enviar código'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <div className="space-y-4 mt-4">
              <p className="text-sm text-muted-foreground">Enviamos um código para <strong>{email}</strong>. Digite abaixo:</p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={verify} disabled={loading || code.length < 6} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando...</> : 'Entrar'}
              </Button>
              <button type="button" onClick={() => { autoSent.current = false; setStep('email'); }} className="w-full text-xs text-muted-foreground hover:text-foreground">
                Usar outro e-mail
              </button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
