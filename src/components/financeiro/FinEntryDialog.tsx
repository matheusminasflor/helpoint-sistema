import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateFinEntry, useUpdateFinEntry } from '@/hooks/useFinanceiro';
import {
  FIN_STATUS_LABEL, KIND_PARTY_LABEL,
  type FinEntry, type FinKind, type FinStatus,
} from '@/types/financeiro';
import { competenceOf } from '@/lib/finance-import';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FinKind;
  entry?: FinEntry | null;
}

const empty = {
  description: '', category: '', counterparty: '', document_number: '',
  amount: '', due_date: '', settled_at: '', status: 'pending' as FinStatus,
  payment_method: '', cost_center: '', notes: '',
};

export function FinEntryDialog({ open, onOpenChange, kind, entry }: Props) {
  const [form, setForm] = useState(empty);
  const create = useCreateFinEntry();
  const update = useUpdateFinEntry();

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setForm({
        description: entry.description,
        category: entry.category || '',
        counterparty: entry.counterparty || '',
        document_number: entry.document_number || '',
        amount: String(entry.amount ?? ''),
        due_date: entry.due_date?.slice(0, 10) || '',
        settled_at: entry.settled_at?.slice(0, 10) || '',
        status: entry.status,
        payment_method: entry.payment_method || '',
        cost_center: entry.cost_center || '',
        notes: entry.notes || '',
      });
    } else {
      setForm(empty);
    }
  }, [open, entry]);

  const set = (key: keyof typeof empty) => (value: string) => setForm(prev => ({ ...prev, [key]: value }));

  const submit = async () => {
    const amount = Number.parseFloat(form.amount.replace(',', '.'));
    if (!form.description.trim() || !Number.isFinite(amount) || !form.due_date) return;

    const payload = {
      kind,
      description: form.description.trim(),
      category: form.category.trim() || null,
      counterparty: form.counterparty.trim() || null,
      document_number: form.document_number.trim() || null,
      amount,
      due_date: form.due_date,
      settled_at: form.settled_at || null,
      status: form.settled_at ? ('paid' as FinStatus) : form.status,
      payment_method: form.payment_method.trim() || null,
      cost_center: form.cost_center.trim() || null,
      competence: competenceOf(form.due_date),
      source: entry?.source || 'manual',
      notes: form.notes.trim() || null,
    };

    if (entry) await update.mutateAsync({ id: entry.id, ...payload });
    else await create.mutateAsync(payload as never);
    onOpenChange(false);
  };

  const saving = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? 'Editar lançamento' : 'Novo lançamento'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="fin-desc">Descrição</Label>
            <Input id="fin-desc" value={form.description} onChange={e => set('description')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-party">{KIND_PARTY_LABEL[kind]}</Label>
            <Input id="fin-party" value={form.counterparty} onChange={e => set('counterparty')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-cat">Categoria</Label>
            <Input id="fin-cat" value={form.category} onChange={e => set('category')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-amount">Valor (R$)</Label>
            <Input id="fin-amount" inputMode="decimal" value={form.amount} onChange={e => set('amount')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-doc">Documento</Label>
            <Input id="fin-doc" value={form.document_number} onChange={e => set('document_number')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-due">Vencimento</Label>
            <Input id="fin-due" type="date" value={form.due_date} onChange={e => set('due_date')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-settled">{kind === 'payable' ? 'Data do pagamento' : 'Data do recebimento'}</Label>
            <Input id="fin-settled" type="date" value={form.settled_at} onChange={e => set('settled_at')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-status">Situação</Label>
            <Select value={form.status} onValueChange={v => set('status')(v)}>
              <SelectTrigger id="fin-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(FIN_STATUS_LABEL) as FinStatus[]).map(s => (
                  <SelectItem key={s} value={s}>{FIN_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-method">Forma de pagamento</Label>
            <Input id="fin-method" value={form.payment_method} onChange={e => set('payment_method')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-cc">Centro de custo</Label>
            <Input id="fin-cc" value={form.cost_center} onChange={e => set('cost_center')(e.target.value)} />
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="fin-notes">Observações</Label>
            <Textarea id="fin-notes" rows={3} value={form.notes} onChange={e => set('notes')(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !form.description.trim() || !form.due_date || !form.amount}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
