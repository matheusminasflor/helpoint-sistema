import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { useAllAccessProfiles, useAllUserAccessProfiles } from '@/hooks/useAccessProfiles';
import { DEPARTMENT_LIST, DEPARTMENT_SCHEMAS, type Department } from '@/config/access-profile-schemas';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { unwrap } from '@/lib/supabase-result';
import { useQueryState } from '@/hooks/useQueryState';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AccessProfilesHub } from '@/components/access/AccessProfilesHub';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { 
  Users, 
  Search, 
  Edit2, 
  UserCheck, 
  UserX,
  Save,
  UserPlus,
  Boxes,
  Shield,
} from 'lucide-react';
import { 
  useUsers, 
  useUpdateUserRole, 
  useToggleUserActive, 
  useUpdateUserProfile,
  useArchiveUser,
  useRestoreUser,
  useUserHistory,
  AppRole,
  ROLE_LABELS,
} from '@/hooks/useUserManagement';

import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { SETORES, normalizarSetor } from '@/lib/setores';
import { InviteUserDialog } from '@/components/settings/InviteUserDialog';
import { InvitesPanel } from '@/components/settings/InvitesPanel';
import { UserModulesEditor } from '@/components/settings/UserModulesEditor';
import { useTenantSettings, useUpdateTenantSettings } from '@/hooks/useTenantSettings';
import { SACCustomersTab } from '@/components/settings/SACCustomersTab';


const ROLE_HIERARCHY: AppRole[] = ['owner', 'admin', 'manager', 'member', 'viewer'];

