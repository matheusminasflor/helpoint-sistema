// Quem pediu a compra corrige os orçamentos depois de "Solicitar ajustes" e reenvia (decisão do dono,
// 2026-10-03; 20261130010000). Só os orçamentos e a resposta: produto e setor ficam — o banco barra.
import { useState } from 'react';
import { Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResubmitPurchase, type OrcamentoEditado } from '@/hooks/usePurchases';
import type { PurchaseRequest } from '@/types/purchases';

interface Linha extends Omit<OrcamentoEditado, 'amount'> { valor: string }

export function AjusteDaCompra({ request, onDone }: { request: PurchaseRequest; onDone?: () => void }) {
  const reenviar = useResubmitPurchase();
  const [linhas, setLinhas] = useState<Linha[]>(() => (request.quotes ?? []).map(q => ({
    id: q.id, supplier: q.supplier, valor: String(q.amount), link: q.link, notes: q.notes ?? null, file: null,
  })));
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [resposta, setResposta] = useState('');

  const muda = (i: number, campo: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));
  const tira = (i: number) => {
    const l = linhas[i];
    if (l.id) setRemovidos(r => [...r, l.id!]);
    setLinhas(ls => ls.filter((_, j) => j !== i));
  };
  const valido = linhas.length > 0 && linhas.every(l => l.supplier.trim() && Number(l.valor) > 0);

  const enviar = async () => {
    await reenviar.mutateAsync({
      request,
      quotes: linhas.map(l => ({ ...l, amount: Number(l.valor) })),
      removidos,
      response: resposta,
    });
    onDone?.();
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 p-3">
      <p className="text-sm font-medium">Corrija os orçamentos e reenvie</p>
      {linhas.map((l, i) => (
        <div key={l.id ?? `novo-${i}`} className="grid gap-2 sm:grid-cols-[1fr_120px_auto] items-start border-b border-border pb-2">
          <div className="space-y-1.5">
            <Input placeholder="Fornecedor" value={l.supplier} onChange={e => muda(i, { supplier: e.target.value })} />
            <Input placeholder="Link (opcional)" value={l.link ?? ''} onChange={e => muda(i, { link: e.target.value })} />
            <Input placeholder="Observação do orçamento (frete, prazo…)" value={l.notes ?? ''} onChange={e => muda(i, { notes: e.target.value })} />
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              {l.file ? l.file.name : 'Anexar orçamento (opcional)'}
              <input type="file" className="hidden" onChange={e => muda(i, { file: e.target.files?.[0] ?? null })} />
            </label>
          </div>
          <Input type="number" step="0.01" min={0} placeholder="Valor" value={l.valor} onChange={e => muda(i, { valor: e.target.value })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => tira(i)} aria-label="Tirar orçamento">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => setLinhas(ls => [...ls, { supplier: '', valor: '', link: null, notes: null, file: null }])}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Acrescentar orçamento
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor="resposta-ajuste" className="text-[13px]">O que foi ajustado</Label>
        <Textarea id="resposta-ajuste" rows={2} value={resposta} onChange={e => setResposta(e.target.value)}
          placeholder="Ex.: incluí o frete nos três orçamentos e troquei a Loja B, que não entregava a tempo." />
      </div>
      <Button onClick={enviar} disabled={!valido || reenviar.isPending}>
        <Send className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reenviar para aprovação
      </Button>
    </div>
  );
}
