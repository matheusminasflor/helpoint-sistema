import { useState } from 'react';
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
import { InviteUserDialog } from '@/components/settings/InviteUserDialog';
import { InvitesPanel } from '@/components/settings/InvitesPanel';
import { UserModulesEditor } from '@/components/settings/UserModulesEditor';
import { useTenantSettings, useUpdateTenantSettings } from '@/hooks/useTenantSettings';
import { SACCustomersTab } from '@/components/settings/SACCustomersTab';


const ROLE_HIERARCHY: AppRole[] = ['owner', 'admin', 'manager', 'member', 'viewer'];

export default function SystemSettings() {
  const [searchQuery, setSearchQuery] = useState('');
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ full_name: '', department: '', job_title: '' });
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [modulesEditorOpen, setModulesEditorOpen] = useState(false);
  const [selectedUserForModules, setSelectedUserForModules] = useState<{ id: string; name: string } | null>(null);
  
  const { role: currentUserRole } = useAuth();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: tenantSettings } = useTenantSettings();
  const updateSettings = useUpdateTenantSettings();
  const updateRole = useUpdateUserRole();
  const toggleActive = useToggleUserActive();
  const updateProfile = useUpdateUserProfile();
  const archiveUser = useArchiveUser();
  const restoreUser = useRestoreUser();


  const filteredUsers = users?.filter(user => 
    user.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.department?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRoleChange = (userId: string, newRole: AppRole) => {
    updateRole.mutate({ userId, newRole });
  };

  const handleToggleAdmin = (userId: string, currentRole: AppRole | null, makeAdmin: boolean) => {
    if (currentRole === 'owner') return; // dono não muda
    updateRole.mutate({ userId, newRole: makeAdmin ? 'admin' : 'member' });
  };

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    if (currentActive) {
      // desativar = arquivar snapshot + revogar acessos
      const reason = window.prompt('Motivo do desligamento (opcional):') ?? undefined;
      archiveUser.mutate({ userId, reason });
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
      department: user.department || '',
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

  // Check if user can edit modules (only for non-admin users)
  const canEditModules = (targetRole: AppRole | null) => {
    return targetRole && !['owner', 'admin'].includes(targetRole);
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        title="Usuários e acessos"
        description="Gerencie usuários e suas permissões de acesso"
        actions={
          <Button onClick={() => setInviteDialogOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Convidar usuário
          </Button>
        }
      />

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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Usuários</CardTitle>
                    <CardDescription>
                      {users?.length || 0} usuários cadastrados
                    </CardDescription>
                  </div>
                </div>
                <div className="relative w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar usuário..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
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
                      const canPromote =
                        !isOwner &&
                        currentUserRole &&
                        ['owner', 'admin'].includes(currentUserRole);
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
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={isOwner ? 'default' : isAdmin ? 'secondary' : 'outline'}
                              className="text-xs"
                            >
                              {isOwner ? 'Dono' : isAdmin ? 'Admin' : 'Usuário'}
                            </Badge>
                            {!isOwner && (
                              <div className="flex items-center gap-1.5">
                                <Switch
                                  checked={isAdmin}
                                  disabled={!canPromote || updateRole.isPending}
                                  onCheckedChange={(v) => handleToggleAdmin(user.id, role, v)}
                                />
                                <span className="text-[11px] text-muted-foreground">
                                  Admin da empresa
                                </span>
                              </div>
                            )}
                          </div>
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
                                title="Gerenciar módulos"
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

          {/* Department Isolation Card */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle>Isolamento por Setor</CardTitle>
                  <CardDescription>
                    Controle a visibilidade de chamados entre departamentos
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-sm font-medium">Ativar isolamento por setor</p>
                  <p className="text-xs text-muted-foreground">
                    Quando ativado, técnicos só veem chamados do seu próprio departamento
                  </p>
                </div>
                <Switch
                  checked={tenantSettings?.helpdesk?.departmentIsolation ?? true}
                  onCheckedChange={(checked) =>
                    updateSettings.mutate({
                      helpdesk: {
                        ...tenantSettings?.helpdesk,
                        departmentIsolation: checked,
                      },
                    })
                  }
                />
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4 border-t pt-3">
                <li>Técnicos de TI veem apenas chamados de TI</li>
                <li>Técnicos de Marketing veem apenas chamados de Marketing</li>
                <li>Menções (@) concedem acesso a chamados de outro setor</li>
                <li>Supervisores e Administradores sempre veem todos os chamados</li>
              </ul>
            </CardContent>
          </Card>

          {/* Invites panel */}
          <InvitesPanel />

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
              <Input
                id="department"
                value={editForm.department}
                onChange={(e) => setEditForm(prev => ({ ...prev, department: e.target.value }))}
              />
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
  );
}
