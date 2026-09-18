import { useMemo, useState } from 'react';
import { Copy, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantSlug } from '@/hooks/useTenantPath';
import { slugify } from '@/lib/crm';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCustomFields } from '@/hooks/useCustomFields';
import { useCRMSegments } from '@/hooks/useCRMConfig';
import { useCRMPipelines } from '@/hooks/useCRM';
import {
  useCRMForms, useSaveCRMForm, useDeleteCRMForm, CAMPOS_EMBUTIDOS,
  type CRMForm, type FormField,
} from '@/hooks/useCRMForms';

const NONE = '__none__';

interface FormState {
  id?: string;
  name: string;
  slug: string;
  is_active: boolean;
  pipeline_id?: string;
  segment_id?: string;
  owner_id?: string;
  headline: string;
  subhead: string;
  submit_label: string;
  success_message: string;
  redirect_url: string;
  fields: FormField[];
}

function novoForm(): FormState {
  return {
    name: '', slug: '', is_active: true,
    headline: '', subhead: '', submit_label: 'Enviar',
    success_message: 'Recebemos sua mensagem. Em breve entramos em contato.',
    redirect_url: '',
    fields: CAMPOS_EMBUTIDOS.filter((c) => ['name', 'email', 'phone', 'message'].includes(c.key)),
  };
}

function daLinha(f: CRMForm): FormState {
  return {
    id: f.id, name: f.name, slug: f.slug, is_active: f.is_active,
    pipeline_id: f.pipeline_id ?? undefined,
    segment_id: f.segment_id ?? undefined,
    owner_id: f.owner_id ?? undefined,
    headline: f.headline ?? '', subhead: f.subhead ?? '',
    submit_label: f.submit_label, success_message: f.success_message,
    redirect_url: f.redirect_url ?? '',
    fields: Array.isArray(f.fields) ? (f.fields as unknown as FormField[]) : [],
  };
}

/**
 * CRM → Formulários (CRM-3a): a empresa monta o formulário do site campo a
 * campo e recebe o lead direto no funil. Sai do Kommo sem escrever HTML.
 */
