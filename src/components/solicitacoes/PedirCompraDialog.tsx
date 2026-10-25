import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PurchaseRequestFields } from '@/components/financeiro/PurchaseRequestFields';
import { useAuth } from '@/contexts/AuthContext';
import { useTICategories } from '@/hooks/useTICategories';
import { useCaixinhas } from '@/hooks/useCaixinha';
import { useAbrirPedidoDeCompra } from '@/hooks/usePurchases';
import { pedidoSimplesVazio, validarPedidoSimples, type PurchaseFieldsValue } from '@/lib/pedido-de-compra';
import { parseAmount } from '@/lib/planilha';
import { mensagemDeErro } from '@/lib/supabase-result';
import { normalizarSetor } from '@/lib/setores';

/**
 * Pedir compra (etapa 4b): fora da grade de chamados. O tipo de compra (as categorias de Compras — a Caixinha é uma
 * delas), o quê, quanto, o setor que paga, para quê e, se souber, um orçamento. A compra nasce com o chamado por trás,
 * sem aparecer para quem pede (as telas de Compras são presas a ele); quem pediu acompanha em "Minhas compras".
 */
export function PedirCompraDialog({ onFechar, onEnviado }: { onFechar: () => void; onEnviado: () => void }) {
  const { profile } = useAuth();
  const { rootCategories } = useTICategories('compras');
  const tipos = rootCategories.filter((c) => c.is_purchase);
  const { data: caixinhas = [] } = useCaixinhas();
  const abrir = useAbrirPedidoDeCompra();
  const [tipo, setTipo] = useState('');
  const [caixinhaId, setCaixinhaId] = useState('');
  const [paraQue, setParaQue] = useState('');
  const [pedido, setPedido] = useState<PurchaseFieldsValue>(() => pedidoSimplesVazio(profile?.department));
  useEffect(() => {
    const sugerido = normalizarSetor(profile?.department);
    if (sugerido) setPedido((p) => (p.setor ? p : { ...p, setor: sugerido }));
  }, [profile?.department]);

  const categoria = tipos.find((c) => c.id === tipo);
  const caixinha = !!categoria?.caixinha;
  const falta = !categoria ? 'Escolha o tipo de compra.'
    : caixinha && !caixinhaId ? 'Escolha de qual Caixinha sai.'
    : validarPedidoSimples(pedido);

  const enviar = () => abrir.mutate({
    chamado: {
      title: `Compra: ${pedido.productName.trim()}`, description: paraQue.trim(),
      category_id: categoria!.id, category: categoria!.name,
    },
    input: {
      product_id: pedido.productId, product_name: pedido.productName, department: pedido.setor || null,
      quantidade: parseAmount(pedido.quantidade) ?? 1, caixinha_id: caixinha ? caixinhaId : null,
      recomendado: null, motivoRecomendacao: '', quotes: pedido.quotes,
    },
  }, {
    onSuccess: () => { toast.success('Compra pedida. Acompanhe em "Minhas compras".'); onEnviado(); },
    onError: (e) => toast.error('Não pediu a compra', { description: mensagemDeErro(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedir compra</DialogTitle>
          <DialogDescription>O quê, quanto e para quê. Quem compra faz as cotações; quem aprova decide.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="compra-tipo">Tipo de compra *</Label>
            <select id="compra-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
              <option value="">Escolha…</option>
              {tipos.map((c) => <option key={c.id} value={c.id}>{c.name}{c.caixinha && !/caixinha/i.test(c.name) ? ' (Caixinha)' : ''}</option>)}
            </select>
          </div>
          {caixinha && (
            <div className="space-y-1.5">
              <Label htmlFor="compra-caixinha">De qual Caixinha sai? *</Label>
              <select id="compra-caixinha" value={caixinhaId} onChange={(e) => setCaixinhaId(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-background px-2 text-sm">
                <option value="">Escolha…</option>
                {caixinhas.map((c) => <option key={c.id} value={c.id}>Caixinha {c.filial}</option>)}
              </select>
            </div>
          )}
          <PurchaseRequestFields value={pedido} onChange={setPedido} orcamentoOpcional />
          <div className="space-y-1.5">
            <Label htmlFor="compra-para-que">Para quê <span className="font-normal text-muted-foreground">(opcional)</span></Label>
            <Textarea id="compra-para-que" rows={2} value={paraQue} onChange={(e) => setParaQue(e.target.value)}
              placeholder="Ex.: a cadeira da recepção quebrou" />
          </div>
        </div>
        <DialogFooter className="flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          {falta && <p className="text-[13px] text-muted-foreground sm:mr-auto">{falta}</p>}
          <Button variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button disabled={!!falta || abrir.isPending} onClick={enviar}>{abrir.isPending ? 'Enviando…' : 'Pedir compra'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
