import { MODULE_LABELS } from '@/types/database';
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

// O mapa vem de `@/types/database`, e não de uma cópia local: esta tela é o
// **único** lugar do sistema que grava `user_module_access`, e a cópia daqui
// era o que decidia quais caixas existem. Módulo novo entrava em
// `ALL_MODULES`, entrava em `plan_config.available_modules` por migration — e
// não aparecia para conceder, porque a lista renderizada era outra. Foi o que
// aconteceu com a Diretoria (L5).
// Desde a ADR-010 não há mais "módulo contratado":
// MODULE_LABELS é a lista inteira, e toda ela pode ser concedida.

interface UserModulesEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

/**
 * UMA ESCOLHA POR SETOR (LEVA P, decisão do dono em 2026-09-28). Nos setores que têm perfil de
 * acesso, a pessoa tem "Sem acesso" ou um perfil — e escolher o perfil É dar o módulo. Antes eram
 * dois passos (marcar o módulo, depois escolher o perfil) e um terceiro estado sem nome: módulo
 * marcado sem perfil, em que a pessoa via o menu e o banco lhe negava tudo
 * (`tem_permissao` responde falso sem perfil). A migration `20261115040000` deu o perfil padrão a
 * quem estava assim.
 *
 * Os acessos que NÃO são setor com perfil — Diretoria, CRM, Produção, Expedição — continuam
 * como caixa de marcar: não há perfil para escolher neles.
 */
const OUTROS_ACESSOS = (Object.keys(MODULE_LABELS) as ModuleId[])
  .filter((m) => !(DEPARTMENT_LIST as readonly string[]).includes(m));

export function UserModulesEditor({ open, onOpenChange, userId, userName }: UserModulesEditorProps) {
  const [selectedModules, setSelectedModules] = useState<ModuleId[]>([]);
  const [profileByDept, setProfileByDept] = useState<Record<string, string | null>>({});
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);

  const { role: currentUserRole } = useAuth();
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

  useEffect(() => {
    if (userModules) setSelectedModules(userModules);
  }, [userModules]);

  useEffect(() => {
    setIsCompanyAdmin(currentRole === 'admin' || currentRole === 'owner');
  }, [currentRole, open]);

  // A escolha de cada setor: o perfil atribuído; se a pessoa tem o módulo sem perfil, o perfil
  // padrão do setor (é o que a migration fez no banco, e é o que se grava ao salvar); senão nada.
  useEffect(() => {
    const map: Record<string, string | null> = {};
    for (const dept of DEPARTMENT_LIST) {
      const a = allAssignments?.find(t => t.user_id === userId && t.department === dept);
      const temModulo = (userModules ?? []).includes(dept as ModuleId);
      const padrao = (allProfiles ?? []).find(p => p.department === dept && p.is_default)?.id ?? null;
      map[dept] = a?.profile_id ?? (temModulo ? padrao : null);
    }
    setProfileByDept(map);
  }, [allAssignments, allProfiles, userModules, userId]);

  const handleModuleToggle = (module: ModuleId) => {
    setSelectedModules(prev =>
      prev.includes(module) ? prev.filter(m => m !== module) : [...prev, module]
    );
  };

  const handleSave = async () => {
    // O módulo de um setor existe exatamente quando há um perfil escolhido para ele.
    const modulos: ModuleId[] = [
      ...selectedModules.filter(m => OUTROS_ACESSOS.includes(m)),
      ...DEPARTMENT_LIST.filter(d => profileByDept[d]).map(d => d as ModuleId),
    ];
    await updateModules.mutateAsync({ userId, modules: modulos });
    for (const dept of DEPARTMENT_LIST) {
      const selected = modulos.includes(dept as ModuleId);
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

  const setoresComAcesso = DEPARTMENT_LIST.filter(d => profileByDept[d]).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Boxes className="h-5 w-5 text-primary" />
            Acessos de {userName}
          </DialogTitle>
          <DialogDescription>
            Em cada setor: sem acesso, ou o perfil que diz o que a pessoa pode fazer lá.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="modules" className="mt-2">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="modules">Acessos</TabsTrigger>
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

            {isLoading ? (
              <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-muted animate-pulse rounded-md" />)}</div>
            ) : (
              <>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" />Setores</Label>
                    <Badge variant="outline">{setoresComAcesso} de {DEPARTMENT_LIST.length} com acesso</Badge>
                  </div>
                  {DEPARTMENT_LIST.map((dept: Department) => {
                    const escolhido = profileByDept[dept] ?? null;
                    return (
                      <div
                        key={dept}
                        className={`grid grid-cols-1 sm:grid-cols-[1fr_220px] items-center gap-2 p-2.5 rounded-md border transition-colors ${
                          escolhido ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <span className="text-sm font-medium">{DEPARTMENT_SCHEMAS[dept].label}</span>
                        <Select
                          value={escolhido ?? 'none'}
                          onValueChange={(v) => setProfileByDept(prev => ({ ...prev, [dept]: v === 'none' ? null : v }))}
                        >
                          <SelectTrigger aria-label={`Acesso ao setor ${DEPARTMENT_SCHEMAS[dept].label}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-background border shadow-md">
                            <SelectItem value="none">Sem acesso</SelectItem>
                            {(allProfiles || []).filter(p => p.department === dept).map(p => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    );
                  })}
                  {isCompanyAdmin && (
                    <p className="text-xs text-foreground rounded-md border p-2 badge-warning">
                      Admin da empresa já entra em todos os setores com tudo liberado. As escolhas acima só
                      passam a valer se a pessoa deixar de ser admin.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    O perfil diz o que a pessoa pode fazer no setor. Os perfis se editam em{' '}
                    <strong>Configurações → Pessoas e acessos → Perfis de acesso</strong>.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Outros acessos</Label>
                  {OUTROS_ACESSOS.map((key) => {
                    const isChecked = selectedModules.includes(key);
                    return (
                      <div
                        key={key}
                        className={`flex items-center gap-2 p-2.5 rounded-md border transition-colors ${
                          isChecked ? 'border-primary bg-primary/5' : ''
                        }`}
                      >
                        <Checkbox
                          id={`um-${key}`}
                          checked={isChecked}
                          onCheckedChange={() => handleModuleToggle(key)}
                        />
                        <label htmlFor={`um-${key}`} className="text-sm font-medium flex-1 cursor-pointer">
                          {MODULE_LABELS[key]}
                        </label>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex items-start gap-2 p-3 bg-muted rounded-md border">
              <Info className="h-4 w-4 text-primary mt-0.5" />
              <p className="text-xs text-muted-foreground">
                Para desativar a pessoa por completo, use a ação na tabela de pessoas.
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
                              <Badge key={m} variant="secondary" className="text-[12px]">
                                {MODULE_LABELS[m] || m}
                              </Badge>
                            )) : <span className="text-xs text-muted-foreground">Sem módulos</span>}
                          </div>
                          {h.restored_at && (
                            <p className="text-xs text-status-success pt-1">
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