export default function SystemSettings() {
  const [searchQuery, setSearchQuery] = useQueryState<string>('q', '');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', department: '', job_title: '' });
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [modulesEditorOpen, setModulesEditorOpen] = useState(false);
  const [selectedUserForModules, setSelectedUserForModules] = useState<{ id: string; name: string } | null>(null);
  
  const { role: currentUserRole, tenantId } = useAuth();
  const { data: users, isLoading: usersLoading } = useUsers();
  // Em que setores cada pessoa entra, e com qual perfil (etapa 4 · Configurações, 2026-10-24): antes era preciso
  // abrir uma por uma.
  const { data: perfis = [] } = useAllAccessProfiles();
  const { data: atribuicoes = [] } = useAllUserAccessProfiles();
  const [setorFiltro, setSetorFiltro] = useQueryState<string>('setor', '');
  const nomeDoPerfil = new Map(perfis.map((p) => [p.id, p.name]));
  const setoresDe = (id: string) => atribuicoes.filter((a) => a.user_id === id && a.profile_id)
    .map((a) => ({ setor: a.department, rotulo: DEPARTMENT_SCHEMAS[a.department as Department]?.label ?? a.department, perfil: nomeDoPerfil.get(a.profile_id!) ?? '' }));
  const { data: tenantSettings } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const updateRole = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const updateProfile = useUpdateUserProfile();
  const archiveUser = useArchiveUser();
  const restoreUser = useRestoreUser();


  const filteredUsers = users?.filter(user => (
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchQuery.toLowerCase())
  ) && (!setorFiltro || setoresDe(user.id).some((s) => s.setor === setorFiltro)));

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    updateRole.mutate({ userId, newRole });
  };

  // Desativar tira o acesso da pessoa: pergunta antes, com o motivo (Cancelar não desativa).
  const [desativando, setDesativando] = useState<{ id: string; nome: string } | null>(null);
  const [motivoDesativar, setMotivoDesativar] = useState('');
  const [destinoCarteira, setDestinoCarteira] = useState('');
  const { data: carteirasDela = [] } = useQuery({
    queryKey: ['carteiras-da-pessoa', tenantId, desativando?.id],
    enabled: !!desativando,
    queryFn: async () => ((unwrap(await supabase.from('com_carteira_membros').select('carteira').eq('user_id', desativando!.id)) ?? []) as { carteira: string }[])
      .map((r) => r.carteira),
  });
  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    if (currentActive) {
      const u = users?.find((x) => x.id === userId);
      setMotivoDesativar('');
      setDestinoCarteira('');
      setDesativando({ id: userId, nome: u?.full_name || u?.email || 'esta pessoa' });
    } else {
      // reativar — tentar restore primeiro; se não houver snapshot, fallback simples
      try {
        await restoreUser.mutateAsync(userId);
      } catch {
        toggleActive.mutate({ userId, isActive: true });
      }
    }
  };


  const handleEditUser = (user: NonNullable<typeof users>[number]) => {
    setEditingUser(user.id);
    setEditForm({
      full_name: user.full_name || '',
      // Setor antigo fora da lista (ex.: "TI" digitado) vira o valor certo, ou "sem setor".
      department: normalizarSetor(user.department) ?? '',
      job_title: user.job_title || '',
    });
  };

  const handleSaveEdit = () => {
    if (editingUser) {
      updateProfile.mutate({ userId: editingUser, data: editForm });
      setEditingUser(null);
    }
  };

  const handleOpenModulesEditor = (user: NonNullable<typeof users>[number]) => {
    setSelectedUserForModules({ id: user.id, name: user.full_name || user.email });
    setModulesEditorOpen(true);
  };

  const canEditRole = (targetRole: AppRole | null) => {
    if (!currentUserRole || !targetRole) return false;
    const currentIdx = ROLE_HIERARCHY.indexOf(currentUserRole);
    const targetIdx = ROLE_HIERARCHY.indexOf(targetRole);
    return currentIdx < targetIdx;
  };

  // A janela de acessos abre para todos menos o dono (LEVA P). Antes não abria para admin — e
  // era por isso que a chave "Admin da empresa" precisava estar TAMBÉM na tabela: senão ninguém
  // tirava um admin. Agora a chave mora só na janela, e a janela abre para ele.
  const canEditModules = (targetRole: AppRole | null) => targetRole !== 'owner';

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Pessoas e acessos"
        description="Quem entra no sistema, e em cada setor: sem acesso ou com qual perfil"
        actions={
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar usuário
          </Button>
        }
      />

      <div className="space-y-6 p-6">
      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users" className="gap-2">
            <Users className="h-4 w-4" />
            Usuários
          </TabsTrigger>
          <TabsTrigger value="profiles" className="gap-2">
            <Shield className="h-4 w-4" />
            Perfis de acesso
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6 pt-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Usuários</CardTitle>
                    <CardDescription>
                      {users?.length || 0} usuários cadastrados
                    </CardDescription>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select value={setorFiltro} onChange={(e) => setSetorFiltro(e.target.value)} aria-label="Filtrar por setor"
                    className="h-9 rounded-md border border-input bg-background px-2 text-sm">
                    <option value="">Todos os setores</option>
                    {DEPARTMENT_LIST.map((d) => <option key={d} value={d}>{DEPARTMENT_SCHEMAS[d].label}</option>)}
                  </select>
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Buscar usuário…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {usersLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Setores · perfil</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers?.map((user) => {
                      const role = user.role || 'member';
                      const isOwner = role === 'owner';
                      const isAdmin = role === 'admin';
                      return (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{user.full_name || '-'}</span>
                            <span className="text-xs text-muted-foreground">{user.email}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span>{user.department || '-'}</span>
                            {user.job_title && (
                              <span className="text-xs text-muted-foreground">{user.job_title}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-[13px]">
                          {setoresDe(user.id).length === 0
                            ? <span className="text-muted-foreground">nenhum</span>
                            : setoresDe(user.id).map((s) => <span key={s.setor} className="block whitespace-nowrap">{s.rotulo} · <span className="text-muted-foreground">{s.perfil}</span></span>)}
                        </TableCell>
                        <TableCell>
                          {/* Só o selo. Tornar admin é na janela de acessos (o ícone de caixas),
                              junto com os setores — era a mesma chave em dois lugares. */}
                          <Badge
                            variant={isOwner ? 'default' : isAdmin ? 'secondary' : 'outline'}
                            className="text-xs"
                          >
                            {isOwner ? 'Dono' : isAdmin ? 'Admin' : 'Usuário'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.is_active ? "default" : "secondary"}>
                            {user.is_active ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEditUser(user)}
                              title="Editar usuário"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            {canEditModules(user.role) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleOpenModulesEditor(user)}
                                title="Acessos: setores, perfis e admin da empresa"
                              >
                                <Boxes className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleActive(user.id, user.is_active || false)}
                              title={user.is_active ? 'Desativar usuário' : 'Ativar usuário'}
                            >
                              {user.is_active ? (
                                <UserX className="h-4 w-4 text-destructive" />
                              ) : (
                                <UserCheck className="h-4 w-4 text-primary" />
                              )}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Invites panel */}
          <InvitesPanel />

          <AlertDialog open={!!desativando} onOpenChange={(o) => !o && setDesativando(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Desativar {desativando?.nome}?</AlertDialogTitle>
                <AlertDialogDescription>
                  A pessoa deixa de entrar no sistema e perde os acessos dos setores. O que ela tinha fica guardado no
                  histórico e volta se você a reativar.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <Textarea value={motivoDesativar} onChange={(e) => setMotivoDesativar(e.target.value)} rows={2}
                placeholder="Motivo (opcional): desligamento, troca de setor…" aria-label="Motivo da desativação" />
              {/* Vendedora com carteira: para quem vão os clientes (dono, 2026-10-28; `com_vendedora_sai`). */}
              {carteirasDela.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="destino-da-carteira" className="text-sm font-medium">
                    Para quem vão as carteiras dela ({carteirasDela.join(', ')})?
                  </label>
                  <select id="destino-da-carteira" value={destinoCarteira} onChange={(e) => setDestinoCarteira(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                    <option value="">Escolha a pessoa</option>
                    {(users ?? []).filter((x) => x.is_active && x.id !== desativando?.id)
                      .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'pt-BR'))
                      .map((x) => <option key={x.id} value={x.id}>{x.full_name || x.email}</option>)}
                  </select>
                  <p className="text-[12px] text-muted-foreground">As vendas e os lançamentos antigos continuam no nome dela.</p>
                </div>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  disabled={carteirasDela.length > 0 && !destinoCarteira}
                  onClick={async () => {
                    if (!desativando) return;
                    const quem = desativando;
                    setDesativando(null);
                    try {
                      // Antes de desativar: a carteira passa e ela deixa de ser vendedora ativa (sem carteira, só isso).
                      unwrap(await supabase.rpc('com_vendedora_sai' as never,
                        { p_pessoa: quem.id, p_destino: destinoCarteira || null } as never));
                    } catch (e) {
                      toast.error(`Não passou a carteira: ${e instanceof Error ? e.message : 'erro'}. A pessoa não foi desativada.`);
                      return;
                    }
                    archiveUser.mutate({ userId: quem.id, reason: motivoDesativar.trim() || undefined });
                  }}>
                  Desativar
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* SAC customers admin */}
          {currentUserRole && ['owner', 'admin', 'manager'].includes(currentUserRole) && (
            <SACCustomersTab />
          )}
        </TabsContent>

        <TabsContent value="profiles" className="pt-4">
          <AccessProfilesHub />
        </TabsContent>
      </Tabs>

      {/* Edit User Dialog */}
      <Dialog open={!!editingUser} onOpenChange={() => setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Usuário</DialogTitle>
            <DialogDescription>
              Atualize as informações do usuário
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nome Completo</Label>
              <Input
                id="full_name"
                value={editForm.full_name}
                onChange={(e) => setEditForm(prev => ({ ...prev, full_name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="department">Departamento</Label>
              {/* Lista, não texto livre (2026-10-06): o banco só aceita os setores de `SETORES`
                  (`profiles_department_conhecido`), e o campo digitado barrava até a troca de cargo. */}
              <Select
                value={editForm.department || 'nenhum'}
                onValueChange={(v) => setEditForm(prev => ({ ...prev, department: v === 'nenhum' ? '' : v }))}
              >
                <SelectTrigger id="department"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">— Sem setor —</SelectItem>
                  {SETORES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="job_title">Cargo</Label>
              <Input
                id="job_title"
                value={editForm.job_title}
                onChange={(e) => setEditForm(prev => ({ ...prev, job_title: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateProfile.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      {/* Invite User Dialog */}
      <InviteUserDialog
        open={inviteDialogOpen} 
        onOpenChange={setInviteDialogOpen} 
      />

      {/* User Modules Editor */}
      {selectedUserForModules && (
        <UserModulesEditor
          open={modulesEditorOpen}
          onOpenChange={setModulesEditorOpen}
          userId={selectedUserForModules.id}
          userName={selectedUserForModules.name}
        />
      )}
      </div>
    </div>
  );
}
