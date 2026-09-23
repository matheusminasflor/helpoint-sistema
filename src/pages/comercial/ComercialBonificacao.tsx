// A visão "Bonificação" do Insights do Comercial (L6b): bonificação por
// cliente e pedidos em condição. Ver `.scratch/plano-l6b-curva-e-condicao.md`.
//
// A seção de condição abre no filtro "venda" (§13 do INSTRUCOES v7, item 4
// do plano) — nos arquivos de hoje a venda em condição é R$ 0,00; a tela
// mostra zero, não esconde o filtro nem troca o padrão por causa disso.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useBonificacaoPorCliente, usePedidosEmCondicao, usePeriodoComercial } from '@/hooks/useComercialPainel';
import { linkFichaCliente } from '@/config/comercial-insights';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { Filial, Serie } from '@/types/comercial';

type FiltroCondicao = 'venda' | 'bonificacao' | 'ambos';

export default function ComercialBonificacao() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [serie, setSerie] = useState<Serie | null>(null);
  const [filtroCondicao, setFiltroCondicao] = useState<FiltroCondicao>('venda');
  // Seletor de período do §14 (correção D2): Bonificação é uma das três
  // telas cuja RPC já aceita p_de/p_ate — ver docs/nao-funciona.md para as
  // que ficaram só no ano.
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);

  const { data: bonificacao, isLoading: carregandoBonificacao } = useBonificacaoPorCliente(de, ate, filial, serie);
  const { data: condicao, isLoading: carregandoCondicao } = usePedidosEmCondicao(de, ate, filial);

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
        <FiltrosComerciais
          ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
          periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
        />
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
          Bonificação por cliente no período selecionado
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
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(b.cliente_codigo)} className="text-primary hover:underline" title={b.nome}>{limparNomeCliente(b.nome)}</Link>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{b.tabela_preco ?? '—'}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.comprado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(b.bonificado)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{b.percentual !== null ? `${b.percentual.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
            {!carregandoBonificacao && linhasBonificacao.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">Sem bonificação no período selecionado.</td></tr>
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
                <td className="px-3 py-1.5">
                  <Link to={linkFichaCliente(p.cliente_codigo)} className="text-primary hover:underline" title={p.nome}>{limparNomeCliente(p.nome)}</Link>
                </td>
                <td className="px-3 py-1.5">{competenceLabel(p.competencia)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(valorCondicao(p))}</td>
              </tr>
            ))}
            {!carregandoCondicao && linhasCondicao.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem pedido em condição no período selecionado.</td></tr>
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
