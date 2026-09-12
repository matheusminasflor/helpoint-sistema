import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Boxes, Save, Info, History as HistoryIcon, RotateCcw, ShieldCheck, Shield } from 'lucide-react';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { useUserModules, useUpdateUserModules } from '@/hooks/useUserModules';
import {
  useAllAccessProfiles,
  useAllUserAccessProfiles,
  useAssignUserAccessProfile,
  useRemoveUserAccessProfile,
} from '@/hooks/useAccessProfiles';
import { DEPARTMENT_LIST, DEPARTMENT_SCHEMAS, type Department } from '@/config/access-profile-schemas';
import { useUserHistory, useRestoreUser, useUpdateUserRole, useUsers, type ProfileHistoryEntry, type AppRole } from '@/hooks/useUserManagement';
import { useAuth } from '@/contexts/AuthContext';
import type { ModuleId } from '@/types/database';

const MODULE_LABELS: Record<string, string> = {
  ti: 'TI',
  crm: 'CRM (vendas)',
  comercial: 'Comercial (chamados)',
  marketing: 'Marketing',
  rh: 'RH',
  financeiro: 'Financeiro',
  producao: 'Produção',
  expedicao: 'Expedição',
  educacional: 'Educacional',
  qualidade: 'Qualidade',
};

interface UserModulesEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

