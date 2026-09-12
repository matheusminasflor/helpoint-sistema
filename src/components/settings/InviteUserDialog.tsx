import { useState } from 'react';
import { z } from 'zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Mail, Check, X, Shield, Building2, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { cn } from '@/lib/utils';
import {
  type AppRole,
  ROLE_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_CAPABILITIES,
} from '@/hooks/useUserManagement';
import { useAccessProfiles } from '@/hooks/useAccessProfiles';
import { AccessProfileEditor } from '@/components/access/AccessProfileEditor';
import { DEPARTMENT_LIST, type Department, type PermissionsMap } from '@/config/access-profile-schemas';

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

const DEPARTMENT_OPTIONS = [
  { value: 'ti', label: 'TI' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'comercial', label: 'Comercial' },
  { value: 'rh', label: 'RH' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'producao', label: 'Produção' },
  { value: 'expedicao', label: 'Expedição' },
  { value: 'educacional', label: 'Educacional' },
  { value: 'qualidade', label: 'Qualidade' },
];

const inviteSchema = z.object({
  email: z.string().email('Email inválido').max(255),
});

interface InviteUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [email, setEmail] = useState('');
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedProfileId, setSelectedProfileId] = useState<string>('none');
  const [profileOverrides, setProfileOverrides] = useState<PermissionsMap>({});
  const [overrideEditorOpen, setOverrideEditorOpen] = useState(false);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [errors, setErrors] = useState<{ email?: string }>({});

  const selectedRole: AppRole = isCompanyAdmin ? 'admin' : 'member';

  const { tenantId, role: currentUserRole } = useAuth();
  const { planConfig } = usePlanLimits();
  const queryClient = useQueryClient();

  const availableModules = planConfig?.available_modules || [];

  const isProfileDepartment = (DEPARTMENT_LIST as string[]).includes(selectedDepartment);
  const departmentForProfile = (isProfileDepartment ? selectedDepartment : null) as Department | null;
  const { data: deptProfiles } = useAccessProfiles((departmentForProfile ?? 'ti') as Department);
  const profilesForDept = isProfileDepartment ? (deptProfiles || []) : [];

  // Apenas admins/donos podem promover outros a admin
  const canPromoteAdmin = currentUserRole === 'owner' || currentUserRole === 'admin';

  const createInvite = useMutation({
    mutationFn: async () => {
      const validation = inviteSchema.safeParse({ email });
      if (!validation.success) {
        setErrors({ email: validation.error.errors[0]?.message });
        throw new Error('Validação falhou');
      }
      setErrors({});

      const { data, error } = await supabase.functions.invoke('invite-signup', {
        body: {
          action: 'create_invite',
          email: email.trim().toLowerCase(),
          role: selectedRole,
          department: selectedDepartment || undefined,
          access_profile_id: selectedProfileId !== 'none' ? selectedProfileId : undefined,
          access_profile_overrides:
            Object.keys(profileOverrides).length > 0 ? profileOverrides : undefined,
        },
      });

      if (error) throw new Error(error.message || 'Falha ao enviar convite');
      return data as any;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['tenant-invites'] });
      if (data?.email_sent) {
        toast.success('Convite enviado', {
          description: `${email} receberá o link por e-mail.`,
        });
      } else {
        toast.warning('Convite criado, mas e-mail não enviado', {
          description: data?.error || 'Falha ao enviar pelo Resend. O convite ficou na lista para reenviar.',
          duration: 8000,
        });
      }
      resetForm();
      onOpenChange(false);
    },
    onError: (error: Error) => {
      if (error.message !== 'Validação falhou') {
        toast.error('Erro ao enviar convite', { description: error.message });
      }
    },
  });

  const resetForm = () => {
    setEmail('');
    setIsCompanyAdmin(false);
    setSelectedDepartment('');
    setSelectedProfileId('none');
    setProfileOverrides({});
    setErrors({});
  };



  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Convidar Novo Usuário
          </DialogTitle>
          <DialogDescription>
            Envie um convite para um novo usuário se juntar ao sistema.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6 py-4">
            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                Email do Usuário
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="usuario@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={errors.email ? 'border-destructive' : ''}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email}</p>
              )}
            </div>

            {/* Department */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                Departamento
              </Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o departamento" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENT_OPTIONS.map(dept => (
                    <SelectItem key={dept.value} value={dept.value}>
                      {dept.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                O departamento define quais chamados e dados o usuário visualiza.
              </p>
            </div>

            {/* Access Profile (only for departments that support it) */}
            {isProfileDepartment && departmentForProfile && (
              <div className="space-y-2 rounded-lg border bg-primary/5 p-3">
                <Label className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  Perfil de acesso ({selectedDepartment.toUpperCase()})
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={selectedProfileId}
                    onValueChange={(v) => { setSelectedProfileId(v); setProfileOverrides({}); }}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione um perfil" />
                    </SelectTrigger>
                    <SelectContent className="bg-background border shadow-md">
                      <SelectItem value="none">— Sem perfil específico —</SelectItem>
                      {profilesForDept.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}{p.is_default ? ' (padrão)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setProfileEditorOpen(true)}
                    title="Criar perfil novo"
                  >
                    <UserPlus className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setOverrideEditorOpen(true)}
                    disabled={selectedProfileId === 'none'}
                    title="Personalizar permissões só para este usuário"
                  >
                    <Settings2 className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {selectedProfileId === 'none'
                    ? 'Sem perfil: o usuário só terá as permissões do nível de acesso.'
                    : Object.keys(profileOverrides).length > 0
                      ? 'Permissões personalizadas aplicadas para este usuário.'
                      : 'Use o ícone de engrenagem para ajustar permissões só para este usuário.'}
                </p>
              </div>
            )}


            {/* Administração da empresa */}
            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-sm font-semibold">
                    <Shield className="h-4 w-4" />
                    Este usuário também administra a empresa
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Acesso às configurações globais: faturamento, convites, integrações
                    e gestão de todos os perfis. Marque apenas para sócios e administradores
                    de sistema. As permissões do dia a dia continuam vindo do perfil de
                    acesso acima.
                  </p>
                </div>
                <Switch
                  checked={isCompanyAdmin}
                  disabled={!canPromoteAdmin}
                  onCheckedChange={setIsCompanyAdmin}
                />
              </div>
              {!canPromoteAdmin && (
                <p className="text-[11px] text-muted-foreground italic">
                  Apenas administradores ou donos podem promover outros usuários.
                </p>
              )}
            </div>

          </div>
        </ScrollArea>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={() => createInvite.mutate()} 
            disabled={createInvite.isPending || !email}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            {createInvite.isPending ? 'Enviando...' : 'Enviar Convite'}
          </Button>
        </DialogFooter>
      </DialogContent>

      {/* Editor para criar perfil novo do departamento, sem sair do convite */}
      {departmentForProfile && (
        <AccessProfileEditor
          open={profileEditorOpen}
          onOpenChange={setProfileEditorOpen}
          department={departmentForProfile}
          profile={null}
        />
      )}

      {/* Editor para personalizar permissões só deste usuário (overrides) */}
      {departmentForProfile && (
        <AccessProfileEditor
          open={overrideEditorOpen}
          onOpenChange={setOverrideEditorOpen}
          department={departmentForProfile}
          profile={null}
          overrideMode
          initialOverrides={profileOverrides}
          onOverridesSaved={setProfileOverrides}
        />
      )}
    </Dialog>
  );
}
