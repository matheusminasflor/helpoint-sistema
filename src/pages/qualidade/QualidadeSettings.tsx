import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Copy, ExternalLink, Plus, Pencil, Trash2, Link2, QrCode, GripVertical, Lock, Package, Users } from 'lucide-react';
import { ProductsCatalogTab } from '@/components/qualidade/ProductsCatalogTab';
import { CategoryManager } from '@/components/ti/CategoryManager';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';


type SacCategory = {
  id: string; tenant_id: string; name: string; description: string | null;
  color: string | null; sort_order: number; is_active: boolean;
};

type SacFormField = {
  id: string; tenant_id: string; field_key: string; label: string;
  field_type: string; placeholder: string | null; help_text: string | null;
  is_required: boolean; is_active: boolean; is_system: boolean;
  options: any; sort_order: number;
};

const FIELD_TYPES = [
  { value: 'text', label: 'Texto curto' },
  { value: 'textarea', label: 'Texto longo' },
  { value: 'email', label: 'E-mail' },
  { value: 'phone', label: 'Telefone' },
  { value: 'document', label: 'CPF/CNPJ' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Data' },
  { value: 'select', label: 'Lista de opções' },
  { value: 'radio', label: 'Múltipla escolha' },
  { value: 'checkbox', label: 'Caixa de seleção' },
  { value: 'attachments', label: 'Anexos' },
];

export default function QualidadeSettings() {
  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Configurações de Qualidade"
        description="Compartilhe o link do SAC com seus clientes e personalize o formulário público."
        className="bg-transparent border-0 px-0 py-0 mb-6"
      />

      <Tabs defaultValue="link" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="link"><Link2 className="w-4 h-4 mr-2" />Link público</TabsTrigger>
          <TabsTrigger value="products"><Package className="w-4 h-4 mr-2" />Produtos & Lotes</TabsTrigger>
          <TabsTrigger value="categories">Categorias do SAC</TabsTrigger>
          <TabsTrigger value="internal">Categorias dos chamados</TabsTrigger>
          <TabsTrigger value="fields">Campos do formulário</TabsTrigger>
          <TabsTrigger value="team" disabled><Users className="w-4 h-4 mr-2" />Equipe</TabsTrigger>
        </TabsList>

        <TabsContent value="link"><ShareLinkTab /></TabsContent>
        <TabsContent value="products"><ProductsCatalogTab /></TabsContent>
        <TabsContent value="categories"><CategoriesTab /></TabsContent>
        <TabsContent value="internal"><InternalCategoriesTab /></TabsContent>
        <TabsContent value="fields"><FormFieldsTab /></TabsContent>
        <TabsContent value="team">
          <p className="text-sm text-muted-foreground">
            A gestão da equipe da Qualidade foi movida para <strong>Configurações → Usuários → Equipe · Qualidade</strong>.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────── Categorias internas (chamados de Qualidade) ───────────── */

function InternalCategoriesTab() {
  const { can } = useDepartmentPermissions('qualidade');
  const canEdit = can('categories', 'edit') || can('categories', 'create');

  return (
    <Card className="p-4">
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Categorias dos chamados de Qualidade</h3>
        <p className="text-sm text-muted-foreground">
          Tipos de solicitação abertos internamente pela equipe, com formulário personalizado por categoria.
          Não afeta o formulário público do SAC.
        </p>
      </div>
      <CategoryManager module="qualidade" allowForms readOnly={!canEdit} emptyLabel="a Qualidade" />
    </Card>
  );
}

/* ───────────── TAB 1: PUBLIC LINK ───────────── */

function ShareLinkTab() {
  const { tenantId } = useAuth();
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    supabase.from('tenants').select('slug').eq('id', tenantId).maybeSingle()
      .then(({ data }) => setSlug(data?.slug || null));
  }, [tenantId]);

  const origin = typeof window === 'undefined' ? 'https://helpoint.com.br' : window.location.origin;
  const url = slug
    ? `${origin}/sac/acesso?tenant=${slug}`
    : `${origin}/sac/acesso`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado');
  };

  return (
    <div className="space-y-4">
      <Card className="p-6 border border-border bg-muted/30">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center shrink-0">
            <Link2 className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg mb-1">Link do Painel do Cliente</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Envie este link aos seus clientes (WhatsApp, e-mail, redes sociais, QR Code em embalagem).
              Eles fazem login ou criam um cadastro para abrir e acompanhar seus chamados de SAC.
            </p>

            <div className="flex gap-2 mb-3">
              <Input value={url} readOnly className="font-mono text-sm bg-white" />
              <Button onClick={copy} variant="outline"><Copy className="w-4 h-4 mr-1" />Copiar</Button>
              <Button onClick={() => window.open(url, '_blank')} style={{ backgroundColor: '#00c875' }}>
                <ExternalLink className="w-4 h-4 mr-1" />Abrir
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><QrCode className="w-4 h-4" />QR Code</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Baixe e imprima em embalagens, notas fiscais ou material de marketing.
        </p>
        <img
          src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(url)}`}
          alt="QR Code do SAC"
          className="border rounded-md"
          width={240}
          height={240}
        />
      </Card>
    </div>
  );
}

/* ───────────── TAB 2: CATEGORIES ───────────── */

function CategoriesTab() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState<SacCategory[]>([]);
  const [editing, setEditing] = useState<Partial<SacCategory> | null>(null);

  const load = () => {
    supabase.from('sac_categories').select('*').order('sort_order')
      .then(({ data }) => setItems((data || []) as SacCategory[]));
  };
  useEffect(load, [tenantId]);

  const save = async () => {
    if (!editing?.name) { toast.error('Nome obrigatório'); return; }
    if (editing.id) {
      const { error } = await supabase.from('sac_categories').update({
        name: editing.name, description: editing.description, color: editing.color,
        is_active: editing.is_active ?? true,
      }).eq('id', editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from('sac_categories').insert({
        tenant_id: tenantId!, name: editing.name, description: editing.description || null,
        color: editing.color || '#00c875', sort_order: items.length + 1, is_active: true,
      });
      if (error) return toast.error(error.message);
    }
    toast.success('Salvo'); setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm('Remover categoria?')) return;
    const { error } = await supabase.from('sac_categories').delete().eq('id', id);
    if (error) return toast.error(error.message);
    toast.success('Removida'); load();
  };

  const toggleActive = async (c: SacCategory) => {
    await supabase.from('sac_categories').update({ is_active: !c.is_active }).eq('id', c.id);
    load();
  };

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold">Categorias do SAC</h2>
          <p className="text-xs text-muted-foreground">Tipos de solicitação que o cliente pode escolher no formulário.</p>
        </div>
        <Button onClick={() => setEditing({ name: '', color: '#00c875', is_active: true })}>
          <Plus className="w-4 h-4 mr-1" />Nova categoria
        </Button>
      </div>

      <div className="space-y-1">
        {items.map(c => (
          <div key={c.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-surface-2">
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.color || '#00c875' }} />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{c.name}</div>
              {c.description && <div className="text-xs text-muted-foreground truncate">{c.description}</div>}
            </div>
            <Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(c)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
          </div>
        ))}
        {items.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma categoria cadastrada.</div>}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Editar' : 'Nova'} categoria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editing?.name || ''} onChange={e => setEditing(p => ({ ...p, name: e.target.value }))} /></div>
            <div><Label>Descrição</Label><Textarea rows={2} value={editing?.description || ''} onChange={e => setEditing(p => ({ ...p, description: e.target.value }))} /></div>
            <div><Label>Cor</Label><Input type="color" value={editing?.color || '#00c875'} onChange={e => setEditing(p => ({ ...p, color: e.target.value }))} className="h-10 w-20" /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ───────────── TAB 3: FORM FIELDS ───────────── */

function FormFieldsTab() {
  const { tenantId } = useAuth();
  const [items, setItems] = useState<SacFormField[]>([]);
  const [editing, setEditing] = useState<Partial<SacFormField> | null>(null);

  const load = () => {
    supabase.from('sac_form_fields').select('*').order('sort_order')
      .then(({ data }) => setItems((data || []) as SacFormField[]));
  };
  useEffect(load, [tenantId]);

  const save = async () => {
    if (!editing?.label) { toast.error('Rótulo obrigatório'); return; }
    if (editing.id) {
      const { error } = await supabase.from('sac_form_fields').update({
        label: editing.label, field_type: editing.field_type,
        placeholder: editing.placeholder, help_text: editing.help_text,
        is_required: editing.is_required ?? false, is_active: editing.is_active ?? true,
        options: editing.options || [],
      }).eq('id', editing.id);
      if (error) return toast.error(error.message);
    } else {
      const key = editing.field_key || `custom_${Date.now()}`;
      const { error } = await supabase.from('sac_form_fields').insert({
        tenant_id: tenantId!, field_key: key, label: editing.label,
        field_type: editing.field_type || 'text', placeholder: editing.placeholder || null,
        help_text: editing.help_text || null, is_required: editing.is_required ?? false,
        is_active: true, is_system: false, options: editing.options || [],
        sort_order: items.length + 1,
      });
      if (error) return toast.error(error.message);
    }
    toast.success('Salvo'); setEditing(null); load();
  };

  const remove = async (f: SacFormField) => {
    if (f.is_system) { toast.error('Campo do sistema não pode ser removido. Desative-o.'); return; }
    if (!confirm('Remover campo?')) return;
    const { error } = await supabase.from('sac_form_fields').delete().eq('id', f.id);
    if (error) return toast.error(error.message);
    toast.success('Removido'); load();
  };

  const toggleActive = async (f: SacFormField) => {
    await supabase.from('sac_form_fields').update({ is_active: !f.is_active }).eq('id', f.id);
    load();
  };

  const hasOptions = editing?.field_type === 'select' || editing?.field_type === 'radio';

  return (
    <Card className="p-4">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="font-semibold">Campos do formulário</h2>
          <p className="text-xs text-muted-foreground">Adicione campos personalizados (ex: número do pedido, tamanho, modelo). Campos do sistema não podem ser removidos.</p>
        </div>
        <Button onClick={() => setEditing({ field_type: 'text', is_required: false, is_active: true, options: [] })}>
          <Plus className="w-4 h-4 mr-1" />Novo campo
        </Button>
      </div>

      <div className="space-y-1">
        {items.map(f => (
          <div key={f.id} className="flex items-center gap-3 p-3 rounded-md border hover:bg-surface-2">
            <GripVertical className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{f.label}</span>
                {f.is_required && <Badge variant="destructive" className="h-4 text-[10px] px-1">obrigatório</Badge>}
                {f.is_system && <Badge variant="secondary" className="h-4 text-[10px] px-1"><Lock className="w-2.5 h-2.5 mr-0.5" />sistema</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                {FIELD_TYPES.find(t => t.value === f.field_type)?.label || f.field_type} · <code>{f.field_key}</code>
              </div>
            </div>
            <Switch checked={f.is_active} onCheckedChange={() => toggleActive(f)} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(f)}><Pencil className="w-3.5 h-3.5" /></Button>
            <Button size="sm" variant="ghost" onClick={() => remove(f)} disabled={f.is_system}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing?.id ? 'Editar' : 'Novo'} campo</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <div><Label>Rótulo (texto visível)</Label><Input value={editing?.label || ''} onChange={e => setEditing(p => ({ ...p, label: e.target.value }))} /></div>
            <div>
              <Label>Tipo</Label>
              <Select value={editing?.field_type || 'text'} onValueChange={v => setEditing(p => ({ ...p, field_type: v }))} disabled={editing?.is_system}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{FIELD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Placeholder</Label><Input value={editing?.placeholder || ''} onChange={e => setEditing(p => ({ ...p, placeholder: e.target.value }))} /></div>
            <div><Label>Texto de ajuda</Label><Input value={editing?.help_text || ''} onChange={e => setEditing(p => ({ ...p, help_text: e.target.value }))} /></div>
            {hasOptions && (
              <div>
                <Label>Opções (uma por linha)</Label>
                <Textarea rows={4}
                  value={Array.isArray(editing?.options) ? editing.options.join('\n') : ''}
                  onChange={e => setEditing(p => ({ ...p, options: e.target.value.split('\n').filter(Boolean) }))}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={editing?.is_required ?? false} onCheckedChange={v => setEditing(p => ({ ...p, is_required: v }))} />
              Campo obrigatório
            </label>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={save}>Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
