// Visão "Clientes" da Diretoria (§14 itens 4 e 5 do documento do dono,
// item 3 do plano da Frente 3): faturamento por cliente (todos, sem filtro
// de faixa) e evolução por faixa A/B/C mês a mês — as duas são "todos os
// clientes", e por isso vivem juntas aqui. Clicar num cliente abre a
// mesma ficha do Comercial (porta única, item 2 do plano).
//
// Backend já existia (`com_faturamento_por_cliente`, `com_evolucao_por_
// faixa`) — esta leva constrói a tela. Cor/intensidade e o layout de barra
// empilhada da evolução são a Frente 4; aqui a tabela é texto, funcional.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useEvolucaoPorFaixa, useFaturamentoPorCliente, usePeriodoComercial } from '@/hooks/useComercialPainel';
import { linkFichaCliente } from '@/config/comercial-insights';
import { formatBRL } from '@/types/financeiro';
import type { CriterioCurva, Filial } from '@/types/comercial';

export default function DiretoriaClientes() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  const { periodo, setPeriodo, mes, setMes, de, ate } = usePeriodoComercial(ano);

  const { data: faturamento, isLoading: carregandoFaturamento } = useFaturamentoPorCliente(de, ate, filial, criterio);
  const { data: evolucao, isLoading: carregandoEvolucao } = useEvolucaoPorFaixa(de, ate, filial, criterio);

  const linhasFaturamento = faturamento?.linhas ?? [];
  const linhasEvolucao = evolucao?.linhas ?? [];

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Users}
        title="Clientes"
        description="Faturamento por cliente e evolução por faixa A/B/C — todos os clientes, sem filtro de faixa."
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <FiltrosComerciais
            ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
            periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
          />
          <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="valor">Por valor</SelectItem>
              <SelectItem value="quantidade">Por quantidade</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* §14 item 4. */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Faturamento por cliente</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold">Tabela</th>
                <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
                <th className="px-3 py-1.5 font-semibold text-right">Bonificação</th>
                <th className="px-3 py-1.5 font-semibold text-right">SKUs</th>
                <th className="px-3 py-1.5 font-semibold text-right">Meses ativos</th>
              </tr>
            </thead>
            <tbody>
              {linhasFaturamento.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline">{c.nome}</Link>
                    {c.em_condicao && <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>}
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{c.tabela_preco ?? '—'}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.faturamento)}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.bonificacao)}</td>
                  <td className="px-3 py-1.5 text-right">{c.skus}</td>
                  <td className="px-3 py-1.5 text-right">{c.meses_ativos}</td>
                </tr>
              ))}
              {!carregandoFaturamento && linhasFaturamento.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {faturamento?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>

        {/* §14 item 5 — barra empilhada e alternância número/barra são a Frente 4; aqui, texto por mês. */}
        <div className="rounded-lg border border-border overflow-x-auto">
          <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Evolução por faixa, mês a mês</div>
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-secondary/60 text-left text-muted-foreground">
                <th className="px-3 py-1.5 font-semibold">Cliente</th>
                <th className="px-3 py-1.5 font-semibold text-right">Total</th>
                <th className="px-3 py-1.5 font-semibold">Por mês (A / B / C / fora da curva)</th>
              </tr>
            </thead>
            <tbody>
              {linhasEvolucao.map((c) => (
                <tr key={c.cliente_codigo} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <Link to={linkFichaCliente(c.cliente_codigo)} className="text-primary hover:underline">{c.nome}</Link>
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.total)}</td>
                  <td className="px-3 py-1.5 text-[11px] text-muted-foreground">
                    {c.meses.map((m) => (
                      <span key={m.competencia} className="inline-block mr-3 whitespace-nowrap">
                        {m.competencia.slice(0, 7)}: {formatBRL(m.valor_a)} / {formatBRL(m.valor_b)} / {formatBRL(m.valor_c)}
                        {m.valor_outros !== 0 && ` / ${formatBRL(m.valor_outros)}`}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
              {!carregandoEvolucao && linhasEvolucao.length === 0 && (
                <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período selecionado.</td></tr>
              )}
            </tbody>
          </table>
          {evolucao?.cortou && (
            <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
              Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
