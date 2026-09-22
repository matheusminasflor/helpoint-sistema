// A visão "Bonificação" do Insights do Comercial (L6b): bonificação por
// cliente e pedidos em condição. Ver `.scratch/plano-l6b-curva-e-condicao.md`.
//
// A seção de condição abre no filtro "venda" (§13 do INSTRUCOES v7, item 4
// do plano) — nos arquivos de hoje a venda em condição é R$ 0,00; a tela
// mostra zero, não esconde o filtro nem troca o padrão por causa disso.
import { useMemo, useState } from 'react';
import { Gift } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useBonificacaoPorCliente, usePedidosEmCondicao } from '@/hooks/useComercialPainel';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { Filial, Serie } from '@/types/comercial';

type FiltroCondicao = 'venda' | 'bonificacao' | 'ambos';

export default function ComercialBonificacao() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [filtroCondicao, setFiltroCondicao] = useState<FiltroCondicao>('venda');

  const periodo = useMemo(() => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` }), [ano]);
  const { data: bonificacao, isLoading: carregandoBonificacao } = useBonificacaoPorCliente(periodo.de, periodo.ate, filial, serie);
  const { data: condicao, isLoading: carregandoCondicao } = usePedidosEmCondicao(periodo.de, periodo.ate, filial);

  const linhasBonificacao = bonificacao?.linhas ?? [];
  const linhasCondicao = condicao?.linhas ?? [];
  const valorCondicao = (p: (typeof linhasCondicao)[number]) =>
    filtroCondicao === 'venda' ? p.venda : filtroCondicao === 'bonificacao' ? p.bonificacao : p.total;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Bonificação</h1>
        <p className="text-[13px] text-muted-foreground">Bonificação por cliente e os pedidos em condição (série 75, cliente em condição).</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
        <Select value={serie ?? 'todas'} onValueChange={(v) => setSerie(v === 'todas' ? null : (v as Serie))}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Série" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">As duas séries</SelectItem>
            <SelectItem value="1">Série 1 (venda faturada)</SelectItem>
            <SelectItem value="75">Série 75 (o talão especial)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Gift className="w-4 h-4" aria-hidden="true" />
          Bonificação por cliente em {ano}
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold text-right">Comprado</th>
              <th className="px-3 py-1.5 font-semibold text-right">Bonificado</th>
              <th className="px-3 py-1.5 font-semibold text-right">% sobre o comprado</th>
            </tr>
          </thead>
          <tbody>
            {linhasBonificacao.map((b) => (
              <tr key={b.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">{b.nome}</td>
                <td className="px-3 py-1.5 text-muted-foreground">{b.tabela_preco ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.bonificado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{b.percentual !== null ? `${b.percentual.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {!carregandoBonificacao && linhasBonificacao.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Sem bonificação em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {bonificacao?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial ou a série para ver o restante.
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-semibold">Pedidos em condição</span>
          <Select value={filtroCondicao} onValueChange={(v) => setFiltroCondicao(v as FiltroCondicao)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="venda">Venda</SelectItem>
              <SelectItem value="bonificacao">Bonificação</SelectItem>
              <SelectItem value="ambos">Os dois</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
          Estes pedidos já estão no faturamento total — somar conta duas vezes.
        </p>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Competência</th>
              <th className="px-3 py-1.5 font-semibold text-right">
                {filtroCondicao === 'venda' ? 'Venda' : filtroCondicao === 'bonificacao' ? 'Bonificação' : 'Total'}
              </th>
            </tr>
          </thead>
          <tbody>
            {linhasCondicao.map((p, idx) => (
              <tr key={`${p.cliente_codigo}-${p.competencia}-${idx}`} className="border-t border-border">
                <td className="px-3 py-1.5">{p.nome}</td>
                <td className="px-3 py-1.5">{competenceLabel(p.competencia)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(valorCondicao(p))}</td>
              </tr>
            ))}
            {!carregandoCondicao && linhasCondicao.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem pedido em condição em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {condicao?.cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
          </p>
        )}
      </div>
    </div>
  );
}
