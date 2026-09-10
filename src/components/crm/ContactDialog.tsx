import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useSaveContact, type CRMContact } from '@/hooks/useCRM';
import { SOURCE_LABELS } from '@/lib/crm';
import { CustomFieldsForm } from './CustomFieldsForm';
import { useCustomFields } from '@/hooks/useCustomFields';
import { validateCustomValues, type CustomValues } from '@/lib/custom-fields';

interface ContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Presente = editando; ausente = novo contato. */
  contact?: CRMContact | null;
  /** Chamado depois de salvar, com o suficiente para quem abriu escolher o contato na hora. */
  onSaved?: (contact: { id: string; name: string; company: string | null }) => void;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  document: string;
  company: string;
  city: string;
  state: string;
  notes: string;
  source: string;
  owner_id?: string;
  custom: CustomValues;
}

function emptyForm(): FormState {
  return { name: '', email: '', phone: '', whatsapp: '', document: '', company: '', city: '', state: '', notes: '', source: 'manual', custom: {} };
}

function fromContact(contact: CRMContact): FormState {
  return {
    name: contact.name,
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    whatsapp: contact.whatsapp ?? '',
    document: contact.document ?? '',
    company: contact.company ?? '',
    city: contact.city ?? '',
    state: contact.state ?? '',
    notes: contact.notes ?? '',
    source: contact.source,
    owner_id: contact.owner_id ?? undefined,
    custom: (contact.custom as CustomValues) ?? {},
  };
}

/** CPF/CNPJ: só dígitos, como a coluna `crm_contacts.document` espera. */
const onlyDigits = (v: string) => v.replace(/\D/g, '');

export function ContactDialog({ open, onOpenChange, contact, onSaved }: ContactDialogProps) {
  const [form, setForm] = useState<FormState>(emptyForm());
  const { data: technicians = [] } = useTechnicians();
  const { data: customFields = [] } = useCustomFields('contact');
  const saveContact = useSaveContact();
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(contact ? fromContact(contact) : emptyForm());
      setCustomErrors({});
    }
  }, [open, contact]);

  const canSave = form.name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const errors = validateCustomValues(customFields, form.custom);
    setCustomErrors(errors);
    if (Object.keys(errors).length > 0) return;
    const payload = {
      id: contact?.id,
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      whatsapp: form.whatsapp.trim() || null,
      document: form.document.trim() || null,
      company: form.company.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      notes: form.notes.trim() || null,
      source: form.source,
      owner_id: form.owner_id ?? null,
      custom: form.custom,
    };
    saveContact.mutate(payload, {
      onSuccess: (rows) => {
        onSaved?.({ id: rows[0].id, name: payload.name, company: payload.company });
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{contact ? 'Editar contato' : 'Novo contato'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={form.company} onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>WhatsApp</Label>
              <Input value={form.whatsapp} onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))} placeholder="Só números, com DDD" />
            </div>
            <div className="space-y-1.5">
              <Label>CPF/CNPJ</Label>
              <Input value={form.document} onChange={(e) => setForm((f) => ({ ...f, document: onlyDigits(e.target.value) }))} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cidade</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Input value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value.toUpperCase() }))} maxLength={2} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={(v) => setForm((f) => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Dono (vendedor)</Label>
              <Select value={form.owner_id ?? '__none__'} onValueChange={(v) => setForm((f) => ({ ...f, owner_id: v === '__none__' ? undefined : v }))}>
                <SelectTrigger><SelectValue placeholder="Sem dono" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem dono</SelectItem>
                  {technicians.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <CustomFieldsForm entity="contact" values={form.custom} onChange={(custom) => setForm((f) => ({ ...f, custom }))} errors={customErrors} />

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saveContact.isPending}>Salvar contato</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
