// "Histórico por família" da ficha do cliente (decisão do dono, 2026-10-03): o que o cliente
// compra de cada família, mês a mês, e as compras item a item. Segue o período e a filial que a
// ficha já recebe — nunca um seletor próprio.
//
// A família é a de Comercial › Configurações › Famílias de produto: sugerida pelo nome e
// confirmada pelo Comercial. Produto sem família aparece como "Sem família", nunca some.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import { MESES } from '@/lib/comparativoAnos';
import { montarQuadro } from '@/lib/historico-por-familia';
import { useComprasDoCliente, useHistoricoPorFamilia } from '@/hooks/useComercialFamilias';
import type { Filial } from '@/types/comercial';

const PRIMEIRA_PAGINA = 20;
const MAIS = 50;

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function HistoricoPorFamilia({
  codigo, de, ate, filial,
}: { codigo: string; de: string; ate: string; filial: Filial | null }) {
  const [mostrar, setMostrar] = useState<'quantidade' | 'valor'>('quantidade');
  const [limite, setLimite] = useState(PRIMEIRA_PAGINA);
  const historico = useHistoricoPorFamilia(codigo, de, ate, filial);
  const compras = useComprasDoCliente(codigo, de, ate, filial, limite);

  const quadro = montarQuadro(historico.data ?? []);
  const variosAnos = de.slice(0, 4) !== ate.slice(0, 4);
  const rotuloMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]}${variosAnos ? `/${m.slice(2, 4)}` : ''}`;
  // O número da célula é o escolhido; o outro vai no `title` (passar o mouse).
  const texto = (c: { quantidade: number; valor: number }) => (mostrar === 'quantidade' ? fmtQtd(c.quantidade) : formatBRL(c.valor));
  const dica = (c: { quantidade: number; valor: number }) =>
    mostrar === 'quantidade' ? formatBRL(c.valor) : `${fmtQtd(c.quantidade)} un.`;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">Histórico por família</span>
          <div className="flex gap-1">
            <Button size="sm" variant={mostrar === 'quantidade' ? 'secondary' : 'ghost'} onClick={() => setMostrar('quantidade')}>
              Quantidade
            </Button>
            <Button size="sm" variant={mostrar === 'valor' ? 'secondary' : 'ghost'} onClick={() => setMostrar('valor')}>
              Valor
            </Button>
          </div>
        </div>
        {historico.isError ? (
          <p className="px-4 py-3 text-[12px] text-destructive">Não consegui carregar o histórico por família.</p>
        ) : historico.isLoading ? (
          <p className="px-4 py-3 text-[12px] text-muted-foreground">Carregando…</p>
        ) : quadro.meses.length === 0 ? (
          <p className="px-4 py-3 text-[12px] text-muted-foreground">Nenhuma compra no período.</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Família</th>
                {quadro.meses.map((m) => <th key={m} className="px-3 py-1.5 font-semibold text-right">{rotuloMes(m)}</th>)}
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {quadro.familias.map((f) => {
                const total = quadro.totalDaFamilia(f);
                return (
                  <tr key={f} className="border-t">
                    <td className="px-3 py-1.5">{f}</td>
                    {quadro.meses.map((m) => {
                      const c = quadro.celula(m, f);
                      return (
                        <td key={m} className="px-3 py-1.5 text-right font-mono" title={c ? dica(c) : undefined}>
                          {c ? texto(c) : <span className="text-muted-foreground">—</span>}
                        </td>
                      );
                    })}
                    <td className="px-3 py-1.5 text-right font-mono font-semibold" title={dica(total)}>{texto(total)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">
          Compras no período{compras.data ? ` (${compras.data.total})` : ''}
        </div>
        {compras.isError ? (
          <p className="px-4 py-3 text-[12px] text-destructive">Não consegui carregar as compras.</p>
        ) : (compras.data?.linhas.length ?? 0) === 0 ? (
          <p className="px-4 py-3 text-[12px] text-muted-foreground">{compras.isLoading ? 'Carregando…' : 'Nenhuma compra no período.'}</p>
        ) : (
          <>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Emissão</th>
                  <th className="px-3 py-1.5 font-semibold">Nota</th>
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                  <th className="px-3 py-1.5 font-semibold">Família</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Qtd.</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {compras.data!.linhas.map((c, i) => (
                  <tr key={`${c.documento}-${c.serie}-${c.produto_codigo}-${i}`} className="border-t">
                    <td className="px-3 py-1.5 font-mono">{formatDateBR(c.emissao)}</td>
                    <td className="px-3 py-1.5 font-mono">
                      {c.documento}
                      {c.classe === 'devolucao' && <span className="ml-1 text-[10px] text-muted-foreground">(devolução)</span>}
                    </td>
                    <td className="px-3 py-1.5">{c.produto}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.familia}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmtQtd(c.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compras.data!.total > compras.data!.linhas.length && (
              <div className="px-4 py-2 border-t border-border">
                <Button size="sm" variant="ghost" onClick={() => setLimite((n) => n + MAIS)} disabled={compras.isFetching}>
                  Ver mais ({compras.data!.total - compras.data!.linhas.length} restantes)
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
