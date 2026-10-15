// A nota lançada que não bateu com o Forteplus (dono, 2026-10-15): o Forteplus já prevaleceu na conta; aqui a
// vendedora vê o que digitou e o que o Forteplus diz, "para saber o que errou e se atentar".
import { AlertTriangle } from 'lucide-react';
import type { NotaQueNaoBateu, ProblemaDaNota } from '@/hooks/useComercialLancamentos';
import { formatBRL, formatDateBR } from '@/types/financeiro';

const MOTIVO: Record<ProblemaDaNota, string> = {
  nota_nao_encontrada: 'Número da nota não existe no Forteplus',
  cliente_diferente: 'A nota é de outro cliente',
  valor_diferente: 'Valor diferente',
  data_diferente: 'Data diferente',
};

export function NotasQueNaoBateram({ linhas }: { linhas: NotaQueNaoBateu[] }) {
  if (linhas.length === 0) return null;
  return (
    <div className="rounded-md border border-status-warning/40 bg-status-warning/5 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold">
        <AlertTriangle className="w-4 h-4 text-status-warning" aria-hidden="true" />
        {linhas.length === 1 ? '1 nota lançada não bateu' : `${linhas.length} notas lançadas não bateram`} com o Forteplus
      </p>
      <p className="text-[12px] text-muted-foreground">
        A venda já conta pelo Forteplus. Isto mostra o que foi digitado e o que está na nota, para conferir da próxima vez.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Nota</th>
              <th className="py-1 pr-2 font-medium">Cliente</th>
              <th className="py-1 pr-2 font-medium text-right">Lançado</th>
              <th className="py-1 pr-2 font-medium text-right">Forteplus</th>
              <th className="py-1 font-medium">O que não bateu</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((n) => (
              <tr key={n.interacao_id} className="border-t border-border align-top">
                <td className="py-1 pr-2 font-mono">{n.nota_fiscal}</td>
                <td className="py-1 pr-2">{n.cliente_nome ?? n.cliente_codigo ?? '—'}</td>
                <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                  {formatBRL(n.valor_lancado)}<p className="text-muted-foreground">{formatDateBR(n.nota_em)}</p>
                </td>
                <td className="py-1 pr-2 text-right font-mono whitespace-nowrap">
                  {n.forteplus_valor === null ? '—' : formatBRL(n.forteplus_valor)}
                  {n.forteplus_emissao && <p className="text-muted-foreground">{formatDateBR(n.forteplus_emissao)}</p>}
                </td>
                <td className="py-1">
                  {MOTIVO[n.problema]}
                  {n.problema === 'cliente_diferente' && n.forteplus_cliente && (
                    <span className="text-muted-foreground"> (cód. {n.forteplus_cliente})</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
