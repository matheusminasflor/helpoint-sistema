// Aba "Meta × realizado" do Painel Diretor. Ver
// docs/metas-e-carteiras-fonte-da-verdade.md (manda sobre tudo aqui) e
// .scratch/plano-frente2-metas-e-carteiras.md §5: os cinco indicadores do
// ano, o gráfico mês a mês (tracejado para meta, cheio para realizado,
// verde quando bate e vermelho quando não), a tabela ANUAL por carteira
// (peso e cobertura do ano) e a grade "carteiras mês a mês".
//
// Duas fontes de REALIZADO, nunca fundidas: `metas_ano` (total da EMPRESA,
// olhando pra trás — o que o diretor JÁ MEDIU no HISTORICO_METAS.json)
// alimenta o gráfico e os cinco indicadores. `metas_carteira` (realizado por
// carteira, também informado, nunca somado de `com_vendas_itens`) alimenta
// as duas tabelas por carteira; a meta QUE APARECE NELAS vem de `com_metas`
// — o que o diretor DEFINE por carteira daqui pra frente, na grade da aba
// Metas. Peso e cobertura são divisão pura de dois números já lidos
// (`src/lib/metas-carteira-calc.ts`), nunca agregação nova no banco.
//
// A META TOTAL do gráfico e dos indicadores JÁ fundiu as duas fontes (item 3
// da correção da auditoria, 2026-09-22, docs/metas-e-carteiras-fonte-da-
// verdade.md §3): a definida no sistema (`com_metas`, carteira nula) vence;
// onde o diretor não definiu, vale a importada (`metas_ano.meta`). Regra em
// `metaOficialPorMes` — as duas nunca podem divergir em silêncio.
import { useMemo, useState } from 'react';
import { Bar, CartesianGrid, Cell, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3, CalendarRange } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useCarteiras, useMetasAnoDoAno, useMetasCarteiraDoAno, useMetasAnosDisponiveis, useMetasDoAno,
} from '@/hooks/useComercialCarteirasMetas';
import { MESES, mesesFechados, metaOficialPorMes, realizadoPorMes, somaComAusencia } from '@/lib/comparativoAnos';
import { calcularCobertura, calcularPeso } from '@/lib/metas-carteira-calc';
import { formatBRL } from '@/types/financeiro';
import { todayISO } from '@/lib/dates';

const ANO_ATUAL = new Date().getFullYear();

