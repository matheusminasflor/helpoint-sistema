import { DicaDoCampo } from '@/components/ajuda/DicaDoCampo';
import { explicacaoDaPermissao } from '@/config/explicacoes-das-permissoes';
import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { aplicarNivel, grupoDaTela, nivelAtual, niveisDaTela, ROTULO_DO_GRUPO, ROTULO_DO_NIVEL, type GrupoDaTela, type Nivel } from '@/lib/nivel-de-acesso';
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
  // As telas com as caixinhas abertas ("Detalhar").
  const [abertos, setAbertos] = useState<Set<string>>(new Set());

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

          {/* Um nível por tela (dono, 2026-10-28, Leis de Hick e Miller): Não vê, Vê, Trabalha ou Tudo, na ordem do menu e
              com o resumo no topo. "Detalhar" abre as caixinhas de sempre para o ajuste fino. O nível só marca as
              caixinhas de uma vez; o que se grava e o banco confere continua sendo cada caixinha (`lib/nivel-de-acesso`). */}
          <div className="rounded-lg border border-border">
            <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-muted rounded-t-lg">
              <div className="flex flex-wrap gap-1.5" aria-label="Resumo do perfil">
                {([3, 2, 1, 0] as Nivel[]).map((n) => {
                  const qtd = schema.modules.filter((m) => nivelAtual(m, perms) === n).length;
                  return qtd > 0 ? (
                    <span key={n} className={cn('estado', n === 3 ? 'estado-concluido' : n === 0 ? 'estado-recebido' : 'estado-setor')}>
                      {ROTULO_DO_NIVEL[n]}: {qtd} {qtd === 1 ? 'tela' : 'telas'}
                    </span>
                  ) : null;
                })}
                {schema.modules.some((m) => nivelAtual(m, perms) === null) && (
                  <span className="estado estado-espera">Personalizado: {schema.modules.filter((m) => nivelAtual(m, perms) === null).length}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setPerms(buildFullPermissions(department))}>Tudo em todas</Button>
                <Button size="sm" variant="outline" onClick={() => setPerms(buildEmptyPermissions(department))}>Limpar</Button>
              </div>
            </div>

            {(['trabalho', 'relatorios', 'configuracoes'] as GrupoDaTela[]).map((grupo) => {
              const telas = schema.modules.filter((m) => grupoDaTela(m) === grupo);
              if (telas.length === 0) return null;
              return (
                <div key={grupo} className="px-3 pb-1">
                  <p className="pt-4 pb-1 text-[12px] font-bold [text-transform:uppercase] tracking-[0.05em] text-muted-foreground">{ROTULO_DO_GRUPO[grupo]}</p>
                  {telas.map((m) => {
                    const atual = nivelAtual(m, perms);
                    const aberto = abertos.has(m.key) || atual === null;
                    return (
                      <div key={m.key} className="py-2.5 border-b border-border/70 last:border-b-0">
                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-[14px]">{m.label.replace(/^Configurações › /, '')}</p>
                            {m.description && <p className="text-xs text-muted-foreground mt-0.5">{m.description}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="inline-flex h-8 rounded-md border border-input bg-card overflow-hidden" role="group" aria-label={`Nível em ${m.label}`}>
                              {niveisDaTela(m).map((n) => (
                                <button key={n} type="button" aria-pressed={atual === n}
                                  onClick={() => setPerms((prev) => ({ ...prev, [m.key]: aplicarNivel(m, n) }))}
                                  className={cn('px-2.5 text-[13px] whitespace-nowrap border-r border-input last:border-r-0',
                                    atual === n ? 'bg-primary text-primary-foreground font-bold' : 'font-semibold hover:bg-muted')}>
                                  {ROTULO_DO_NIVEL[n]}
                                </button>
                              ))}
                            </div>
                            <button type="button" aria-expanded={aberto}
                              onClick={() => setAbertos((s) => { const n = new Set(s); if (n.has(m.key)) n.delete(m.key); else n.add(m.key); return n; })}
                              className="text-[13px] font-semibold text-primary hover:underline whitespace-nowrap">
                              {atual === null ? 'Personalizado' : aberto ? 'Fechar' : 'Detalhar'}
                            </button>
                          </div>
                        </div>
                        {aberto && (
                          <div className="mt-2 rounded-md bg-muted/60 p-2.5 flex flex-wrap gap-2">
                            {m.actions.map(a => {
                              const checked = !!perms[m.key]?.[a.key];
                              return (
                                <span key={a.key} className={cn('flex items-center rounded border text-xs transition-colors bg-card',
                                  checked ? 'border-primary' : 'border-border')}>
                                  <label className="flex items-center gap-2 pl-2.5 py-1.5 cursor-pointer select-none">
                                    <Checkbox
                                      checked={checked}
                                      onCheckedChange={(v) => setAction(m.key, a.key, !!v)}
                                    />
                                    <span>{a.label}</span>
                                    {a.sensitive && <Badge variant="outline" className="text-[12px] h-4 px-1">sensível</Badge>}
                                  </label>
                                  {/* O que esta caixinha libera (dono, 2026-10-13). Fora do <label>: clicar no (i) não marca. */}
                                  <span className="px-1.5"><DicaDoCampo campo={a.label} texto={explicacaoDaPermissao(m, a)} /></span>
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
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
