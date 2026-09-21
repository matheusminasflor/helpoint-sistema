// O quadro de CFOP fora da lista (§3.2 do plano). Some da tela quando não há
// nenhum — é o comportamento esperado na maioria dos meses, não um erro.
import { AlertTriangle } from 'lucide-react';
import { useCfopForaDaCurva } from '@/hooks/useComercialPainel';
import { formatBRL } from '@/types/financeiro';

interface Props {
  de: string;
  ate: string;
}

export function CfopForaDaCurva({ de, ate }: Props) {
  const { data, isLoading } = useCfopForaDaCurva(de, ate);

  if (isLoading || !data || data.linhas.length === 0) return null;

  return (
    <div className="rounded-lg border border-border badge-warning p-4 space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" />
        CFOP fora da lista conhecida — não entra em nenhuma conta da tela
      </div>
      <p className="text-[12px] text-muted-foreground">
        Estas linhas têm um CFOP que o sistema ainda não classificou como venda, devolução,
        bonificação ou industrialização. Ficam fora do faturamento até alguém decidir o que são.
      </p>
      <div className="rounded-md border border-border overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-2 py-1.5 font-semibold">CFOP</th>
              <th className="px-2 py-1.5 font-semibold text-right">Linhas</th>
              <th className="px-2 py-1.5 font-semibold text-right">Valor</th>
            </tr>
          </thead>
          <tbody>
            {data.linhas.map((c) => (
              <tr key={c.cfop} className="border-t border-border">
                <td className="px-2 py-1.5 font-mono">{c.cfop}</td>
                <td className="px-2 py-1.5 text-right font-mono">{c.linhas}</td>
                <td className="px-2 py-1.5 text-right font-mono">{formatBRL(c.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.cortou && (
        <p className="text-[11px] text-muted-foreground">
          Lista maior que o mostrado aqui — corrija os CFOPs conhecidos para reduzi-la.
        </p>
      )}
    </div>
  );
}
