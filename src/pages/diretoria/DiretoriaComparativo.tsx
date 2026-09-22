// Aba "Comparativo entre anos" do Painel Diretor. Ver
// docs/instrucoes-painel-comercial.md (INSTRUCOES v7) §15: mesmo mês lado a
// lado, com variação calculada só sobre os meses fechados (regra pura em
// `src/lib/comparativoAnos.ts`), e carteiras ano a ano. Lê `metas_ano`
// (total, informado) e `metas_carteira` (por carteira, informado) — nunca
// `com_metas_x_realizado` (a função saiu: somava venda, era o erro).
import { useMemo, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCarteiras, useMetasAnoDoAno, useMetasAnosDisponiveis, useMetasCarteiraDoAno } from '@/hooks/useComercialCarteirasMetas';
import { MESES, mesesFechados, realizadoPorMes, somaComAusencia, variacaoSobreMesesFechados } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import { todayISO } from '@/lib/dates';

const ANO_ATUAL = new Date().getFullYear();

export default function DiretoriaComparativo() {
  const [ano, setAno] = useState(ANO_ATUAL);
  const anoAnterior = ano - 1;

  const { data: anosDisponiveis = [ANO_ATUAL] } = useMetasAnosDisponiveis();
  const { data: metasAnoAtual = [], isLoading: l1 } = useMetasAnoDoAno(ano);
  const { data: metasAnoAnterior = [], isLoading: l2 } = useMetasAnoDoAno(anoAnterior);
  const { data: metasCarteiraAtual = [], isLoading: l3 } = useMetasCarteiraDoAno(ano);
  const { data: metasCarteiraAnterior = [], isLoading: l4 } = useMetasCarteiraDoAno(anoAnterior);
  const { data: carteiras = [], isLoading: l5 } = useCarteiras();
  const isLoading = l1 || l2 || l3 || l4 || l5;

  const fechados = useMemo(() => mesesFechados(ano, todayISO()), [ano]);

  const porMes = useMemo(() => ({
    atual: realizadoPorMes(metasAnoAtual),
    anterior: realizadoPorMes(metasAnoAnterior),
  }), [metasAnoAtual, metasAnoAnterior]);

  const variacaoGeral = variacaoSobreMesesFechados(porMes.atual, porMes.anterior, fechados);

  const porCarteira = useMemo(() => carteiras.map((nome) => ({
    nome,
    atual: somaComAusencia(metasCarteiraAtual.filter((l) => l.carteira === nome).map((l) => l.realizado)),
    anterior: somaComAusencia(metasCarteiraAnterior.filter((l) => l.carteira === nome).map((l) => l.realizado)),
  })), [carteiras, metasCarteiraAtual, metasCarteiraAnterior]);

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
            {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
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
                    <td className="py-1.5 px-3 text-right font-mono">{porMes.atual[i] != null ? formatBRL(porMes.atual[i]!) : '—'}</td>
                    <td className="py-1.5 px-3 text-right font-mono">{porMes.anterior[i] != null ? formatBRL(porMes.anterior[i]!) : '—'}</td>
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
                      <td className="py-1.5 px-3 text-right font-mono">{c.atual != null ? formatBRL(c.atual) : '—'}</td>
                      <td className="py-1.5 px-3 text-right font-mono">{c.anterior != null ? formatBRL(c.anterior) : '—'}</td>
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
