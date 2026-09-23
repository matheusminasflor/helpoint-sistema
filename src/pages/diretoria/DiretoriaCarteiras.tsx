// Visão "Carteiras" da Diretoria (Frente 3, item 4.3 do plano): carteiras
// mês a mês, carteiras no ano e o comparativo entre anos — as três seções
// que a aba única "Meta × realizado" empilhava junto dos cinco indicadores
// (que foram para "Resumo") e o comparativo (que já era uma aba própria,
// `DiretoriaComparativo`, reaproveitada aqui sem mudança).
import { CalendarRange, Wallet } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMetaXRealizadoAno } from '@/hooks/useDiretoriaMetaXRealizado';
import { MESES } from '@/lib/comparativoAnos';
import { formatBRL } from '@/types/financeiro';
import DiretoriaComparativo from './DiretoriaComparativo';

export default function DiretoriaCarteiras() {
  const { ano, setAno, anosDisponiveis, isLoading, carteirasNoAno, carteirasMesAMes } = useMetaXRealizadoAno();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Wallet}
        title="Carteiras"
        description="O realizado de cada carteira: no ano, mês a mês e contra o ano anterior."
      />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        <div className="flex items-center justify-end gap-2">
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <Skeleton className="h-56 w-full" /> : (
          <>
            <div>
              <h2 className="text-[13px] font-semibold text-foreground mb-2">Carteiras no ano</h2>
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
              <h2 className="text-[13px] font-semibold text-foreground mb-2 flex items-center gap-1.5">
                <CalendarRange className="w-3.5 h-3.5" aria-hidden="true" /> Carteiras mês a mês
              </h2>
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

        <div className="border-t border-border pt-6">
          <DiretoriaComparativo />
        </div>
      </div>
    </div>
  );
}
