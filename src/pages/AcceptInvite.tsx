import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, UserPlus, AlertCircle, CheckCircle2, Sparkles, Eye, EyeOff, ImagePlus, X } from 'lucide-react';
import { toast } from 'sonner';
import PasswordStrength, { evaluatePassword, generateStrongPassword } from '@/components/auth/PasswordStrength';

interface InviteRow {
  id: string;
  email: string;
  role: string;
  department: string | null;
  expires_at: string;
  used_at: string | null;
  tenant: { name: string; slug: string } | null;
}

export default function AcceptInvite() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      if (!id) { setError('Link inválido'); setLoading(false); return; }
      const { data, error } = await supabase.rpc('get_invite_public', { _invite_id: id });
      const row = Array.isArray(data) ? data[0] : data;
      if (error || !row) setError('Convite não encontrado. Solicite um novo ao administrador.');
      else if (row.used_at) setError('Este convite já foi utilizado.');
      else if (new Date(row.expires_at).getTime() < Date.now()) setError('Convite expirado (validade de 24h). Peça um novo ao administrador.');
      else setInvite({
        id: row.id,
        email: row.email,
        role: row.role,
        department: row.department,
        expires_at: row.expires_at,
        used_at: row.used_at,
        tenant: row.tenant_name ? { name: row.tenant_name, slug: row.tenant_slug } : null,
      });
      setLoading(false);
    })();
  }, [id]);

  const handleSuggestPassword = () => {
    const pw = generateStrongPassword(16);
    setPassword(pw);
    setConfirm(pw);
    setShowPw(true);
    navigator.clipboard?.writeText(pw).catch(() => {});
    toast.success('Senha forte gerada e copiada para a área de transferência');
  };

  const handleAvatarPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 4 * 1024 * 1024) return toast.error('Imagem muito grande (máx 4MB)');
    if (!f.type.startsWith('image/')) return toast.error('Selecione um arquivo de imagem');
    setAvatarFile(f);
    setAvatarPreview(URL.createObjectURL(f));
  };

  const submit = async () => {
    if (!invite) return;
    const { level } = evaluatePassword(password);
    if (password.length < 8) return toast.error('Senha precisa ter ao menos 8 caracteres');
    if (level < 2) return toast.error('Escolha uma senha mais forte (use a sugestão se preferir)');
    if (password !== confirm) return toast.error('As senhas não coincidem');
    setSubmitting(true);
    const { data, error } = await supabase.functions.invoke('invite-signup', {
      body: {
        action: 'accept_invite',
        invite_id: invite.id,
        email: invite.email,
        password,
        full_name: fullName || invite.email,
        department: invite.department,
      },
    });
    // Lê o corpo real do erro retornado pela edge function (FunctionsHttpError)
    let errMsg: string | null = (data as any)?.error || null;
    if (error && !errMsg) {
      try {
        const body = await (error as any)?.context?.json?.();
        errMsg = body?.error || null;
      } catch {
        try {
          const txt = await (error as any)?.context?.text?.();
          if (txt) errMsg = txt;
        } catch { /* ignore */ }
      }
      if (!errMsg) errMsg = error.message || 'Erro ao aceitar convite';
    }
    if (errMsg || !(data as any)?.success) {
      toast.error(errMsg || 'Erro ao aceitar convite');
      setSubmitting(false);
      return;
    }
    toast.success('Conta criada! Entrando...');
    const { data: sign, error: signInErr } = await supabase.auth.signInWithPassword({ email: invite.email, password });
    if (signInErr) {
      navigate(`/t/${invite.tenant?.slug || ''}/login`);
      return;
    }
    if (avatarFile && sign?.user?.id) {
      try {
        const ext = avatarFile.name.split('.').pop() || 'jpg';
        const path = `${sign.user.id}/avatar.${ext}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type });
        if (!upErr) {
          const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
          await supabase.from('profiles').update({ avatar_url: pub.publicUrl }).eq('id', sign.user.id);
        }
      } catch (e) {
        console.warn('avatar upload skipped', e);
      }
    }
    try {
      const key = `helpoint:email_confirmed_day:${sign?.user?.id}`;
      localStorage.setItem(key, new Date().toISOString().slice(0, 10));
    } catch { /* ignore */ }
    // Resolve slug do tenant com fallback via profile — garante painel interno
    let targetSlug = invite.tenant?.slug || '';
    if (!targetSlug && sign?.user?.id) {
      try {
        const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', sign.user.id).maybeSingle();
        if (prof?.tenant_id) {
          const { data: t } = await supabase.from('tenants').select('slug').eq('id', prof.tenant_id).maybeSingle();
          if (t?.slug) targetSlug = t.slug;
        }
      } catch { /* ignore */ }
    }
    navigate(targetSlug ? `/t/${targetSlug}/inicio` : '/inicio', { replace: true });
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-2" />
          <CardTitle>Convite indisponível</CardTitle>
          <CardDescription>{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" variant="outline" onClick={() => navigate('/login')}>Ir para login</Button>
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/20">
      <Card className="max-w-md w-full">
        <CardHeader>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
            <UserPlus className="w-5 h-5 text-primary" />
          </div>
          <CardTitle>Aceitar convite</CardTitle>
          <CardDescription>
            Você foi convidado para <b>{invite?.tenant?.name}</b>. Crie sua senha para entrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm space-y-1 bg-muted/40 rounded-md p-3">
            <div><span className="text-muted-foreground">E-mail:</span> <b>{invite?.email}</b></div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Papel:</span>
              <Badge variant="outline">{invite?.role}</Badge>
              {invite?.department && <Badge variant="outline">{invite.department}</Badge>}
            </div>
          </div>

          <div>
            <Label>Nome completo</Label>
            <Input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Seu nome" />
          </div>

          {/* Avatar opcional */}
          <div>
            <Label>Foto de perfil (opcional)</Label>
            <div className="flex items-center gap-3 mt-1">
              <div className="w-14 h-14 rounded-full bg-muted overflow-hidden flex items-center justify-center border">
                {avatarPreview
                  ? <img src={avatarPreview} alt="prévia" className="w-full h-full object-cover" />
                  : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
              <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                {avatarFile ? 'Trocar imagem' : 'Enviar foto'}
              </Button>
              {avatarFile && (
                <Button type="button" variant="ghost" size="icon" onClick={() => { setAvatarFile(null); setAvatarPreview(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Senha</Label>
              <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={handleSuggestPassword}>
                <Sparkles className="w-3 h-3 mr-1" /> Sugerir senha forte
              </Button>
            </div>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                tabIndex={-1}
              >
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <PasswordStrength password={password} />
          </div>

          <div>
            <Label>Confirmar senha</Label>
            <Input type={showPw ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} />
          </div>

          <Button className="w-full" disabled={submitting} onClick={submit}>
            {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
            Criar conta e entrar
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
