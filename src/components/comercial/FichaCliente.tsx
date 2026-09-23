// A ficha do cliente (L6c) — o que compra, o que veio bonificado, parou de
// comprar e nunca comprou. Extraída de `ComercialClientes.tsx` para a
// correção do item 3 do plano da Frente 3: a Diretoria (`DiretoriaClientes.
// tsx`) também precisa dela, e a porta única não pode jogar quem está lá
// para fora do módulo — mesmo componente nos dois lados, nunca uma cópia.
//
// Quem chama decide o período (`de`/`ate`) e o texto do título: o Comercial
// usa o ano inteiro (não tem seletor de período nesta visão), a Diretoria
// usa o período escolhido em `usePeriodoComercial` — a ficha não presume
// nenhum dos dois.
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { useFichaCliente } from '@/hooks/useComercialCashback';
import { formatBRL } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

export function FichaClienteSecao({
  codigo, de, ate, filial, titulo, onFechar,
}: { codigo: string; de: string; ate: string; filial: Filial | null; titulo: string; onFechar: () => void }) {
  const { data: ficha, isLoading } = useFichaCliente(codigo, de, ate, filial);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">{titulo}</h2>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          <X className="w-3.5 h-3.5 mr-1" /> Fechar ficha
        </Button>
      </div>

      {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}

      {ficha && (
        <>
          <FichaTabela titulo="Comprou" linhas={ficha.comprou} vazio="Nada comprado no período." />
          <FichaTabela titulo="Bonificado" linhas={ficha.bonificado} vazio="Nenhuma bonificação no período." />

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Parou de comprar</div>
            <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
              Comprou em pelo menos 2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                </tr>
              </thead>
              <tbody>
                {ficha.parou_de_comprar.map((p) => (
                  <tr key={p.produto_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{p.nome}</td>
                  </tr>
                ))}
                {ficha.parou_de_comprar.length === 0 && (
                  <tr><td className="px-3 py-4 text-center text-muted-foreground">Nenhum produto parou.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Nunca comprou</div>
            <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
              Ordenado pelo que o produto vendeu no período para os outros clientes — o que ele está deixando de comprar que mais gira.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Vendido para outros no período</th>
                </tr>
              </thead>
              <tbody>
                {ficha.nunca_comprou.map((p) => (
                  <tr key={p.produto_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{p.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_outros)}</td>
                  </tr>
                ))}
                {ficha.nunca_comprou.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Nada — comprou de tudo.</td></tr>
                )}
              </tbody>
            </table>
            {ficha.nunca_comprou_total > ficha.nunca_comprou.length && (
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                Mostrando {ficha.nunca_comprou.length} de {ficha.nunca_comprou_total}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FichaTabela({
  titulo, linhas, vazio,
}: {
  titulo: string;
  linhas: { produto_codigo: string; nome: string; valor: number; quantidade: number }[];
  vazio: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">{titulo}</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{vazio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
