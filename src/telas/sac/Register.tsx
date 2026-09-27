import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

import { useTenantBranding } from '@/hooks/useTenantBranding';
import { useSacTenantSlug } from '@/hooks/useSacTenantSlug';

export default function SACRegister() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const tenant = useSacTenantSlug();
  const prefillEmail = search.get('email') || '';
  const { refreshProfile } = useAuth();
  const { tenant: tenantBranding, loading: tenantLoading } = useTenantBranding(tenant);
  const tenantId = tenantBranding?.id ?? null;
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [form, setForm] = useState({
    full_name: '', cnpj: '', razao_social: '', phone: '', whatsapp: '',
    email: prefillEmail,
    address_cep: '', address_street: '', address_number: '', address_complement: '',
    address_neighborhood: '', address_city: '', address_state: '',
  });
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name || !form.email) { toast.error('Preencha nome e e-mail.'); return; }
    if (!tenantId) { toast.error('Empresa não identificada. Acesse o link de SAC novamente.'); return; }
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('send-sac-otp', {
      body: {
        email: form.email.trim().toLowerCase(),
        tenant_id: tenantId,
        purpose: 'signup',
      },
    });
    setLoading(false);
    if (error || (data as any)?.error) {
      const errCode = (data as any)?.error || error?.message;
      if (errCode === 'already_registered') {
        toast.error('Este e-mail já está cadastrado. Use "Entrar".');
        navigate(`/sac/entrar?email=${encodeURIComponent(form.email.trim().toLowerCase())}${tenant ? `&tenant=${tenant}` : ''}`);
        return;
      }
      toast.error(errCode === 'rate_limited' ? 'Aguarde um instante antes de pedir outro código.'
                  : 'Não conseguimos enviar o código. Confira o e-mail.');
      return;
    }
    toast.success('Código enviado! Verifique seu e-mail.');
    setStep('code');
  };

  const verify = async () => {
    if (code.length < 6 || !tenantId) return;
    setLoading(true);
    const { data, error } = await supabase.functions.invoke('verify-sac-otp', {
      body: {
        email: form.email.trim().toLowerCase(),
        code,
        tenant_id: tenantId,
        purpose: 'signup',
        user_metadata: { full_name: form.full_name },
      },
    });
    if (error || !(data as any)?.token_hash || !(data as any)?.user_id) {
      setLoading(false);
      const errCode = (data as any)?.error;
      console.error('[sac-register] verify failed', { error, data });
      const msg =
        errCode === 'expired' ? 'Código expirado. Peça um novo.' :
        errCode === 'too_many_attempts' ? 'Muitas tentativas. Peça um novo código.' :
        errCode === 'invalid_code' ? 'Código incorreto.' :
        errCode === 'no_code' ? 'Nenhum código ativo. Solicite um novo.' :
        errCode ? `Falha ao concluir: ${errCode}` :
        'Não foi possível concluir o cadastro. Tente novamente.';
      toast.error(msg);
      return;
    }
    const userId = (data as any).user_id as string;

    // Sign in first so auth.uid() matches the row we're about to insert (RLS requires user_id = auth.uid())
    const { error: vErr } = await supabase.auth.verifyOtp({
      token_hash: (data as any).token_hash,
      type: 'magiclink',
    });
    if (vErr) { setLoading(false); toast.error('Não foi possível entrar: ' + vErr.message); return; }

    const { error: profErr } = await supabase.from('customer_profiles').insert({
      user_id: userId,
      tenant_id: tenantId,
      full_name: form.full_name,
      email: form.email.trim().toLowerCase(),
      document: form.cnpj || null,
      cnpj: form.cnpj || null,
      razao_social: form.razao_social || null,
      phone: form.phone || null,
      whatsapp: form.whatsapp || null,
      address_cep: form.address_cep || null,
      address_street: form.address_street || null,
      address_number: form.address_number || null,
      address_complement: form.address_complement || null,
      address_neighborhood: form.address_neighborhood || null,
      address_city: form.address_city || null,
      address_state: form.address_state || null,
    });
    if (profErr) { setLoading(false); toast.error('Erro ao salvar cadastro: ' + profErr.message); return; }

    setLoading(false);

    await refreshProfile();
    toast.success('Cadastro feito');
    navigate(tenant ? `/sac/meus-chamados?tenant=${tenant}` : '/sac/meus-chamados');
  };

  if (!tenantLoading && !tenantId) {
    return (
      <div className="min-h-screen bg-surface-1 flex items-center justify-center p-4">
        <Card className="p-6 max-w-sm w-full text-center">
          <h1 className="text-lg font-bold mb-2">Link de atendimento inválido</h1>
          <p className="text-sm text-muted-foreground">Peça à empresa o link correto do painel de atendimento ao cliente para criar seu cadastro.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-1 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <Link to={tenant ? `/sac/acesso?tenant=${tenant}` : '/sac/acesso'} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" />Voltar
        </Link>
        <Card className="p-6">
          <div className="inline-flex w-10 h-10 rounded-full bg-primary/10 items-center justify-center mb-3">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold mb-1">
            Criar cadastro{tenantBranding?.name ? ` — ${tenantBranding.name}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground mb-5">Você não precisa criar senha. Sempre que precisar acessar, enviamos um código no seu e-mail.</p>

          {step === 'form' && (
            <form onSubmit={submit} className="space-y-4">
              <Section title="Identificação">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Field label="Nome completo *"><Input value={form.full_name} onChange={e => set('full_name', e.target.value)} required /></Field>
                  <Field label="E-mail *"><Input type="email" value={form.email} onChange={e => set('email', e.target.value)} required /></Field>
                  <Field label="CNPJ"><Input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} /></Field>
                  <Field label="Razão Social"><Input value={form.razao_social} onChange={e => set('razao_social', e.target.value)} /></Field>
                  <Field label="Telefone"><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></Field>
                  <Field label="WhatsApp"><Input value={form.whatsapp} onChange={e => set('whatsapp', e.target.value)} /></Field>
                </div>
              </Section>
              <Section title="Endereço">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Field label="CEP"><Input value={form.address_cep} onChange={e => set('address_cep', e.target.value)} onBlur={async e => {
                    const cep = e.target.value.replace(/\D/g, '');
                    if (cep.length !== 8) return;
                    try {
                      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
                      const d = await r.json();
                      if (!d.erro) {
                        setForm(p => ({ ...p,
                          address_street: d.logradouro || p.address_street,
                          address_neighborhood: d.bairro || p.address_neighborhood,
                          address_city: d.localidade || p.address_city,
                          address_state: d.uf || p.address_state,
                        }));
                      }
                    } catch {}
                  }} /></Field>
                  <div className="col-span-2 md:col-span-2"><Field label="Logradouro"><Input value={form.address_street} onChange={e => set('address_street', e.target.value)} /></Field></div>
                  <Field label="Número"><Input value={form.address_number} onChange={e => set('address_number', e.target.value)} /></Field>
                  <Field label="Complemento"><Input value={form.address_complement} onChange={e => set('address_complement', e.target.value)} /></Field>
                  <Field label="Bairro"><Input value={form.address_neighborhood} onChange={e => set('address_neighborhood', e.target.value)} /></Field>
                  <Field label="Cidade"><Input value={form.address_city} onChange={e => set('address_city', e.target.value)} /></Field>
                  <Field label="UF"><Input maxLength={2} value={form.address_state} onChange={e => set('address_state', e.target.value.toUpperCase())} /></Field>
                </div>
              </Section>
              <Button type="submit" disabled={loading || tenantLoading} className="w-full">
                {loading || tenantLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{tenantLoading ? 'Carregando empresa...' : 'Enviando...'}</> : 'Continuar (vamos enviar um código)'}
              </Button>
            </form>
          )}

          {step === 'code' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Enviamos um código para <strong>{form.email}</strong>. Digite-o para confirmar:</p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={code} onChange={setCode}>
                  <InputOTPGroup>
                    {[0,1,2,3,4,5].map(i => <InputOTPSlot key={i} index={i} />)}
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button onClick={verify} disabled={loading || code.length < 6} className="w-full">
                {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Verificando...</> : 'Concluir cadastro'}
              </Button>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm border-b pb-2">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><Label className="text-xs mb-1 block">{label}</Label>{children}</div>;
}
