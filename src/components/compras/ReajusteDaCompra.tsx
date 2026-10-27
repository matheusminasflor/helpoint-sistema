// Reajustar o valor depois de aprovada (dono, 2026-10-19: "demorou tanto para liberar a forma de pagamento que agora,
// com o prazo curto, terei que pagar frete"). Quem compra muda o valor unitário e o frete, com motivo, antes de pagar;
// até 10% a mais vale na hora, acima disso o aprovador decide. As regras moram no banco (`compras_reajustar`,
// 20270128060000); aqui só a tela e o histórico "aprovado R$ X → reajustado R$ Y, por quê".
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useDecidirReajuste, useReajustarCompra, useReajustesDaCompra } from '@/hooks/usePurchases';
import { formatBRLAmount, type PurchaseQuote, type PurchaseRequest } from '@/types/purchases';
import { comUnidade, porUnidade } from '@/lib/unidades-de-compra';
import { dataHora } from '@/lib/dates';

const STATUS = { aplicado: 'badge-success', aguardando: 'badge-warning', recusado: 'badge-danger' } as const;
const ROTULO = { aplicado: 'Valendo', aguardando: 'Aguardando o aprovador', recusado: 'Recusado' } as const;
const numero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'));

export function ReajusteDaCompra({ request, quote, podeReajustar, podeDecidir }: {
  request: PurchaseRequest;
  quote: PurchaseQuote | undefined;
  /** Quem compra, com a compra aprovada e ainda não paga (o banco confere de novo). */
  podeReajustar: boolean;
  podeDecidir: boolean;
}) {
  const { data: reajustes = [] } = useReajustesDaCompra(request.id);
  const reajustar = useReajustarCompra();
  const decidir = useDecidirReajuste();
  const [abrindo, setAbrindo] = useState(false);
  const [recusa, setRecusa] = useState('');
  const qtd = Number(request.quantidade_aprovada ?? request.quantidade ?? 1);
  const unitarioAtual = quote ? Number(quote.valor_unitario ?? (Number(quote.amount) - Number(quote.frete ?? 0)) / Number(request.quantidade ?? 1)) : 0;
  const freteAtual = Number(quote?.frete ?? 0);
  const totalAtual = Number(request.estimated_amount ?? 0);
  const [unitario, setUnitario] = useState('');
  const [frete, setFrete] = useState('');
  // A quantidade só diminui (dono, 2026-10-21): o banco recusa acima da aprovada.
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const aguardando = reajustes.find((r) => r.status === 'aguardando');

  const u = unitario.trim() ? numero(unitario) : unitarioAtual;
  const fr = frete.trim() ? numero(frete) : freteAtual;
  const q = quantidade.trim() ? numero(quantidade) : qtd;
  const quantidadeValida = q > 0 && q <= qtd;
  const novoTotal = Math.round((u * q + fr) * 100) / 100;
  const valido = u > 0 && fr >= 0 && quantidadeValida && motivo.trim() !== '' && (novoTotal !== totalAtual || q !== qtd);
  const precisaAprovar = novoTotal > Math.round(totalAtual * 1.1 * 100) / 100;

  if (reajustes.length === 0 && !podeReajustar) return null;

  return (
    <div className="space-y-2 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">Reajuste de valor e quantidade</p>
        {podeReajustar && !aguardando && (
          <Button size="sm" variant="outline" className="h-7" onClick={() => {
            setUnitario(String(unitarioAtual).replace('.', ',')); setFrete(String(freteAtual).replace('.', ','));
            setQuantidade(String(qtd).replace('.', ',')); setMotivo(''); setAbrindo(true);
          }}>
            Reajustar
          </Button>
        )}
      </div>
      {reajustes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Mudou o preço ou apareceu frete depois da aprovação? Reajuste antes de pagar: até 10% a mais vale na hora; acima disso, quem aprova decide.
        </p>
      )}
      {reajustes.map((r) => (
        <div key={r.id} className="rounded-md border border-border p-2.5 text-sm space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              <span className="font-mono">{formatBRLAmount(r.total_de)}</span> → <span className="font-mono font-medium">{formatBRLAmount(r.total_para)}</span>
              <span className="text-xs text-muted-foreground"> · frete {formatBRLAmount(Number(r.frete_de ?? 0))} → {formatBRLAmount(r.frete_para)}</span>
              {r.quantidade_para != null && Number(r.quantidade_para) !== Number(r.quantidade_de) && (
                <span className="text-xs text-muted-foreground"> · quantidade {comUnidade(Number(r.quantidade_de), request.unidade)} → {comUnidade(Number(r.quantidade_para), request.unidade)}</span>
              )}
            </span>
            <Badge className={STATUS[r.status]}>{ROTULO[r.status]}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{r.quem?.full_name ?? '—'} · {dataHora(r.pedido_em)} · {r.motivo}</p>
          {r.decisao_obs && <p className="text-xs">Aprovador: {r.decisao_obs}</p>}
          {r.status === 'aguardando' && podeDecidir && (
            <div className="space-y-1.5 pt-1">
              <Input className="h-8 text-sm" placeholder="Para recusar, escreva o motivo" value={recusa} onChange={(e) => setRecusa(e.target.value)} />
              <div className="flex gap-2">
                <Button size="sm" className="h-7" disabled={decidir.isPending}
                  onClick={() => decidir.mutate({ reajusteId: r.id, aprova: true, obs: '' })}>
                  Aprovar o reajuste
                </Button>
                <Button size="sm" variant="outline" className="h-7" disabled={decidir.isPending || !recusa.trim()}
                  onClick={() => decidir.mutate({ reajusteId: r.id, aprova: false, obs: recusa }, { onSuccess: () => setRecusa('') })}>
                  Recusar
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {abrindo && (
        <Dialog open onOpenChange={(o) => !o && setAbrindo(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reajustar a compra</DialogTitle>
              <DialogDescription>
                Aprovado: {formatBRLAmount(totalAtual)} ({comUnidade(qtd, request.unidade)} × {formatBRLAmount(unitarioAtual)} {porUnidade(request.unidade)} + frete {formatBRLAmount(freteAtual)}).
                A quantidade só pode diminuir; o fornecedor fica o aprovado.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="rj-qtd">Quantidade (até {comUnidade(qtd, request.unidade)})</Label>
                  <Input id="rj-qtd" inputMode="decimal" className="font-mono" value={quantidade}
                    aria-invalid={!quantidadeValida} onChange={(e) => setQuantidade(e.target.value)} />
                  {!quantidadeValida && (
                    <p className="text-xs text-status-danger">Só para menos: até {comUnidade(qtd, request.unidade)}. Para comprar mais, abra outra compra.</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rj-unit">Valor {porUnidade(request.unidade)} (R$)</Label>
                  <Input id="rj-unit" inputMode="decimal" className="font-mono" value={unitario} onChange={(e) => setUnitario(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rj-frete">Frete (R$)</Label>
                  <Input id="rj-frete" inputMode="decimal" className="font-mono" value={frete} onChange={(e) => setFrete(e.target.value)} />
                </div>
              </div>
              <p className="text-sm">
                Novo total: <span className="font-mono font-medium">{Number.isFinite(novoTotal) ? formatBRLAmount(novoTotal) : '—'}</span>
                {Number.isFinite(novoTotal) && novoTotal !== totalAtual && (
                  <span className={precisaAprovar ? 'text-status-warning' : 'text-muted-foreground'}>
                    {precisaAprovar ? ' — mais de 10%: vai para o aprovador decidir.' : ' — até 10%: vale na hora, e quem aprova é avisado.'}
                  </span>
                )}
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="rj-motivo">Motivo *</Label>
                <Textarea id="rj-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: a forma de pagamento demorou e, com o prazo curto, o fornecedor cobra frete." />
              </div>
              <p className="text-xs text-muted-foreground">
                Se a conta a pagar já existe e não foi paga, ela é corrigida com o valor novo e o Financeiro é avisado.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAbrindo(false)}>Cancelar</Button>
              <Button disabled={!valido || reajustar.isPending}
                onClick={() => reajustar.mutate({ requestId: request.id, valorUnitario: u, frete: fr, quantidade: q, motivo }, { onSuccess: () => setAbrindo(false) })}>
                {precisaAprovar ? 'Enviar para o aprovador' : 'Reajustar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
