import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { Loader2, Camera, Trash2, Mail, KeyRound, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import PasswordStrength, { evaluatePassword } from '@/components/auth/PasswordStrength';

interface Props { open: boolean; onOpenChange: (o: boolean) => void; }

function getInitials(name?: string | null, email?: string | null) {
  const src = name?.trim() || email || '?';
  return src
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function ProfileDialog({ open, onOpenChange }: Props) {
  const { user, profile, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  // Geral
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [department, setDepartment] = useState(profile?.department || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile?.avatar_url || null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Senha
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  // E-mail
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const [savingEmail, setSavingEmail] = useState(false);

  useEffect(() => {
    if (open) {
      setFullName(profile?.full_name || '');
      setDepartment(profile?.department || '');
      setAvatarUrl(profile?.avatar_url || null);
      setNewEmail(user?.email || '');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    }
  }, [open, profile, user]);

  const signedAvatarUrl = useSignedAvatar(avatarUrl);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim(), department: department.trim() || null })
        .eq('id', user.id);
      if (error) throw error;
      await refreshProfile();
      toast.success('Perfil atualizado.');
    } catch (e: any) {
      toast.error('Erro ao salvar perfil: ' + (e?.message || 'desconhecido'));
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePickFile = () => fileRef.current?.click();

  const handleUploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 4 * 1024 * 1024) { toast.error('Foto deve ter no máximo 4MB.'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Envie uma imagem.'); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true, contentType: file.type,
      });
      if (upErr) throw upErr;
      // remove anteriores
      if (avatarUrl && avatarUrl !== path) {
        await supabase.storage.from('avatars').remove([avatarUrl]).catch(() => {});
      }
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id);
      if (dbErr) throw dbErr;
      setAvatarUrl(path);
      await refreshProfile();
      toast.success('Foto atualizada.');
    } catch (e: any) {
      toast.error('Erro ao enviar foto: ' + (e?.message || 'desconhecido'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    if (!user || !avatarUrl) return;
    setUploadingAvatar(true);
    try {
      await supabase.storage.from('avatars').remove([avatarUrl]).catch(() => {});
      const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id);
      if (error) throw error;
      setAvatarUrl(null);
      await refreshProfile();
      toast.success('Foto removida.');
    } catch (e: any) {
      toast.error('Erro: ' + (e?.message || 'desconhecido'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleChangePassword = async () => {
    if (!user?.email) return;
    if (newPwd.length < 8) { toast.error('Nova senha deve ter pelo menos 8 caracteres.'); return; }
    if (newPwd !== confirmPwd) { toast.error('As senhas não coincidem.'); return; }
    const eval_ = evaluatePassword(newPwd);
    if (eval_.level < 2) { toast.error('A senha está fraca. Use letras, números e símbolos.'); return; }

    setSavingPwd(true);
    try {
      // valida senha atual
      const { error: signErr } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPwd });
      if (signErr) throw new Error('Senha atual incorreta.');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
      toast.success('Senha alterada com sucesso.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao alterar senha.');
    } finally {
      setSavingPwd(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!newEmail || newEmail === user?.email) {
      toast.error('Informe um e-mail diferente do atual.');
      return;
    }
    setSavingEmail(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success('Enviamos um link de confirmação para o novo e-mail. Acesse-o para concluir a troca.');
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao trocar e-mail.');
    } finally {
      setSavingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Meu perfil</DialogTitle>
          <DialogDescription>Atualize sua foto, dados pessoais e credenciais.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="geral" className="w-full">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="geral"><UserIcon className="w-3.5 h-3.5 mr-1" />Geral</TabsTrigger>
            <TabsTrigger value="senha"><KeyRound className="w-3.5 h-3.5 mr-1" />Senha</TabsTrigger>
            <TabsTrigger value="email"><Mail className="w-3.5 h-3.5 mr-1" />E-mail</TabsTrigger>
          </TabsList>

          <TabsContent value="geral" className="space-y-4 pt-4">
            <div className="flex items-center gap-4">
              <Avatar className="w-20 h-20">
                {signedAvatarUrl && <AvatarImage src={signedAvatarUrl} alt={fullName || 'avatar'} />}
                <AvatarFallback>{getInitials(fullName, user?.email)}</AvatarFallback>
              </Avatar>
              <div className="flex flex-col gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleUploadAvatar(e.target.files[0])}
                />
                <Button type="button" size="sm" variant="outline" onClick={handlePickFile} disabled={uploadingAvatar}>
                  {uploadingAvatar ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Camera className="w-3.5 h-3.5 mr-1" />}
                  {avatarUrl ? 'Trocar foto' : 'Enviar foto'}
                </Button>
                {avatarUrl && (
                  <Button type="button" size="sm" variant="ghost" onClick={handleRemoveAvatar} disabled={uploadingAvatar}>
                    <Trash2 className="w-3.5 h-3.5 mr-1" />Remover
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Setor / Departamento</Label>
              <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Ex.: Comercial, TI..." />
            </div>

            <Button onClick={handleSaveProfile} disabled={savingProfile} className="w-full">
              {savingProfile && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar alterações
            </Button>
          </TabsContent>

          <TabsContent value="senha" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label>Senha atual</Label>
              <Input type="password" value={currentPwd} onChange={(e) => setCurrentPwd(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Nova senha</Label>
              <div className="relative">
                <Input
                  type={showPwd ? 'text' : 'password'}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  minLength={8}
                />
                <button type="button" onClick={() => setShowPwd(s => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <PasswordStrength password={newPwd} />
            </div>
            <div className="space-y-2">
              <Label>Confirmar nova senha</Label>
              <Input type="password" value={confirmPwd} onChange={(e) => setConfirmPwd(e.target.value)} />
            </div>
            <Button onClick={handleChangePassword} disabled={savingPwd} className="w-full">
              {savingPwd && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Alterar senha
            </Button>
          </TabsContent>

          <TabsContent value="email" className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Ao trocar o e-mail, enviaremos um link de confirmação para o novo endereço. A troca só é efetivada após clicar nesse link.
            </p>
            <div className="space-y-2">
              <Label>Novo e-mail</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
            <Button onClick={handleChangeEmail} disabled={savingEmail} className="w-full">
              {savingEmail && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Enviar confirmação
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function useSignedAvatar(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!path) { setUrl(null); return; }
    (async () => {
      const { data } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      if (!cancelled) setUrl(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  return url;
}
