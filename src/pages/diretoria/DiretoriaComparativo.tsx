// Aba "Comparativo entre anos" do Painel Diretor (L6d). Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: mesmo mês lado a
// lado, com variação calculada só sobre os meses fechados (senão um mês em
// curso, pela metade, vira uma queda que não existe — regra pura em
// `src/lib/comparativoAnos.ts`), e carteiras ano a ano.
import { useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMetasXRealizado } from '@/hooks/useComercialCarteirasMetas';
import { mesesFechados, variacaoSobreMesesFechados } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import { todayISO } from '@/lib/dates';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const ANO_ATUAL = new Date().getFullYear();
const ANOS_DISPONIVEIS = Array.from({ length: 6 }, (_, i) => ANO_ATUAL - i);

export default function DiretoriaComparativo() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const anoAnterior = ano - 1;

  const { data: linhasAno = [], isLoading: l1 } = useMetasXRealizado(ano, null);
  const { data: linhasAnoAnterior = [], isLoading: l2 } = useMetasXRealizado(anoAnterior, null);
  const isLoading = l1 || l2;

  const fechados = useMemo(() => mesesFechados(ano, todayISO()), [ano]);

  const porMes = useMemo(() => {
    const atual = Array<number>(12).fill(0);
    const anterior = Array<number>(12).fill(0);
    for (const l of linhasAno) atual[Number(l.competencia.slice(5, 7)) - 1] += l.realizado;
    for (const l of linhasAnoAnterior) anterior[Number(l.competencia.slice(5, 7)) - 1] += l.realizado;
    return { atual, anterior };
  }, [linhasAno, linhasAnoAnterior]);

  const variacaoGeral = variacaoSobreMesesFechados(porMes.atual, porMes.anterior, fechados);

  const porCarteira = useMemo(() => {
    const nomes = Array.from(new Set([...linhasAno, ...linhasAnoAnterior].map((l) => l.carteira_nome)));
    return nomes.map((nome) => ({
      nome,
      atual: linhasAno.filter((l) => l.carteira_nome === nome).reduce((s, l) => s + l.realizado, 0),
      anterior: linhasAnoAnterior.filter((l) => l.carteira_nome === nome).reduce((s, l) => s + l.realizado, 0),
    }));
  }, [linhasAno, linhasAnoAnterior]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <ArrowRightLeft className="w-4 h-4" aria-hidden="true" /> Comparativo entre anos
          </h2>
          <p className="text-[12px] text-muted-foreground">
            {ano} contra {anoAnterior}. A variação soma só os meses já fechados de {ano} — um mês em curso não entra na conta.
          </p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {ANOS_DISPONIVEIS.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <Skeleton className="h-64 w-full" /> : (
        <>
          <div className="rounded-lg border border-border p-3 flex items-center gap-3">
            <span className="text-[12px] text-muted-foreground">Variação sobre os meses fechados:</span>
            <span className={`text-sm font-semibold ${
              variacaoGeral == null ? 'text-muted-foreground'
                : variacaoGeral >= 0 ? 'text-status-success' : 'text-status-danger'
            }`}
            >
              {variacaoGeral == null ? 'sem mês fechado ainda' : `${variacaoGeral >= 0 ? '+' : ''}${Math.round(variacaoGeral * 1000) / 10}%`}
            </span>
          </div>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40">
                <tr className="text-left">
                  <th className="py-2 px-3 font-medium">Mês</th>
                  <th className="py-2 px-3 font-medium text-right">{ano}</th>
                  <th className="py-2 px-3 font-medium text-right">{anoAnterior}</th>
                  <th className="py-2 px-3 font-medium text-center">Fechado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {MESES.map((label, i) => (
                  <tr key={label}>
                    <td className="py-1.5 px-3">{label}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{formatBRL(porMes.atual[i])}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{formatBRL(porMes.anterior[i])}</td>
                    <td className="py-1.5 px-3 text-center text-muted-foreground">{fechados[i] ? '✓' : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h3 className="text-[13px] font-semibold text-foreground mb-2">Carteiras, ano a ano</h3>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[12px]">
                <thead className="bg-muted/40">
                  <tr className="text-left">
                    <th className="py-2 px-3 font-medium">Carteira</th>
                    <th className="py-2 px-3 font-medium text-right">{ano}</th>
                    <th className="py-2 px-3 font-medium text-right">{anoAnterior}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {porCarteira.map((c) => (
                    <tr key={c.nome}>
                      <td className="py-1.5 px-3">{c.nome}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{formatBRL(c.atual)}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{formatBRL(c.anterior)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
