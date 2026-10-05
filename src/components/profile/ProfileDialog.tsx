import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { SETORES, isSetor } from '@/lib/setores';
import { expectRows, unwrap } from '@/lib/supabase-result';
import { toast } from 'sonner';
import { Loader2, Camera, Trash2, Mail, KeyRound, User as UserIcon, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import PasswordStrength, { evaluatePassword } from '@/components/auth/PasswordStrength';

/** Os tipos que o bucket `avatars` aceita (migration 20261203090000) — fora deles, recusa na tela. */
const TIPOS_DE_FOTO = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

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

  // E-mail das movimentações dos chamados (decisão do dono, 2026-10-02): ligado por padrão; quem
  // desliga continua vendo tudo na tela inicial (Lyra avisa). O banco lê esta coluna na fila de e-mail
  // (`chamado_emails_pendentes`, 20261121020000).
  const [receberEmail, setReceberEmail] = useState(true);
  const [salvandoReceber, setSalvandoReceber] = useState(false);
  useEffect(() => {
    if (!open || !user) return;
    let cancelado = false;
    (async () => {
      try {
        const linha = unwrap(await supabase.from('profiles').select('receber_email_chamados').eq('id', user.id).maybeSingle());
        if (!cancelado && linha) setReceberEmail(linha.receber_email_chamados);
      } catch (e) {
        toast.error('Erro ao ler a preferência de e-mail: ' + (e instanceof Error ? e.message : 'desconhecido'));
      }
    })();
    return () => { cancelado = true; };
  }, [open, user]);

  const handleReceberEmail = async (valor: boolean) => {
    if (!user) return;
    setSalvandoReceber(true);
    try {
      expectRows(
        await supabase.from('profiles').update({ receber_email_chamados: valor }).eq('id', user.id).select('id'),
        'a sua preferência de e-mail',
      );
      setReceberEmail(valor);
      toast.success(valor ? 'Você volta a receber e-mail dos seus chamados.' : 'E-mail dos chamados desligado. Os avisos continuam na tela inicial.');
    } catch (e) {
      toast.error('Erro ao salvar: ' + (e instanceof Error ? e.message : 'desconhecido'));
    } finally {
      setSalvandoReceber(false);
    }
  };

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
      // Regra 2 das cinco: o PostgREST responde 200 com zero linhas quando a
      // policy não casa. Sem o `expectRows` a tela dizia "Perfil atualizado"
      // para uma escrita que não aconteceu.
      expectRows(
        await supabase
          .from('profiles')
          .update({ full_name: fullName.trim(), department: department.trim() || null })
          .eq('id', user.id)
          .select('id'),
        'o seu perfil',
      );
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
    // 5 MB (decisão do dono, 2026-10-04); o bucket `avatars` recusa acima disso também.
    if (file.size > 5 * 1024 * 1024) { toast.error('A foto deve ter no máximo 5 MB.'); return; }
    if (!TIPOS_DE_FOTO.includes(file.type)) { toast.error('Envie a foto em JPG, PNG, WEBP, GIF ou HEIC.'); return; }
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
      expectRows(await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id).select('id'), 'a foto do perfil');
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
      expectRows(await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id).select('id'), 'a foto do perfil');
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
                  accept={TIPOS_DE_FOTO.join(',')}
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
              <Label htmlFor="perfil-setor">Setor</Label>
              {/* Era campo de digitar, e o banco ficou com `ti` (3 pessoas) e
                  `TI` (2) — dois setores para o mesmo setor. É por este campo
                  que o teto de gasto das compras encontra o setor, e a
                  comparação é de texto. Lista, não digitação (leva I). */}
              <Select
                value={department || 'nenhum'}
                onValueChange={(v) => setDepartment(v === 'nenhum' ? '' : v)}
              >
                <SelectTrigger id="perfil-setor">
                  <SelectValue placeholder="Escolha o setor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">— Sem setor —</SelectItem>
                  {SETORES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                  {/* Setor herdado que não está na lista continua selecionável,
                      senão salvar o nome apagaria o setor sem avisar. */}
                  {department && !isSetor(department) && (
                    <SelectItem value={department}>{department} (antigo)</SelectItem>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                É o setor que vai no centro de custo das compras que você abrir.
              </p>
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
            <div className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
              <div>
                <Label htmlFor="perfil-email-chamados">Receber e-mail das movimentações dos meus chamados</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Atribuído a você, respondido, aguardando seu retorno, resolvido e encerrado. Os avisos continuam na tela inicial (Lyra avisa).
                </p>
              </div>
              <Switch id="perfil-email-chamados" checked={receberEmail} disabled={salvandoReceber}
                onCheckedChange={handleReceberEmail} />
            </div>
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
      const { data, error } = await supabase.storage.from('avatars').createSignedUrl(path, 3600);
      if (error) { console.error(error); if (!cancelled) setUrl(null); return; }
      if (!cancelled) setUrl(data?.signedUrl || null);
    })();
    return () => { cancelled = true; };
  }, [path]);
  return url;
}
