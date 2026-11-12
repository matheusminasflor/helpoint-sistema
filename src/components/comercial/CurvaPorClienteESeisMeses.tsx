// As abas "Por cliente" e "Últimos 6 meses" da Curva ABC (revisão aprovada pelo dono, https://claude.ai/artifact/
// DogLjeM9MuJUzFt2H7ALFV, 7.6; o dono pediu em 2026-11-11 para fazer). Reusam as consultas da Diretoria › Clientes
// (`com_faturamento_por_cliente`, `com_evolucao_por_faixa`): nada de conta nova no banco.
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { useEvolucaoPorFaixa, useFaturamentoPorCliente } from '@/hooks/useComercialPainel';
import { useTenantPath } from '@/hooks/useTenantPath';
import { FAIXA_BADGE, linkFichaCliente } from '@/config/comercial-insights';
import { faixasDosClientes, inicioDosUltimosMeses } from '@/lib/curva-abc-de-clientes';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, competenceLabel } from '@/types/financeiro';
import type { CriterioCurva, Filial } from '@/types/comercial';

export function CurvaPorCliente({ de, ate, filial, criterio }: { de: string; ate: string; filial: Filial | null; criterio: CriterioCurva }) {
  const tenantPath = useTenantPath();
  const { data, isLoading } = useFaturamentoPorCliente(de, ate, filial, criterio);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const linhas = faixasDosClientes(data?.linhas ?? []);
  const conta = (f: string) => linhas.filter((l) => l.faixa === f).length;
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[14px] flex flex-wrap gap-3">
        <span className="font-semibold">Clientes por faixa</span>
        <span className="text-muted-foreground">A {conta('A')} · B {conta('B')} · C {conta('C')} — A são os que somam 80% do faturamento</span>
      </div>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Cliente</th>
            <th className="px-3 py-1.5 font-semibold text-right">Faturamento</th>
            <th className="px-3 py-1.5 font-semibold text-right">Acumulado</th>
            <th className="px-3 py-1.5 font-semibold text-center">Faixa</th>
            <th className="px-3 py-1.5 font-semibold text-right">Produtos diferentes</th>
            <th className="px-3 py-1.5 font-semibold text-right">Meses com compra</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.cliente_codigo} className="border-t border-border">
              <td className="px-3 py-1.5"><Link to={tenantPath(linkFichaCliente(l.cliente_codigo))} className="text-primary hover:underline" title={l.nome}>{limparNomeCliente(l.nome)}</Link></td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.faturamento)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.faixa === '-' ? '—' : `${l.acumulado.toFixed(1)}%`}</td>
              <td className="px-3 py-1.5 text-center"><span className={`inline-flex px-2 py-0.5 rounded text-[12px] font-semibold ${FAIXA_BADGE[l.faixa]}`}>{l.faixa}</span></td>
              <td className="px-3 py-1.5 text-right font-mono">{l.skus}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.meses_ativos}</td>
            </tr>
          ))}
          {linhas.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Sem venda no período.</td></tr>}
        </tbody>
      </table>
      {data?.cortou && <p className="px-4 py-2 text-[12px] text-muted-foreground border-t border-border">Lista maior que o mostrado aqui — estreite a filial para ver o restante.</p>}
    </div>
  );
}

export function CurvaNosUltimosSeisMeses({ ate, filial, criterio }: { ate: string; filial: Filial | null; criterio: CriterioCurva }) {
  const de = inicioDosUltimosMeses(ate, 6);
  const { data, isLoading } = useEvolucaoPorFaixa(de, ate, filial, criterio);
  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const porMes = new Map<string, { mes: string; A: number; B: number; C: number }>();
  for (const cliente of data?.linhas ?? []) {
    for (const m of cliente.meses) {
      const x = porMes.get(m.competencia) ?? { mes: competenceLabel(m.competencia), A: 0, B: 0, C: 0 };
      x.A += m.valor_a; x.B += m.valor_b; x.C += m.valor_c;
      porMes.set(m.competencia, x);
    }
  }
  const meses = [...porMes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  return (
    <div className="rounded-lg border border-border p-4 space-y-2">
      <p className="text-[14px] font-semibold">Faturamento por faixa, mês a mês, nos últimos 6 meses</p>
      <p className="text-[13px] text-muted-foreground">Se a parte da faixa A cai mês a mês, a venda está dependendo de produtos que vendem pouco.</p>
      {meses.length === 0 ? <p className="text-[13px] text-muted-foreground">Sem venda nos últimos 6 meses.</p> : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={meses}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis dataKey="mes" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
            <Tooltip formatter={(v: number) => formatBRL(v)} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
            <Legend />
            <Bar dataKey="A" name="Faixa A" stackId="f" fill="hsl(var(--status-success))" />
            <Bar dataKey="B" name="Faixa B" stackId="f" fill="hsl(var(--status-warning))" />
            <Bar dataKey="C" name="Faixa C" stackId="f" fill="hsl(var(--muted-foreground))" />
          </BarChart>
        </ResponsiveContainer>
      )}
      {data?.cortou && <p className="text-[12px] text-status-warning">A lista de clientes passou do limite e o gráfico ficou incompleto: escolha uma filial.</p>}
    </div>
  );
}
