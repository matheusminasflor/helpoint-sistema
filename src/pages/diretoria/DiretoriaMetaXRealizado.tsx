// Aba "Meta × realizado" do Painel Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: os cinco
// indicadores do ano, o gráfico mês a mês (tracejado para meta, cheio para
// realizado, verde quando bate e vermelho quando não) e a tabela por
// carteira com peso e cobertura.
//
// `com_metas_x_realizado` devolve por carteira; o realizado do mês é a soma
// de todas as linhas daquele mês (inclui "Sem carteira" — a conferência que
// impede a tela de mentir). A meta TOTAL da empresa é outra coisa
// (`carteira_id` nulo em `com_metas`, não em `com_metas_x_realizado`): lida
// direto da tabela, nunca somada às metas de carteira.
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMetasDoAno, useMetasXRealizado } from '@/hooks/useComercialCarteirasMetas';
import { mesesFechados } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import { todayISO } from '@/lib/dates';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i);

export default function DiretoriaMetaXRealizado() {
  const [ano, setAno] = useState(ANO_ATUAL);

  const { data: linhasAno = [], isLoading: l1 } = useMetasXRealizado(ano, null);
  const { data: linhasAnoAnterior = [], isLoading: l2 } = useMetasXRealizado(ano - 1, null);
  const { data: metasDoAno = [], isLoading: l3 } = useMetasDoAno(ano);
  const isLoading = l1 || l2 || l3;

  const fechados = useMemo(() => mesesFechados(ano, todayISO()), [ano]);

  // Realizado por mês: soma de TODAS as linhas daquele mês (carteiras + Sem
  // carteira) — nunca só as carteiras, senão a soma mentiria.
  const realizadoPorMes = useMemo(() => {
    const somas = Array<number>(12).fill(0);
    for (const l of linhasAno) somas[Number(l.competencia.slice(5, 7)) - 1] += l.realizado;
    return somas;
  }, [linhasAno]);
  const realizadoAnteriorPorMes = useMemo(() => {
    const somas = Array<number>(12).fill(0);
    for (const l of linhasAnoAnterior) somas[Number(l.competencia.slice(5, 7)) - 1] += l.realizado;
    return somas;
  }, [linhasAnoAnterior]);

  // Meta TOTAL da empresa por mês — carteira_id nulo em com_metas, nunca a
  // soma das metas de carteira (podem divergir; o diretor define as duas).
  const metaTotalPorMes = useMemo(() => {
    const somas = Array<number | null>(12).fill(null);
    for (const m of metasDoAno) if (m.carteira_id === null) somas[m.mes - 1] = m.valor;
    return somas;
  }, [metasDoAno]);

  const dadosGrafico = MESES.map((label, i) => ({
    mes: label,
    realizado: realizadoPorMes[i],
    meta: metaTotalPorMes[i],
    bate: metaTotalPorMes[i] == null ? null : realizadoPorMes[i] >= (metaTotalPorMes[i] as number),
  }));

  const mesesFechadosIdx = fechados.reduce<number[]>((acc, f, i) => (f ? [...acc, i] : acc), []);
  const somaFechados = (arr: number[]) => mesesFechadosIdx.reduce((s, i) => s + arr[i], 0);

  const realizadoDoPeriodo = somaFechados(realizadoPorMes);
  const metaDoPeriodo = mesesFechadosIdx.reduce((s, i) => s + (metaTotalPorMes[i] ?? 0), 0);
  const metaDoAno = metaTotalPorMes.reduce<number>((s, v) => s + (v ?? 0), 0);
  const mesmoPeriodoAnoAnterior = somaFechados(realizadoAnteriorPorMes);
  const fechamentoAnoAnterior = realizadoAnteriorPorMes.reduce((s, v) => s + v, 0);

  // Tabela por carteira: peso e cobertura já vêm calculados; "Sem carteira"
  // entra também — é o mesmo balde que garante a soma fechada acima.
  const carteirasNoAno = useMemo(() => {
    const nomes = Array.from(new Set(linhasAno.map((l) => l.carteira_nome)));
    return nomes.map((nome) => {
      const linhasDaCarteira = linhasAno.filter((l) => l.carteira_nome === nome);
      const realizado = linhasDaCarteira.reduce((s, l) => s + l.realizado, 0);
      const meta = linhasDaCarteira.reduce<number | null>((s, l) => (l.meta == null ? s : (s ?? 0) + l.meta), null);
      const pesoMedio = linhasDaCarteira.reduce((s, l) => s + (l.peso ?? 0), 0) / linhasDaCarteira.length;
      return { nome, realizado, meta, cobertura: meta ? realizado / meta : null, peso: pesoMedio };
    });
  }, [linhasAno]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          <BarChart3 className="w-4 h-4" aria-hidden="true" /> Meta × realizado
        </h2>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANOS_DISPONIVEIS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Skeleton className="h-72 w-full" /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Indicador titulo="Realizado no período" valor={realizadoDoPeriodo} />
            <Indicador titulo="Meta do período" valor={metaDoPeriodo} vazio={metaDoPeriodo === 0} />
            <Indicador titulo="Meta do ano" valor={metaDoAno} vazio={metaDoAno === 0} />
            <Indicador titulo={`Mesmo período em ${ano - 1}`} valor={mesmoPeriodoAnoAnterior} />
            <Indicador titulo={`Fechamento de ${ano - 1}`} valor={fechamentoAnoAnterior} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                <Tooltip formatter={(v: number) => formatBRL(v)} />
                <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                  {dadosGrafico.map((d) => (
                    <Cell key={d.mes} fill={d.bate == null ? 'hsl(var(--muted-foreground))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
                  ))}
                </Bar>
                <Line dataKey="meta" name="Meta" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="py-2 px-3 font-medium">Carteira</th>
                  <th className="py-2 px-3 font-medium text-right">Realizado</th>
                  <th className="py-2 px-3 font-medium text-right">Meta</th>
                  <th className="py-2 px-3 font-medium text-right">Cobertura</th>
                  <th className="py-2 px-3 font-medium text-right">Peso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {carteirasNoAno.map((c) => (
                  <tr key={c.nome}>
                    <td className="py-1.5 px-3">{c.nome}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{formatBRL(c.realizado)}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{c.meta != null ? formatBRL(c.meta) : '—'}</td>
                    <td className="py-1.5 px-3 text-right">{c.cobertura != null ? `${Math.round(c.cobertura * 100)}%` : '—'}</td>
                    <td className="py-1.5 px-3 text-right">{Math.round(c.peso * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({ titulo, valor, vazio }: { titulo: string; valor: number; vazio?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {vazio ? <span className="text-muted-foreground font-normal">sem meta definida</span> : formatBRL(valor)}
      </p>
    </div>
  );
}
