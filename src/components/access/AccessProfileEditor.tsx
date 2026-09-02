import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Shield } from 'lucide-react';
import {
  type Department,
  type PermissionsMap,
  type ProfileRestrictions,
  DEPARTMENT_SCHEMAS,
  DEFAULT_RESTRICTIONS,
  buildEmptyPermissions,
  buildFullPermissions,
  normalizePermissions,
} from '@/config/access-profile-schemas';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUpsertAccessProfile, type AccessProfile } from '@/hooks/useAccessProfiles';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  department: Department;
  profile: AccessProfile | null;
  // Override mode: instead of saving a profile, returns a permission map.
  overrideMode?: boolean;
  initialOverrides?: PermissionsMap;
  onOverridesSaved?: (perms: PermissionsMap) => void;
}

export function AccessProfileEditor({
  open, onOpenChange, department, profile,
  overrideMode = false, initialOverrides, onOverridesSaved,
}: Props) {
  const schema = DEPARTMENT_SCHEMAS[department];
  const upsert = useUpsertAccessProfile();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [perms, setPerms] = useState<PermissionsMap>(() => buildEmptyPermissions(department));
  const [restrictions, setRestrictions] = useState<ProfileRestrictions>(DEFAULT_RESTRICTIONS);

  useEffect(() => {
    if (!open) return;
    if (overrideMode) {
      setPerms(initialOverrides && Object.keys(initialOverrides).length > 0
        ? initialOverrides
        : buildEmptyPermissions(department));
      return;
    }
    if (profile) {
      setName(profile.name);
      setDescription(profile.description || '');
      setIsDefault(profile.is_default);
      setPerms(normalizePermissions(department, profile.permissions));
      setRestrictions(profile.restrictions ?? DEFAULT_RESTRICTIONS);
    } else {
      setName('');
      setDescription('');
      setIsDefault(false);
      setPerms(buildEmptyPermissions(department));
      setRestrictions(DEFAULT_RESTRICTIONS);
    }
  }, [open, profile, department, overrideMode, initialOverrides]);

  const setAction = (mod: string, act: string, v: boolean) => {
    setPerms(prev => ({ ...prev, [mod]: { ...prev[mod], [act]: v } }));
  };

  const handleSave = async () => {
    if (overrideMode) {
      onOverridesSaved?.(perms);
      onOpenChange(false);
      return;
    }
    if (!name.trim()) return;
    await upsert.mutateAsync({
      id: profile?.id,
      department,
      name: name.trim(),
      description: description || null,
      is_default: isDefault,
      permissions: perms,
      restrictions,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[820px] max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            {overrideMode
              ? `Personalizar permissões — ${schema.label}`
              : profile ? `Editar perfil · ${schema.label}` : `Novo perfil · ${schema.label}`}
          </DialogTitle>
          <DialogDescription>
            {overrideMode
              ? 'Marque ou desmarque permissões só para este usuário. Sobrescreve o perfil padrão escolhido.'
              : 'Defina as permissões deste perfil. Você poderá atribuir a vários usuários.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2 space-y-5">
          {!overrideMode && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome do perfil *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Analista N1" />
              </div>
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <Label className="text-sm">Perfil padrão</Label>
                  <p className="text-xs text-muted-foreground">Novos usuários deste departamento recebem este perfil.</p>
                </div>
                <Switch checked={isDefault} onCheckedChange={setIsDefault} />
              </div>
            </div>
          )}

          <div className="rounded-md border overflow-hidden">
            <div className="flex items-center justify-between p-3 bg-muted/40">
              <span className="text-sm font-medium">Matriz de permissões</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setPerms(buildFullPermissions(department))}>
                  Marcar tudo
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs"
                  onClick={() => setPerms(buildEmptyPermissions(department))}>
                  Limpar tudo
                </Button>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[34%]">Módulo</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schema.modules.map(m => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium align-top py-3">
                      {m.label}
                      {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-wrap gap-2">
                        {m.actions.map(a => {
                          const checked = !!perms[m.key]?.[a.key];
                          return (
                            <label key={a.key}
                              className={`flex items-center gap-2 px-2.5 py-1.5 rounded border cursor-pointer text-xs select-none transition-colors ${
                                checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'
                              }`}>
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(v) => setAction(m.key, a.key, !!v)}
                              />
                              <span>{a.label}</span>
                              {a.sensitive && <Badge variant="outline" className="text-[9px] h-4 px-1">sensível</Badge>}
                            </label>
                          );
                        })}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {!overrideMode && schema.hasTicketRestrictions && (
            <div className="rounded-md border p-3 space-y-3">
              <div>
                <p className="text-sm font-medium">Restrições da fila de chamados</p>
                <p className="text-xs text-muted-foreground">
                  Limita o que este perfil enxerga na fila, mesmo com permissão de visualizar.
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Visibilidade</Label>
                <Select
                  value={restrictions.ticket_visibility}
                  onValueChange={(v) => setRestrictions(r => ({ ...r, ticket_visibility: v as ProfileRestrictions['ticket_visibility'] }))}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-background border shadow-md">
                    <SelectItem value="all">Todos os chamados do departamento</SelectItem>
                    <SelectItem value="own">Apenas os atribuídos a ele</SelectItem>
                    <SelectItem value="unassigned">Os dele e os sem responsável</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prioridades permitidas</Label>
                <div className="flex flex-wrap gap-2">
                  {['critical', 'high', 'medium', 'low'].map(pr => {
                    const checked = restrictions.priorities.includes(pr);
                    const label = { critical: 'Crítica', high: 'Alta', medium: 'Média', low: 'Baixa' }[pr]!;
                    return (
                      <label key={pr} className={`flex items-center gap-2 px-2.5 py-1.5 rounded border cursor-pointer text-xs ${checked ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent'}`}>
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => setRestrictions(r => ({
                            ...r,
                            priorities: v ? [...r.priorities, pr] : r.priorities.filter(x => x !== pr),
                          }))}
                        />
                        <span>{label}</span>
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground">Nenhuma marcada = todas as prioridades.</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!overrideMode && !name.trim()}>
            {overrideMode ? 'Aplicar' : profile ? 'Salvar alterações' : 'Criar perfil'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
