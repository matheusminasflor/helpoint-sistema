import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { expectRows, mensagemDeErro } from '@/lib/supabase-result';
import { parseAmount } from '@/lib/planilha';

/**
 * Quem compra cota (etapa 4b, migration 20270201020000): enquanto a compra espera a aprovação, inclui os orçamentos
 * que faltam — quem pediu disse só um, ou nenhum. O total do orçamento o banco calcula (`compras_orcamento_total`).
 */
export function IncluirOrcamento({ requestId, posicao, onDone }: { requestId: string; posicao: number; onDone: () => void }) {
  const { tenantId } = useAuth();
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [fornecedor, setFornecedor] = useState('');
  const [valor, setValor] = useState('');
  const [frete, setFrete] = useState('');
  const [prazo, setPrazo] = useState('');
  const [link, setLink] = useState('');
  const [gravando, setGravando] = useState(false);
  const unitario = parseAmount(valor) ?? NaN;
  const valido = fornecedor.trim() !== '' && unitario > 0;

  const gravar = async () => {
    setGravando(true);
    try {
      expectRows(await supabase.from('compras_orcamentos').insert({
        tenant_id: tenantId, request_id: requestId, supplier: fornecedor.trim(), valor_unitario: unitario, amount: unitario,
        frete: parseAmount(frete) ?? 0, prazo_entrega_dias: /^\d+$/.test(prazo.trim()) ? Number(prazo) : null,
        link: link.trim() || null, position: posicao,
      } as never).select('id'), 'o orçamento');
      toast.success('Orçamento incluído.');
      setAberto(false); setFornecedor(''); setValor(''); setFrete(''); setPrazo(''); setLink('');
      void qc.invalidateQueries({ queryKey: ['fin-purchase-request'] });
      void qc.invalidateQueries({ queryKey: ['fin-purchase-requests'] });
      onDone();
    } catch (e) {
      toast.error('Não incluiu o orçamento', { description: mensagemDeErro(e) });
    } finally {
      setGravando(false);
    }
  };

  if (!aberto) return <Button variant="outline" size="sm" onClick={() => setAberto(true)}>Incluir orçamento</Button>;
  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-[14px] font-medium">Novo orçamento</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor="orc-forn">Fornecedor *</Label><Input id="orc-forn" value={fornecedor} onChange={(e) => setFornecedor(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="orc-valor">Valor unitário (R$) *</Label><Input id="orc-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="orc-frete">Frete (R$)</Label><Input id="orc-frete" inputMode="decimal" value={frete} onChange={(e) => setFrete(e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="orc-prazo">Prazo de entrega (dias)</Label><Input id="orc-prazo" inputMode="numeric" value={prazo} onChange={(e) => setPrazo(e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="orc-link">Link de compra</Label><Input id="orc-link" value={link} onChange={(e) => setLink(e.target.value)} /></div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => setAberto(false)}>Cancelar</Button>
        <Button size="sm" disabled={!valido || gravando} onClick={gravar}>{gravando ? 'Gravando…' : 'Incluir'}</Button>
      </div>
    </div>
  );
}