export function UserModulesEditor({ open, onOpenChange, userId, userName }: UserModulesEditorProps) {
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>([]);
  const [profileByDept, setProfileByDept] = useState<Record<string, string | null>>({});
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);

  const { role: currentUserRole } = useAuth();
  const { planConfig } = usePlanLimits();
  const { data: userModules, isLoading } = useUserModules(userId);
  const { data: allProfiles } = useAllAccessProfiles();
  const { data: allAssignments } = useAllUserAccessProfiles();
  const { data: allUsers } = useUsers();
  const { data: history } = useUserHistory(open ? userId : null);
  const updateModules = useUpdateUserModules();
  const updateRole = useUpdateUserRole();
  const assignProfile = useAssignUserAccessProfile();
  const removeProfile = useRemoveUserAccessProfile();
  const restoreUser = useRestoreUser();

  const targetUser = allUsers?.find(u => u.id === userId);
  const currentRole: AppRole = (targetUser?.role || 'member') as AppRole;
  const isOwner = currentRole === 'owner';
  const canPromote = !isOwner && (currentUserRole === 'owner' || currentUserRole === 'admin');

  const availableModules = planConfig?.available_modules || [];

  useEffect(() => {
    if (userModules) setSelectedModules(userModules);
  }, [userModules]);

  useEffect(() => {
    setIsCompanyAdmin(currentRole === 'admin' || currentRole === 'owner');
  }, [currentRole, open]);

  useEffect(() => {
    const map: Record<string, string | null> = {};
    for (const dept of DEPARTMENT_LIST) {
      const a = allAssignments?.find(t => t.user_id === userId && t.department === dept);
      map[dept] = a?.profile_id ?? null;
    }
    setProfileByDept(map);
  }, [allAssignments, userId]);

  const handleModuleToggle = (module: ModuleId) => {
    setSelectedModules(prev =>
      prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]
    );
  };

  const handleSave = async () => {
    await updateModules.mutateAsync({ userId, modules: selectedModules });
    for (const dept of DEPARTMENT_LIST) {
      const selected = selectedModules.includes(dept as ModuleId);
      const chosen = profileByDept[dept] ?? null;
      const current = allAssignments?.find(t => t.user_id === userId && t.department === dept);
      if (selected && chosen) {
        if (current?.profile_id !== chosen) {
          await assignProfile.mutateAsync({ user_id: userId, department: dept, profile_id: chosen });
        }
      } else if (current) {
        await removeProfile.mutateAsync({ user_id: userId, department: dept });
      }
    }
    // Atualiza papel global se mudou e não for owner
    if (!isOwner && canPromote) {
      const desiredRole: AppRole = isCompanyAdmin ? 'admin' : 'member';
      if (desiredRole !== currentRole) {
        await updateRole.mutateAsync({ userId, newRole: desiredRole });
      }
    }
    onOpenChange(false);
  };

  const permissionDepartments = DEPARTMENT_LIST.filter(d => selectedModules.includes(d as ModuleId));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Acessos de {userName}
          </DialogTitle>
          <DialogDescription>
            Configure módulos, perfis e veja o histórico de acessos.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="modules" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="modules">Módulos &amp; Permissões</TabsTrigger>
            <TabsTrigger value="history">
              <HistoryIcon className="h-3.5 w-3.5 mr-1" />
              Histórico {history && history.length > 0 && <Badge variant="secondary" className="ml-2">{history.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="modules" className="space-y-4 pt-4">
            {/* Admin da empresa */}
            <div className="rounded-md border p-3 space-y-1">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="h-4 w-4" />
                    {isOwner ? 'Dono da empresa' : 'Admin da empresa'}
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {isOwner
                      ? 'Donos têm acesso irrestrito e não podem ser rebaixados.'
                      : 'Quando ativado, este usuário gerencia faturamento, convites, integrações e todos os perfis de acesso.'}
                  </p>
                </div>
                <Switch
                  checked={isCompanyAdmin}
                  disabled={isOwner || !canPromote}
                  onCheckedChange={setIsCompanyAdmin}
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label>Módulos disponíveis</Label>
              <Badge variant="outline">{selectedModules.length} de {availableModules.length}</Badge>
            </div>


            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(MODULE_LABELS).map(([key, label]) => {
                  const isAvailable = availableModules.includes(key);
                  const isChecked = selectedModules.includes(key as ModuleId);
                  return (
                    <div
                      key={key}
                      className={`flex items-center gap-2 p-3 rounded-md border transition-colors ${
                        !isAvailable ? 'opacity-50 bg-muted' : isChecked ? 'border-primary bg-primary/5' : ''
                      }`}
                    >
                      <Checkbox
                        id={`um-${key}`}
                        checked={isChecked}
                        disabled={!isAvailable}
                        onCheckedChange={() => isAvailable && handleModuleToggle(key as ModuleId)}
                      />
                      <label htmlFor={`um-${key}`} className="text-sm font-medium flex-1 cursor-pointer">
                        {label}
                      </label>
                    </div>
                  );
                })}
              </div>
            )}

            {permissionDepartments.length > 0 && (
              <div className="p-3 rounded-md border bg-primary/5 space-y-3">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <Label className="text-sm">Perfis de acesso por departamento</Label>
                </div>
                {permissionDepartments.map((dept: Department) => (
                  <div key={dept} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{DEPARTMENT_SCHEMAS[dept].label}</Label>
                    <Select
                      value={profileByDept[dept] ?? 'none'}
                      onValueChange={(v) => setProfileByDept(prev => ({ ...prev, [dept]: v === 'none' ? null : v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um perfil" />
                      </SelectTrigger>
                      <SelectContent className="bg-background border shadow-md">
                        <SelectItem value="none">— Sem perfil específico —</SelectItem>
                        {(allProfiles || []).filter(p => p.department === dept).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  O perfil define o que a pessoa pode fazer dentro do departamento (criar/editar/fechar chamados,
                  ver inventário, folha, etc.). Os módulos acima definem apenas o que aparece no menu.
                  Gerencie os perfis em <strong>Configurações → Usuários e acessos → Perfis de acesso</strong>.
                </p>
              </div>
            )}

            <div className="flex items-start gap-2 p-3 bg-muted rounded-md border">
              <Info className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Módulos não contratados aparecem bloqueados. Para desativar este usuário totalmente, use a ação na tabela de usuários.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="history" className="pt-4">
            {!history || history.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                <HistoryIcon className="h-8 w-8 mx-auto mb-2 opacity-40" />
                Nenhum arquivamento registrado para este usuário.
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((h: ProfileHistoryEntry) => {
                  const snap = h.snapshot || {};
                  const mods: string[] = snap.modules || [];
                  return (
                    <div key={h.id} className="p-3 rounded-md border">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <p className="text-sm font-medium">
                            Desativado em {format(new Date(h.archived_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                          </p>
                          {h.reason && <p className="text-xs text-muted-foreground">Motivo: {h.reason}</p>}
                          <div className="flex flex-wrap gap-1 pt-1">
                            {mods.length > 0 ? mods.map(m => (
                              <Badge key={m} variant="secondary" className="text-[10px]">
                                {MODULE_LABELS[m] || m}
                              </Badge>
                            )) : <span className="text-xs text-muted-foreground">Sem módulos</span>}
                          </div>
                          {h.restored_at && (
                            <p className="text-xs text-green-600 pt-1">
                              Restaurado em {format(new Date(h.restored_at), 'dd/MM/yyyy', { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        {!h.restored_at && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreUser.mutate(h.user_id)}
                            disabled={restoreUser.isPending}
                          >
                            <RotateCcw className="h-3.5 w-3.5 mr-1" />
                            Restaurar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={updateModules.isPending || assignProfile.isPending}>
            <Save className="h-4 w-4 mr-2" />
            {updateModules.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
