// O ano mês a mês de uma carteira, meta e venda: os números de `com_carteira_mes_a_mes`, sem conta nova.
import { Card } from '@/components/ui/card';
import type { MesDaCarteira } from '@/hooks/useComercialLancamentos';
import { formatBRL } from '@/types/financeiro';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function GradeDoAno({ titulo, meses, mesEmDestaque }: { titulo: string; meses: MesDaCarteira[]; mesEmDestaque?: number | null }) {
  return (
    <Card className="p-4 overflow-x-auto">
      <h2 className="text-sm font-semibold mb-2">{titulo}</h2>
      <table className="w-full text-[13px]" data-celular="tabela">
        <thead>
          <tr className="text-muted-foreground">
            <th className="py-1 pr-2 text-left font-medium" />
            {MESES.map((m, i) => (
              <th key={m} className={`py-1 px-1.5 text-right font-medium ${i + 1 === mesEmDestaque ? 'text-foreground' : ''}`}>{m}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-2 text-muted-foreground">Meta</td>
            {meses.map((m) => <td key={m.mes} className="py-1.5 px-1.5 text-right font-mono">{m.meta === null ? '—' : formatBRL(m.meta)}</td>)}
          </tr>
          <tr className="border-t border-border">
            <td className="py-1.5 pr-2 text-muted-foreground">Venda</td>
            {meses.map((m) => <td key={m.mes} className="py-1.5 px-1.5 text-right font-mono">{m.venda ? formatBRL(m.venda) : '—'}</td>)}
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
