import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PurchaseRequestFields } from '@/components/compras/PurchaseRequestFields';
import { useAuth } from '@/contexts/AuthContext';
import { useTICategories } from '@/hooks/useTICategories';
import { useCaixinhas } from '@/hooks/useCaixinha';
import { useAbrirPedidoDeCompra } from '@/hooks/usePurchases';
import {
  emptyPurchaseValue, orcamentosPreenchidos, pedidoSimplesVazio, validarPedidoDeCompra, validarPedidoSimples, type PurchaseFieldsValue,
} from '@/lib/pedido-de-compra';
import { parseAmount } from '@/lib/planilha';
import { mensagemDeErro } from '@/lib/supabase-result';
import { normalizarSetor } from '@/lib/setores';

/**
 * Pedir compra (etapa 4b): fora da grade de chamados. O tipo de compra (as categorias de Compras — a Caixinha é uma
 * delas), o quê, quanto, o setor que paga, para quê e, se souber, um orçamento. Desde a rodada 2 a compra é um pedido
 * (sem chamado por trás): `onEnviado` recebe o id dele, e quem pediu acompanha em Pedidos.
 */
export function PedirCompraDialog({ onFechar, onEnviado }: { onFechar: () => void; onEnviado: (pedidoId: string) => void }) {
  const { profile } = useAuth();
  const { rootCategories } = useTICategories('compras');
  const tipos = rootCategories.filter((c) => c.is_purchase);
  const { data: caixinhas = [] } = useCaixinhas();
  const abrir = useAbrirPedidoDeCompra();
  const [tipo, setTipo] = useState('');
  const [caixinhaId, setCaixinhaId] = useState('');
  const [paraQue, setParaQue] = useState('');
  const [motivoPoucos, setMotivoPoucos] = useState('');
  // Três orçamentos (dono, 2026-10-29); a Caixinha segue com um só, opcional.
  const [pedido, setPedido] = useState<PurchaseFieldsValue>(() => emptyPurchaseValue(profile?.department));
  useEffect(() => {
    const sugerido = normalizarSetor(profile?.department);
    if (sugerido) setPedido((p) => (p.setor ? p : { ...p, setor: sugerido }));
  }, [profile?.department]);

  const categoria = tipos.find((c) => c.id === tipo);
  const caixinha = !!categoria?.caixinha;
  // Trocar o tipo entre Caixinha e compra comum ajusta as vagas de orçamento (1 ↔ 3), sem perder o que já foi digitado.
  useEffect(() => {
    setPedido((p) => {
      const vagas = caixinha ? 1 : 3;
      if (p.quotes.length === vagas) return p;
      const vazio = pedidoSimplesVazio().quotes[0];
      const quotes = caixinha ? p.quotes.slice(0, 1) : [...p.quotes, ...Array.from({ length: vagas - p.quotes.length }, () => ({ ...vazio }))];
      return { ...p, quotes, recomendado: caixinha ? null : p.recomendado };
    });
  }, [caixinha]);
  const poucos = !caixinha && orcamentosPreenchidos(pedido).length < 3;
  const falta = !categoria ? 'Escolha o tipo de compra.'
    : caixinha && !caixinhaId ? 'Escolha de qual Caixinha sai.'
    : caixinha ? validarPedidoSimples(pedido)
    : validarPedidoDeCompra(pedido, motivoPoucos);

  const enviar = () => abrir.mutate({
    chamado: {
      title: `Compra: ${pedido.productName.trim()}`, description: paraQue.trim(),
      category_id: categoria!.id,
    },
    input: {
      product_id: pedido.productId, product_name: pedido.productName, department: pedido.setor || null,
      quantidade: parseAmount(pedido.quantidade) ?? 1, unidade: pedido.unidade, caixinha_id: caixinha ? caixinhaId : null,
      recomendado: caixinha ? null : pedido.recomendado, motivoRecomendacao: pedido.motivoRecomendacao,
      motivoPoucosOrcamentos: poucos ? motivoPoucos : '', quotes: pedido.quotes,
    },
  }, {
    onSuccess: ({ id }) => { toast.success('Compra pedida. Acompanhe por aqui e em Pedidos.'); onEnviado(id); },
    onError: (e) => toast.error('Não pediu a compra', { description: mensagemDeErro(e) }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pedir compra</DialogTitle>
          <DialogDescription>
            O quê, quanto, para quê e os orçamentos (no mínimo três). Depois de enviado, o pedido vai para Compras e espera
            a aprovação; aprovado, Compras compra.
          </DialogDescription>
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
          <PurchaseRequestFields value={pedido} onChange={setPedido} orcamentoOpcional={caixinha} />
          {poucos && (
            <div className="space-y-1.5 rounded-lg border border-status-warning/40 badge-warning p-3">
              <Label htmlFor="compra-poucos" className="text-[14px]">Por que menos de três orçamentos? *</Label>
              <Textarea id="compra-poucos" rows={2} value={motivoPoucos} onChange={(e) => setMotivoPoucos(e.target.value)}
                placeholder="Ex.: só esta gráfica tem a faca do nosso rótulo." />
              <p className="text-[12px]">Quem aprova vê este motivo junto do pedido.</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="compra-para-que">Descrição: para quê <span className="font-normal text-muted-foreground">(opcional)</span></Label>
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
