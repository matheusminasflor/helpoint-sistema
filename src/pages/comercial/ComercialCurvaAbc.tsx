// A visão "Curva ABC" do Insights do Comercial (L6b): Pareto por produto e
// todos os produtos por faixa. Ver `.scratch/plano-l6b-curva-e-condicao.md`.
//
// A conta mora no banco (§4.7 do plano da L6a, que vale aqui também):
// `com_curva_abc` já devolve participação, acumulado e faixa prontos —
// esta tela nunca soma ou classifica nada em TypeScript.
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useCurvaAbc, useCurvaAbcFaixas } from '@/hooks/useComercialPainel';
import { formatBRL } from '@/types/financeiro';
import type { CriterioCurva, FaixaCurva, Filial } from '@/types/comercial';

const FAIXA_BADGE: Record<FaixaCurva, string> = {
  A: 'badge-success',
  B: 'badge-warning',
  C: 'badge-neutral',
  '-': 'badge-danger',
};

const FAIXA_TITULO: Record<FaixaCurva, string> = {
  A: 'A — até 80% do acumulado',
  B: 'B — até 95% do acumulado',
  C: 'C — acima de 95%',
  '-': 'Fora da curva (saldo líquido ≤ 0 no período)',
};

export default function ComercialCurvaAbc() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');

  const periodo = useMemo(() => ({ de: `${ano}-01-01`, ate: `${ano}-12-31` }), [ano]);
  const { data, isLoading } = useCurvaAbc(periodo.de, periodo.ate, filial, criterio);
  const { data: faixas } = useCurvaAbcFaixas(periodo.de, periodo.ate, filial, criterio);
  const linhas = data?.linhas ?? [];

  const classificadas = linhas.filter((l) => l.faixa !== '-');

  // A3 (correção da auditoria): a contagem dos cartões vem de
  // `com_curva_abc_faixas`, que soma no banco sobre a base INTEIRA do
  // período — nunca sobre `linhas`, que `buscarComTeto` corta em 500. A
  // tabela abaixo continua lendo `linhas` e mostrando o aviso de corte; só a
  // contagem muda de fonte. Faixa sem produto no período não vem na
  // resposta — por isso o valor-base é zero.
  const contagemPorFaixa: Record<FaixaCurva, number> = { A: 0, B: 0, C: 0, '-': 0 };
  for (const f of faixas ?? []) contagemPorFaixa[f.faixa] = f.produtos;

  // Pareto: barra do valor/quantidade e linha do acumulado, só para os
  // produtos classificados (A/B/C) — o gráfico é a leitura rápida, a
  // tabela abaixo é "todos os produtos por faixa" por inteiro.
  const dadosGrafico = classificadas.slice(0, 20).map((l) => ({
    nome: l.nome.length > 18 ? `${l.nome.slice(0, 18)}…` : l.nome,
    metrica: criterio === 'valor' ? l.valor : l.quantidade,
    acumulado: l.acumulado ?? 0,
  }));

  const formatarMetrica = (v: number) => (criterio === 'valor' ? formatBRL(v) : v.toLocaleString('pt-BR'));

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Curva ABC</h1>
        <p className="text-[13px] text-muted-foreground">Pareto e todos os produtos por faixa, a partir do que foi importado.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
        <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="valor">Por valor</SelectItem>
            <SelectItem value="quantidade">Por quantidade</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {criterio === 'quantidade' && (
        <p className="text-[12px] text-muted-foreground rounded-md border border-dashed border-border px-3 py-2">
          Unidades misturam sachê de 12 ml com máscara de 1 kg — a curva por quantidade não pesa o tamanho do produto.
        </p>
      )}

      {!isLoading && linhas.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-[13px] text-muted-foreground">
          Sem venda em {ano}.
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(['A', 'B', 'C', '-'] as FaixaCurva[]).map((faixa) => (
              <div key={faixa} className="rounded-lg border border-border bg-card p-4">
                <div className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${FAIXA_BADGE[faixa]}`}>
                  {faixa === '-' ? 'Fora da curva' : `Faixa ${faixa}`}
                </div>
                <div className="mt-1 text-xl font-semibold font-mono">{contagemPorFaixa[faixa]}</div>
                <div className="text-[11px] text-muted-foreground">{FAIXA_TITULO[faixa]}</div>
              </div>
            ))}
          </div>

          {dadosGrafico.length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <div className="text-[13px] font-semibold mb-3">Pareto — os produtos que mais pesam no período</div>
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dadosGrafico}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="nome" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} interval={0} angle={-30} textAnchor="end" height={70} />
                  <YAxis yAxisId="metrica" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <YAxis yAxisId="acumulado" orientation="right" domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => (name === 'acumulado' ? `${value.toFixed(1)}%` : formatarMetrica(value))}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar yAxisId="metrica" dataKey="metrica" name={criterio === 'valor' ? 'Valor' : 'Quantidade'} fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="acumulado" type="monotone" dataKey="acumulado" name="acumulado" stroke="hsl(var(--status-warning))" strokeWidth={2} dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Todos os produtos por faixa</div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                  <th className="px-3 py-1.5 font-semibold text-right">{criterio === 'valor' ? 'Valor' : 'Quantidade'}</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Participação</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Acumulado</th>
                  <th className="px-3 py-1.5 font-semibold text-center">Faixa</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.produto_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{l.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatarMetrica(criterio === 'valor' ? l.valor : l.quantidade)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{l.participacao !== null ? `${l.participacao.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{l.acumulado !== null ? `${l.acumulado.toFixed(1)}%` : '—'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${FAIXA_BADGE[l.faixa]}`}>{l.faixa}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data?.cortou && (
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                Lista maior que o mostrado aqui — estreite o período ou a filial para ver o restante.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
