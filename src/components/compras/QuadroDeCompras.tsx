// O quadro de compras: a coluna e o cartão, usados em Aprovar compras (2026-10-13) e em Solicitações de
// compra (2026-10-14, dono: "Solicitações de compra ser formato Kanban também").
import type { ReactNode } from 'react';
import { paradaDaCompra } from '@/lib/parada-da-compra';
import { rotuloDoSetor } from '@/lib/setores';
import { formatBRL } from '@/types/financeiro';
import { comUnidade } from '@/lib/unidades-de-compra';
import type { PurchaseRequestRow } from '@/hooks/usePurchases';

export function Coluna({ titulo, pedidos, cartao, vazio, destaque }: {
  titulo: string; pedidos: PurchaseRequestRow[]; cartao: (p: PurchaseRequestRow) => ReactNode; vazio: string; destaque?: boolean;
}) {
  // No celular as colunas vêm uma embaixo da outra, na largura da tela (R3): de lado, só se via uma e o pedaço da outra.
  return (
    <section className={`w-full sm:w-[290px] shrink-0 rounded-xl p-2 grid gap-2 ${destaque ? 'bg-primary/5 ring-1 ring-primary/20' : 'bg-muted/50'}`} aria-label={titulo}>
      <h2 className="px-1 pt-1 text-[14px] font-bold">{titulo} <span className="font-normal text-muted-foreground">({pedidos.length})</span></h2>
      {pedidos.map((p) => <div key={p.id}>{cartao(p)}</div>)}
      {pedidos.length === 0 && <p className="px-1 pb-2 text-[13px] text-muted-foreground">{vazio}</p>}
    </section>
  );
}

export function Cartao({ p, nome, onAbrir, extra, rodape, aprovada }: {
  p: PurchaseRequestRow; nome?: string; onAbrir: (id: string) => void; extra?: ReactNode; rodape?: ReactNode; aprovada?: boolean;
}) {
  // Depois de aprovada, vale a quantidade aprovada; o valor já é o total aprovado (`estimated_amount`).
  const qtd = Number((aprovada ? p.quantidade_aprovada : null) ?? p.quantidade ?? 1);
  return (
    <button type="button" onClick={() => onAbrir(p.id)}
      className="w-full grid gap-1.5 rounded-lg border border-border bg-card p-3 text-left shadow-sm hover:border-primary/60 transition-colors">
      <span className="text-[14px] font-semibold leading-snug">{p.product_name} <span className="font-normal text-muted-foreground">· {comUnidade(qtd, p.unidade)}</span></span>
      <span className="flex items-center justify-between gap-2 text-[13px]">
        <span className="font-mono font-semibold tabular-nums">{p.estimated_amount != null ? formatBRL(Number(p.estimated_amount)) : '—'}</span>
        <span className="text-muted-foreground">{rotuloDoSetor(p.department)}</span>
      </span>
      <span className="text-[13px] text-muted-foreground truncate">Pedido por {nome ?? '—'}</span>
      {extra}
      {(() => {
        const parada = paradaDaCompra(p);
        if (!parada || parada.dias < 1) return null;
        return (
          <span className={`text-[12px] tabular-nums ${parada.dias >= parada.limite ? 'text-status-danger font-semibold' : 'text-muted-foreground'}`}>
            {parada.rotulo ?? 'parada há'} {parada.dias} {parada.dias === 1 ? 'dia' : 'dias'}
          </span>
        );
      })()}
      {rodape && <span className="text-[12px] text-muted-foreground">{rodape}</span>}
    </button>
  );
}
