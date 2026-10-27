// As compras anteriores de um item (dono, 2026-10-03; refeito em 2026-10-27: "não tem histórico para a diretoria ver
// quais foram os últimos fornecedores aprovados e qual valor foi pago"). Aparece ao lado do pedido em Aprovar compras
// e ao clicar no produto, no Catálogo. O preço por unidade é o que se compara: o total depende da quantidade.
import { format, parseISO } from 'date-fns';
import { History } from 'lucide-react';
import { formatBRL } from '@/types/financeiro';
import { comUnidade, porUnidade } from '@/lib/unidades-de-compra';
import type { CompraDoHistorico } from '@/hooks/usePurchases';

const data = (iso: string | null) => (iso ? format(parseISO(iso), 'dd/MM/yyyy') : '—');

export function HistoricoDoItem({ anteriores, limite = 5 }: { anteriores: CompraDoHistorico[]; limite?: number }) {
  const ultima = anteriores[0];
  return (
    <div className="rounded-md border border-border">
      <p className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-muted-foreground border-b border-border">
        <History className="w-3.5 h-3.5" aria-hidden="true" /> Compras anteriores deste item
      </p>
      {!ultima ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">Primeira compra deste item.</p>
      ) : (
        <>
          {ultima.unitario != null && (
            <p className="px-3 py-2 text-[13px] border-b border-border">
              Última: <b>{formatBRL(ultima.unitario)}</b> {porUnidade(ultima.unidade)}, com {ultima.fornecedor ?? '—'}, em {data(ultima.data)}.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-medium">Data</th>
                  <th className="px-3 py-1.5 font-medium">Fornecedor aprovado</th>
                  <th className="px-3 py-1.5 font-medium text-right">Quantidade</th>
                  <th className="px-3 py-1.5 font-medium text-right">Por unidade</th>
                  <th className="px-3 py-1.5 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {anteriores.slice(0, limite).map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-mono whitespace-nowrap">{data(c.data)}</td>
                    <td className="px-3 py-1.5">{c.fornecedor ?? '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-right whitespace-nowrap">{c.quantidade != null ? comUnidade(Number(c.quantidade), c.unidade) : '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-right whitespace-nowrap">{c.unitario != null ? `${formatBRL(c.unitario)}/${c.unidade}` : '—'}</td>
                    <td className="px-3 py-1.5 font-mono text-right whitespace-nowrap">{c.valor != null ? formatBRL(c.valor) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {anteriores.length > limite && (
        <p className="px-3 py-1.5 text-[12px] text-muted-foreground border-t border-border">e mais {anteriores.length - limite} compra(s) antes.</p>
      )}
    </div>
  );
}
