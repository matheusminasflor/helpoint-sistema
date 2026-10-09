// Quem pediu a compra corrige os orçamentos depois de "Solicitar ajustes" e reenvia (decisão do dono,
// 2026-10-03; 20261130010000). A quantidade e os orçamentos (unitário, frete, prazo) e a resposta: produto e
// setor ficam — o banco barra.
import { useState } from 'react';
import { Paperclip, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResubmitPurchase, type OrcamentoEditado } from '@/hooks/usePurchases';
import { formatBRLAmount, totalDoOrcamento, type PurchaseRequest } from '@/types/purchases';

interface Linha extends Omit<OrcamentoEditado, 'valor_unitario' | 'frete' | 'prazo_entrega_dias'> {
  valor: string; frete: string; prazo: string;
}

export function AjusteDaCompra({ request, onDone }: { request: PurchaseRequest; onDone?: () => void }) {
  const reenviar = useResubmitPurchase();
  const [quantidade, setQuantidade] = useState(String(request.quantidade ?? 1));
  const [linhas, setLinhas] = useState<Linha[]>(() => (request.quotes ?? []).map(q => ({
    id: q.id, supplier: q.supplier, link: q.link, notes: q.notes ?? null, file: null,
    // Orçamento de antes de 2026-10-09 só tinha o total: vira unitário dividindo pela quantidade.
    valor: String(q.valor_unitario ?? Math.round(((Number(q.amount) - Number(q.frete ?? 0)) / Number(request.quantidade || 1)) * 100) / 100),
    frete: String(q.frete ?? 0), prazo: q.prazo_entrega_dias == null ? '' : String(q.prazo_entrega_dias),
  })));
  const [removidos, setRemovidos] = useState<string[]>([]);
  const [resposta, setResposta] = useState('');

  const muda = (i: number, campo: Partial<Linha>) => setLinhas(ls => ls.map((l, j) => (j === i ? { ...l, ...campo } : l)));
  const tira = (i: number) => {
    const l = linhas[i];
    if (l.id) setRemovidos(r => [...r, l.id!]);
    setLinhas(ls => ls.filter((_, j) => j !== i));
  };
  const qtd = Number(quantidade);
  const valido = qtd > 0 && linhas.length > 0
    && linhas.every(l => l.supplier.trim() && Number(l.valor) > 0 && Number(l.frete || 0) >= 0 && /^\d+$/.test(l.prazo.trim()));

  const enviar = async () => {
    await reenviar.mutateAsync({
      request,
      quantidade: qtd,
      quotes: linhas.map(({ valor, frete, prazo, ...l }) => ({
        ...l, valor_unitario: Number(valor), frete: Number(frete || 0), prazo_entrega_dias: Number(prazo),
      })),
      removidos,
      response: resposta,
    });
    onDone?.();
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 p-3">
      <p className="text-sm font-medium">Corrija a quantidade e os orçamentos e reenvie</p>
      <div className="flex items-center gap-2">
        <Label htmlFor="ajuste-quantidade" className="text-[14px]">Quantidade</Label>
        <Input id="ajuste-quantidade" type="number" min={0} step="any" className="w-28" value={quantidade}
          onChange={e => setQuantidade(e.target.value)} />
      </div>
      {linhas.map((l, i) => (
        <div key={l.id ?? `novo-${i}`} className="grid gap-2 sm:grid-cols-[1fr_auto] items-start border-b border-border pb-2">
          <div className="space-y-1.5">
            <Input placeholder="Fornecedor" value={l.supplier} onChange={e => muda(i, { supplier: e.target.value })} />
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input type="number" step="0.01" min={0} placeholder="Unitário" aria-label="Valor unitário" className="w-28"
                value={l.valor} onChange={e => muda(i, { valor: e.target.value })} />
              <Input type="number" step="0.01" min={0} placeholder="Frete" aria-label="Frete (0 = grátis)" className="w-24"
                value={l.frete} onChange={e => muda(i, { frete: e.target.value })} />
              <Input type="number" step="1" min={0} placeholder="Prazo" aria-label="Prazo de entrega, em dias" className="w-20"
                value={l.prazo} onChange={e => muda(i, { prazo: e.target.value })} />
              <span className="text-muted-foreground">dias · frete 0 = grátis</span>
              <span className="ml-auto font-medium">
                Total: {qtd > 0 && Number(l.valor) > 0 ? formatBRLAmount(totalDoOrcamento(Number(l.valor), qtd, Number(l.frete || 0))) : '—'}
              </span>
            </div>
            <Input placeholder="Link (opcional)" value={l.link ?? ''} onChange={e => muda(i, { link: e.target.value })} />
            <Input placeholder="Observação do orçamento (opcional)" value={l.notes ?? ''} onChange={e => muda(i, { notes: e.target.value })} />
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <Paperclip className="w-3.5 h-3.5" aria-hidden="true" />
              {l.file ? l.file.name : 'Anexar orçamento (opcional)'}
              <input type="file" className="hidden" onChange={e => muda(i, { file: e.target.files?.[0] ?? null })} />
            </label>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => tira(i)} aria-label="Tirar orçamento">
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm"
        onClick={() => setLinhas(ls => [...ls, { supplier: '', valor: '', frete: '0', prazo: '', link: null, notes: null, file: null }])}>
        <Plus className="w-3.5 h-3.5 mr-1" /> Acrescentar orçamento
      </Button>
      <div className="space-y-1.5">
        <Label htmlFor="resposta-ajuste" className="text-[14px]">O que foi ajustado</Label>
        <Textarea id="resposta-ajuste" rows={2} value={resposta} onChange={e => setResposta(e.target.value)}
          placeholder="Ex.: incluí o frete nos três orçamentos e troquei a Loja B, que não entregava a tempo." />
      </div>
      <Button onClick={enviar} disabled={!valido || reenviar.isPending}>
        <Send className="w-4 h-4 mr-1.5" aria-hidden="true" /> Reenviar para aprovação
      </Button>
    </div>
  );
}
