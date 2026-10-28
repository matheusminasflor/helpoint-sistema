import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateFinEntry, useUpdateFinEntry, useFinEntries, useCriarContaFixa } from '@/hooks/useFinanceiro';

// Categoria e centro de custo eram texto livre: "Energia" e "energia " viravam duas (etapa 4 · Financeiro, 2026-10-24).
// O campo oferece o que já existe, e o que se grava passa a ser a forma que já existe, quando a diferença é só de
// maiúscula ou espaço.
// ponytail: lista tirada dos próprios lançamentos, sem tabela de cadastro; saída se o Financeiro quiser apagar/renomear.
const limpa = (s: string) => s.trim().replace(/\s+/g, ' ');
const chave = (s: string) => limpa(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function existentes(valores: (string | null | undefined)[]): string[] {
  const por = new Map<string, string>();
  for (const v of valores) if (v && limpa(v)) { const k = chave(v); if (!por.has(k)) por.set(k, limpa(v)); }
  return [...por.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}
const comoJaExiste = (valor: string, lista: string[]) => {
  const k = chave(valor);
  return lista.find((v) => chave(v) === k) ?? (limpa(valor) || null);
};
import {
  CARTAO_DE_CREDITO, CARTOES, FIN_STATUS_LABEL, FORMAS_DE_PAGAMENTO, KIND_PARTY_LABEL,
  type FinEntry, type FinKind, type FinStatus,
} from '@/types/financeiro';
import { competenceOf, parseAmount } from '@/lib/finance-import';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: FinKind;
  entry?: FinEntry | null;
}

const empty = {
  description: '', category: '', counterparty: '', document_number: '',
  amount: '', due_date: '', settled_at: '', status: 'pending' as FinStatus,
  payment_method: '', cartao: '', cost_center: '', notes: '',
  // Conta fixa (dono, 2026-10-28): só no lançamento novo.
  fixa: false, frequencia: 'mensal' as 'mensal' | 'anual', ate: '',
};

export function FinEntryDialog({ open, onOpenChange, kind, entry }: Props) {
  const { data: todas = [] } = useFinEntries();
  const categorias = existentes(todas.map((e) => e.category));
  const centros = existentes(todas.map((e) => e.cost_center));
  const [form, setForm] = useState(empty);
  const create = useCreateFinEntry();
  const update = useUpdateFinEntry();
  const criarFixa = useCriarContaFixa();

  useEffect(() => {
    if (!open) return;
    if (entry) {
      setForm({
        ...empty,
        description: entry.description,
        category: entry.category || '',
        counterparty: entry.counterparty || '',
        document_number: entry.document_number || '',
        amount: String(entry.amount ?? ''),
        // No cartão, o dia que a pessoa digita é o da cobrança; o vencimento é o da fatura (o banco calcula).
        due_date: (entry.data_no_cartao ?? entry.due_date)?.slice(0, 10) || '',
        settled_at: entry.settled_at?.slice(0, 10) || '',
        status: entry.status,
        payment_method: entry.payment_method || '',
        cartao: entry.data_no_cartao ? entry.filial ?? '' : '',
        cost_center: entry.cost_center || '',
        notes: entry.notes || '',
      });
    } else {
      setForm(empty);
    }
  }, [open, entry]);

  const set = <K extends keyof typeof empty>(key: K) => (value: (typeof empty)[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const noCartao = form.payment_method === CARTAO_DE_CREDITO;
  // A forma que veio de antes da lista fixa (ou da compra: "Cartão 3x") continua aparecendo para não sumir na edição.
  const formas: string[] = form.payment_method && !(FORMAS_DE_PAGAMENTO as readonly string[]).includes(form.payment_method)
    ? [...FORMAS_DE_PAGAMENTO, form.payment_method] : [...FORMAS_DE_PAGAMENTO];
  const faltaCartao = noCartao && !form.cartao;

  const submit = async () => {
    const amount = parseAmount(form.amount) ?? NaN;
    if (!form.description.trim() || !Number.isFinite(amount) || !form.due_date || faltaCartao) return;
    const comum = {
      kind,
      description: form.description.trim(),
      category: comoJaExiste(form.category, categorias),
      counterparty: form.counterparty.trim() || null,
      cost_center: comoJaExiste(form.cost_center, centros),
      notes: form.notes.trim() || null,
      amount,
      payment_method: form.payment_method || null,
    };

    if (form.fixa && !entry) {
      await criarFixa.mutateAsync({
        ...comum,
        filial: noCartao ? (form.cartao as 'INBRAS' | 'MF') : null,
        frequencia: form.frequencia,
        primeiro_dia: form.due_date,
        ate: form.ate || null,
      });
      onOpenChange(false);
      return;
    }

    const payload = {
      ...comum,
      document_number: form.document_number.trim() || null,
      due_date: form.due_date,
      settled_at: form.settled_at || null,
      status: form.settled_at ? ('paid' as FinStatus) : form.status,
      competence: competenceOf(form.due_date),
      source: entry?.source || 'manual',
      // No cartão de crédito o banco põe o vencimento no dia da fatura da filial (20270212050000).
      ...(noCartao ? { filial: form.cartao as 'INBRAS' | 'MF', data_no_cartao: form.due_date }
        : entry?.data_no_cartao ? { data_no_cartao: null } : {}),
    };

    if (entry) await update.mutateAsync({ id: entry.id, ...payload });
    else await create.mutateAsync(payload as never);
    onOpenChange(false);
  };

  const saving = create.isPending || update.isPending || criarFixa.isPending;
  const rotuloDoDia = noCartao
    ? (form.fixa ? 'Dia da 1ª cobrança no cartão' : 'Dia da compra no cartão')
    : (form.fixa ? '1º vencimento' : 'Vencimento');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? 'Editar lançamento' : form.fixa ? 'Nova conta fixa' : 'Novo lançamento'}</DialogTitle>
        </DialogHeader>

        {!entry && (
          <label className="flex items-start gap-2.5 rounded-lg border border-border p-3 cursor-pointer">
            <Checkbox checked={form.fixa} onCheckedChange={(v) => set('fixa')(v === true)} className="mt-0.5" />
            <span>
              <span className="text-sm font-medium block">Conta fixa: repete todo mês ou todo ano</span>
              <span className="text-[13px] text-muted-foreground block">
                O lançamento de cada período sai sozinho, 10 dias antes. Se um mês vier diferente, corrija o valor dele na baixa.
              </span>
            </span>
          </label>
        )}

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
            <Input id="fin-cat" list="fin-cat-lista" value={form.category} onChange={e => set('category')(e.target.value)} />
            <datalist id="fin-cat-lista">{categorias.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-amount">{form.fixa ? 'Valor de cada período (R$)' : 'Valor (R$)'}</Label>
            <Input id="fin-amount" inputMode="decimal" value={form.amount} onChange={e => set('amount')(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fin-method">Forma de pagamento</Label>
            <Select value={form.payment_method} onValueChange={v => set('payment_method')(v)}>
              <SelectTrigger id="fin-method"><SelectValue placeholder="Escolha" /></SelectTrigger>
              <SelectContent>{formas.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {noCartao && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-cartao">Cartão</Label>
              <Select value={form.cartao} onValueChange={v => set('cartao')(v)}>
                <SelectTrigger id="fin-cartao"><SelectValue placeholder="De qual filial" /></SelectTrigger>
                <SelectContent>{CARTOES.map((c) => <SelectItem key={c} value={c}>Cartão {c}</SelectItem>)}</SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">Vence no dia da fatura desse cartão e entra em "Faturas do cartão".</p>
            </div>
          )}
          {form.fixa && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-freq">Repete</Label>
              <Select value={form.frequencia} onValueChange={v => set('frequencia')(v as 'mensal' | 'anual')}>
                <SelectTrigger id="fin-freq"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mensal">Todo mês</SelectItem>
                  <SelectItem value="anual">Todo ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="fin-due">{rotuloDoDia}</Label>
            <Input id="fin-due" type="date" value={form.due_date} onChange={e => set('due_date')(e.target.value)} />
          </div>
          {form.fixa ? (
            <div className="space-y-1.5">
              <Label htmlFor="fin-ate">Até (opcional)</Label>
              <Input id="fin-ate" type="date" value={form.ate} min={form.due_date || undefined} onChange={e => set('ate')(e.target.value)} />
              <p className="text-[12px] text-muted-foreground">Sem data, repete até você encerrar.</p>
            </div>
          ) : (<>
            <div className="space-y-1.5">
              <Label htmlFor="fin-doc">Documento</Label>
              <Input id="fin-doc" value={form.document_number} onChange={e => set('document_number')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-settled">{kind === 'payable' ? 'Data do pagamento' : 'Data do recebimento'}</Label>
              <Input id="fin-settled" type="date" value={form.settled_at} onChange={e => set('settled_at')(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fin-status">Situação</Label>
              <Select value={form.status} onValueChange={v => set('status')(v as FinStatus)}>
                <SelectTrigger id="fin-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(FIN_STATUS_LABEL) as FinStatus[]).map(s => (
                    <SelectItem key={s} value={s}>{FIN_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>)}
          <div className="space-y-1.5">
            <Label htmlFor="fin-cc">Centro de custo</Label>
            <Input id="fin-cc" list="fin-cc-lista" value={form.cost_center} onChange={e => set('cost_center')(e.target.value)} />
            <datalist id="fin-cc-lista">{centros.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="fin-notes">Observações</Label>
            <Textarea id="fin-notes" rows={3} value={form.notes} onChange={e => set('notes')(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          {faltaCartao && <p className="text-[13px] text-muted-foreground mr-auto self-center">Escolha o cartão.</p>}
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={saving || !form.description.trim() || !form.due_date || !form.amount || faltaCartao}>
            {saving ? 'Salvando…' : form.fixa && !entry ? 'Criar conta fixa' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