export default function DiretoriaMetaXRealizado() {
  const [ano, setAno] = useState(ANO_ATUAL);

  const { data: anosDisponiveis = [ANO_ATUAL] } = useMetasAnosDisponiveis();
  const { data: metasAnoAtual = [], isLoading: l1 } = useMetasAnoDoAno(ano);
  const { data: metasAnoAnterior = [], isLoading: l2 } = useMetasAnoDoAno(ano - 1);
  const { data: metasCarteiraAno = [], isLoading: l3 } = useMetasCarteiraDoAno(ano);
  const { data: carteiras = [], isLoading: l4 } = useCarteiras();
  const { data: comMetasAno = [], isLoading: l5 } = useMetasDoAno(ano);
  const isLoading = l1 || l2 || l3 || l4 || l5;

  const fechados = useMemo(() => mesesFechados(ano, todayISO()), [ano]);

  // Total e meta da empresa, por mês — leitura direta de metas_ano, nunca
  // soma de com_metas_x_realizado (a função saiu: era o erro desta leva).
  const realizadoMesAtual = useMemo(() => realizadoPorMes(metasAnoAtual), [metasAnoAtual]);
  const realizadoMesAnterior = useMemo(() => realizadoPorMes(metasAnoAnterior), [metasAnoAnterior]);
  // A meta importada (metas_ano.meta) e a que o diretor DEFINIU no sistema
  // (com_metas, carteira nula) — `metaOficialPorMes` decide qual vence.
  const metaImportadaPorMes = useMemo(() => {
    const somas = Array<number | null>(12).fill(null);
    for (const m of metasAnoAtual) somas[m.mes - 1] = m.meta;
    return somas;
  }, [metasAnoAtual]);
  const metaDefinidaPorMes = useMemo(() => {
    const somas = Array<number | null>(12).fill(null);
    for (const m of comMetasAno) if (m.carteira === null) somas[m.mes - 1] = m.valor;
    return somas;
  }, [comMetasAno]);
  const metaTotalPorMes = useMemo(
    () => metaOficialPorMes(metaImportadaPorMes, metaDefinidaPorMes),
    [metaImportadaPorMes, metaDefinidaPorMes],
  );

  const dadosGrafico = MESES.map((label, i) => ({
    mes: label,
    realizado: realizadoMesAtual[i],
    meta: metaTotalPorMes[i],
    bate: metaTotalPorMes[i] == null || realizadoMesAtual[i] == null ? null : realizadoMesAtual[i]! >= metaTotalPorMes[i]!,
  }));

  // As cinco indicadores do §15 — `somaComAusencia` é a defesa contra o bug
  // desta leva ("Fechamento de 2025: R$ 0,00"): um ano sem NENHUM dado soma
  // nulo, nunca zero.
  const realizadoDoPeriodo = somaComAusencia(realizadoMesAtual.filter((_, i) => fechados[i]));
  const metaDoPeriodo = somaComAusencia(metaTotalPorMes.filter((_, i) => fechados[i]));
  const metaDoAno = somaComAusencia(metaTotalPorMes);
  const mesmoPeriodoAnoAnterior = somaComAusencia(realizadoMesAnterior.filter((_, i) => fechados[i]));
  const fechamentoAnoAnterior = somaComAusencia(realizadoMesAnterior);

  // Mapas de apoio para as duas tabelas por carteira — uma leitura de cada
  // fonte, nunca uma consulta nova por célula.
  const totalRealizadoAno = useMemo(() => somaComAusencia(metasAnoAtual.map((m) => m.total_realizado)), [metasAnoAtual]);
  const realizadoPorCarteiraEMes = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const l of metasCarteiraAno) m.set(`${l.carteira}-${l.mes}`, l.realizado);
    return m;
  }, [metasCarteiraAno]);
  const metaPorCarteiraEMes = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of comMetasAno) if (l.carteira) m.set(`${l.carteira}-${l.mes}`, l.valor);
    return m;
  }, [comMetasAno]);

  const carteirasNoAno = useMemo(() => carteiras.map((nome) => {
    const realizadoMeses = Array.from({ length: 12 }, (_, i) => realizadoPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null);
    const realizado = somaComAusencia(realizadoMeses);
    const meta = somaComAusencia(Array.from({ length: 12 }, (_, i) => metaPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null));
    return {
      nome,
      realizado,
      meta,
      cobertura: calcularCobertura(realizado, meta),
      peso: calcularPeso(realizado, totalRealizadoAno),
    };
  }), [carteiras, realizadoPorCarteiraEMes, metaPorCarteiraEMes, totalRealizadoAno]);

  const carteirasMesAMes = useMemo(() => carteiras.map((nome) => ({
    nome,
    porMes: Array.from({ length: 12 }, (_, i) => {
      const realizado = realizadoPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null;
      const meta = metaPorCarteiraEMes.get(`${nome}-${i + 1}`) ?? null;
      return {
        peso: calcularPeso(realizado, metasAnoAtual.find((m) => m.mes === i + 1)?.total_realizado ?? null),
        meta,
        cobertura: calcularCobertura(realizado, meta),
      };
    }),
  })), [carteiras, realizadoPorCarteiraEMes, metaPorCarteiraEMes, metasAnoAtual]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4" aria-hidden="true" /> Meta × realizado
          </h2>
          {/* Não há seletor de filial aqui de propósito. O dono confirmou em
              2026-09-22 que a meta dele é consolidada; filtrar o realizado por
              INBRAS ou MF contra uma meta que vale pelas duas faria a cobertura
              mentir. Ver docs/nao-funciona.md. */}
          <p className="text-[11px] text-muted-foreground mt-0.5">
            As duas filiais juntas — a meta é consolidada, então não há como separar a cobertura por filial.
          </p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Skeleton className="h-72 w-full" /> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Indicador titulo="Realizado no período" valor={realizadoDoPeriodo} />
            <Indicador titulo="Meta do período" valor={metaDoPeriodo} />
            <Indicador titulo="Meta do ano" valor={metaDoAno} />
            <Indicador titulo={`Mesmo período em ${ano - 1}`} valor={mesmoPeriodoAnoAnterior} />
            <Indicador titulo={`Fechamento de ${ano - 1}`} valor={fechamentoAnoAnterior} />
          </div>

          <div className="rounded-lg border border-border p-3">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={dadosGrafico} margin={{ left: 8, right: 16, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="mes" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={(v) => formatBRL(v)} width={70} />
                <Tooltip formatter={(v: number | null) => (v == null ? 'sem dado' : formatBRL(v))} />
                <Bar dataKey="realizado" name="Realizado" radius={[3, 3, 0, 0]}>
                  {dadosGrafico.map((d) => (
                    <Cell key={d.mes} fill={d.bate == null ? 'hsl(var(--muted-foreground))' : d.bate ? 'hsl(var(--status-success))' : 'hsl(var(--status-danger))'} />
                  ))}
                </Bar>
                <Line dataKey="meta" name="Meta" stroke="hsl(var(--foreground))" strokeDasharray="5 5" dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-foreground mb-2">Carteiras no ano</h3>
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
                      <td className="py-1.5 px-3 text-right font-mono">{c.realizado != null ? formatBRL(c.realizado) : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{c.meta != null ? formatBRL(c.meta) : '—'}</td>
                      <td className="py-1.5 px-3 text-right">{c.cobertura != null ? `${Math.round(c.cobertura * 100)}%` : '—'}</td>
                      <td className="py-1.5 px-3 text-right">{c.peso != null ? `${Math.round(c.peso * 100)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> Carteiras mês a mês
            </h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium sticky left-0 bg-muted/40">Carteira</th>
                    {MESES.map((m) => <th key={m} className="py-2 px-2 text-right font-medium min-w-[100px]">{m}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {carteirasMesAMes.map((c) => (
                    <tr key={c.nome}>
                      <td className="py-1.5 px-3 sticky left-0 bg-card">{c.nome}</td>
                      {c.porMes.map((l, i) => (
                        <td key={i} className="py-1.5 px-2 text-right align-top">
                          <div className="font-medium">{l.peso != null ? `${Math.round(l.peso * 100)}%` : '—'}</div>
                          <div className="text-muted-foreground">{l.meta != null ? formatBRL(l.meta) : '—'}</div>
                          <div className="text-muted-foreground">{l.cobertura != null ? `${Math.round(l.cobertura * 100)}%` : '—'}</div>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Em cada mês: peso, meta e cobertura, nesta ordem.</p>
          </div>
        </>
      )}
    </div>
  );
}

function Indicador({ titulo, valor }: { titulo: string; valor: number | null }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-[11px] text-muted-foreground">{titulo}</p>
      <p className="text-sm font-semibold text-foreground mt-0.5">
        {valor == null ? <span className="text-muted-foreground font-normal">sem dado</span> : formatBRL(valor)}
      </p>
    </div>
  );
}