export default function ComercialFormularios() {
  const { role } = useAuth();
  // ADR-010: não há mais `:slug` na rota. O endereço público do formulário
  // (`/f/<slug>/<form>`) continua precisando de um slug de verdade — vem do
  // domínio próprio verificado, com fallback para o tenant do usuário logado.
  const tenantSlug = useTenantSlug();
  const canEdit = ['owner', 'admin', 'manager'].includes(role ?? '');
  const { data: forms = [], isLoading } = useCRMForms();
  const save = useSaveCRMForm();
  const remove = useDeleteCRMForm();
  const [form, setForm] = useState<FormState | null>(null);

  const base = tenantSlug ? `${window.location.origin}/f/${tenantSlug}` : null;

  return (
    <div className="p-6 space-y-4 max-w-5xl">
      <PageHeader
        title="Formulários do site"
        description="Monte o formulário, ponha no seu site e o lead cai direto no funil."
        actions={canEdit ? <Button onClick={() => setForm(novoForm())}><Plus className="w-4 h-4 mr-1.5" /> Novo formulário</Button> : undefined}
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : forms.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Nenhum formulário ainda. Crie um e cole o endereço no seu site.
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {forms.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {f.name}
                      {!f.is_active && <Badge variant="outline" className="text-[10px]">desligado</Badge>}
                    </CardTitle>
                    <CardDescription className="font-mono text-xs break-all">
                      {base ? `${base}/${f.slug}` : 'carregando o endereço…'}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    {base && (
                      <Button variant="outline" size="sm" asChild>
                        <a href={`${base}/${f.slug}`} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5 mr-1" /> Abrir</a>
                      </Button>
                    )}
                    {canEdit && <Button variant="outline" size="sm" onClick={() => setForm(daLinha(f))}>Editar</Button>}
                    {canEdit && (
                      <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => remove.mutate(f.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {base && <CodigoParaEmbutir url={`${base}/${f.slug}`} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {form && (
        <EditorDeFormulario
          form={form} setForm={setForm} base={base}
          onSave={() => save.mutate(
            { ...form, slug: form.slug || slugify(form.name) },
            { onSuccess: () => setForm(null) },
          )}
          salvando={save.isPending}
        />
      )}
    </div>
  );
}

function CodigoParaEmbutir({ url }: { url: string }) {
  const codigo = `<iframe src="${url}?embed=1" style="width:100%;max-width:560px;height:640px;border:0" title="Formulário"></iframe>`;
  return (
    <div className="flex items-center gap-2">
      <Input readOnly value={codigo} className="font-mono text-[11px] h-8" onFocus={(e) => e.currentTarget.select()} />
      <Button variant="outline" size="icon" className="h-8 w-8" aria-label="Copiar código"
        onClick={() => { navigator.clipboard.writeText(codigo); toast.success('Código copiado.'); }}>
        <Copy className="w-4 h-4" />
      </Button>
    </div>
  );
}

function EditorDeFormulario({ form, setForm, base, onSave, salvando }: {
  form: FormState; setForm: (f: FormState | null) => void; base: string | null;
  onSave: () => void; salvando: boolean;
}) {
  const { data: pipelines = [] } = useCRMPipelines();
  const { data: segments = [] } = useCRMSegments();
  const { data: pessoas = [] } = useTechnicians();
  const { data: personalizados = [] } = useCustomFields('contact');

  const usados = useMemo(() => new Set(form.fields.map((f) => f.key)), [form.fields]);
  const disponiveis: FormField[] = [
    ...CAMPOS_EMBUTIDOS.filter((c) => !usados.has(c.key)),
    // `custom:<chave do catálogo>`, nunca o id: é pela chave que o banco valida
    // a resposta, e id nem passaria no formato que ele exige.
    ...personalizados
      .filter((p) => !usados.has(`custom:${p.key}`))
      .map((p) => ({
        key: `custom:${p.key}`,
        label: p.label,
        type: (p.type === 'number' ? 'number' : p.type === 'date' ? 'date' : p.type === 'select' ? 'select' : 'text') as FormField['type'],
        options: p.type === 'select' ? p.options.map((o) => o.value) : undefined,
      })),
  ];

  const mover = (i: number, delta: number) => {
    const next = [...form.fields];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setForm({ ...form, fields: next });
  };

  const slug = form.slug || slugify(form.name);
  // O servidor exige e-mail ou telefone: sem um dos dois o formulário salvaria,
  // publicaria, e **todo** visitante levaria erro ao enviar.
  const temContato = form.fields.some((c) => c.key === 'email' || c.key === 'phone');

  return (
    <Dialog open onOpenChange={() => setForm(null)}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{form.id ? 'Editar formulário' : 'Novo formulário'}</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Fale conosco" />
            </div>
            <div className="space-y-1.5">
              <Label>Endereço</Label>
              <Input value={form.slug} onChange={(e) => setForm({ ...form, slug: slugify(e.target.value) })} placeholder={slugify(form.name) || 'fale-conosco'} />
              <p className="text-[11px] text-muted-foreground break-all">{base ? `${base}/${slug || '…'}` : ''}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Título na página</Label>
              <Input value={form.headline} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Fale com a gente" />
            </div>
            <div className="space-y-1.5">
              <Label>Texto de apoio</Label>
              <Input value={form.subhead} onChange={(e) => setForm({ ...form, subhead: e.target.value })} placeholder="Respondemos em até um dia útil" />
            </div>
          </div>

          <div>
            <p className="text-sm font-medium mb-2">Campos</p>
            <div className="space-y-2">
              {form.fields.map((c, i) => (
                <div key={c.key} className="flex items-center gap-2 rounded-md border border-border p-2">
                  <div className="flex flex-col">
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Subir" onClick={() => mover(i, -1)}>▲</button>
                    <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Descer" onClick={() => mover(i, 1)}>▼</button>
                  </div>
                  <Input className="h-8 flex-1" value={c.label}
                    onChange={(e) => {
                      const next = [...form.fields];
                      next[i] = { ...c, label: e.target.value };
                      setForm({ ...form, fields: next });
                    }} />
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Switch checked={!!c.required} disabled={c.key === 'name'}
                      onCheckedChange={(v) => {
                        const next = [...form.fields];
                        next[i] = { ...c, required: v };
                        setForm({ ...form, fields: next });
                      }} />
                    <Label className="text-[11px] text-muted-foreground">obrigatório</Label>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" aria-label="Tirar campo"
                    disabled={c.key === 'name'}
                    onClick={() => setForm({ ...form, fields: form.fields.filter((_, j) => j !== i) })}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            {disponiveis.length > 0 && (
              <div className="mt-2">
                <Select value="" onValueChange={(k) => {
                  const campo = disponiveis.find((d) => d.key === k);
                  if (campo) setForm({ ...form, fields: [...form.fields, campo] });
                }}>
                  <SelectTrigger className="h-8 w-64"><SelectValue placeholder="Acrescentar campo…" /></SelectTrigger>
                  <SelectContent>
                    {disponiveis.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Os campos personalizados são os mesmos do cadastro de contato.
                </p>
              </div>
            )}
          </div>

          <div className="rounded-md border border-border p-3 space-y-3">
            <p className="text-[11px] text-muted-foreground">Para onde o lead vai. Quem vê isso é só a sua equipe.</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Funil</Label>
                <Select value={form.pipeline_id ?? NONE} onValueChange={(v) => setForm({ ...form, pipeline_id: v === NONE ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>O padrão</SelectItem>
                    {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Segmento</Label>
                <Select value={form.segment_id ?? NONE} onValueChange={(v) => setForm({ ...form, segment_id: v === NONE ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Nenhum</SelectItem>
                    {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Vendedor</Label>
                <Select value={form.owner_id ?? NONE} onValueChange={(v) => setForm({ ...form, owner_id: v === NONE ? undefined : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Quem já cuida do cliente</SelectItem>
                    {pessoas.map((p) => <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Texto do botão</Label>
              <Input value={form.submit_label} onChange={(e) => setForm({ ...form, submit_label: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Levar para (opcional)</Label>
              <Input value={form.redirect_url} onChange={(e) => setForm({ ...form, redirect_url: e.target.value })} placeholder="https://seusite.com/obrigado" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem depois de enviar</Label>
            <Textarea rows={2} value={form.success_message} onChange={(e) => setForm({ ...form, success_message: e.target.value })} />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
            <Label>Formulário ligado</Label>
          </div>
        </div>

        {!temContato && (
          <p className="text-xs text-destructive">
            Deixe pelo menos e-mail ou telefone no formulário. Sem um jeito de responder, o envio é recusado.
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setForm(null)}>Cancelar</Button>
          <Button onClick={onSave} disabled={!form.name.trim() || !slug || !temContato || salvando}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
