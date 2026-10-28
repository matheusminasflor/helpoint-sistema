// As contas fixas abertas (dono, 2026-10-28; 20270212050000): cada uma gera o lançamento do período sozinha, 10 dias
// antes. Daqui se muda o valor (vale para os próximos) ou se encerra. Some quando não há nenhuma.
import { useState } from 'react';
import { Repeat } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAtualizarContaFixa, useContasFixas } from '@/hooks/useFinanceiro';
import { parseAmount } from '@/lib/finance-import';
import { CARTAO_DE_CREDITO, formatBRL, formatDateBR, proximoDiaDaContaFixa, type ContaFixa, type FinKind } from '@/types/financeiro';

export function ContasFixas({ kind, podeEditar }: { kind: FinKind; podeEditar: boolean }) {
  const { data: contas = [] } = useContasFixas(kind);
  if (contas.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Repeat className="w-4 h-4" aria-hidden="true" />Contas fixas</p>
      <ul className="divide-y divide-border">
        {contas.map((c) => <Linha key={c.id} conta={c} podeEditar={podeEditar} />)}
      </ul>
    </div>
  );
}

function Linha({ conta: c, podeEditar }: { conta: ContaFixa; podeEditar: boolean }) {
  const atualizar = useAtualizarContaFixa();
  const [valor, setValor] = useState<string | null>(null);
  const [encerrando, setEncerrando] = useState(false);
  const proximo = proximoDiaDaContaFixa(c);
  const forma = c.payment_method === CARTAO_DE_CREDITO && c.filial ? `Cartão ${c.filial}` : c.payment_method;

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2 text-sm">
      <span className="font-medium min-w-0">{c.description}</span>
      <span className="text-muted-foreground">{c.frequencia === 'anual' ? 'todo ano' : 'todo mês'}{forma ? ` · ${forma}` : ''}</span>
      <span className="text-muted-foreground">{proximo ? `próximo ${formatDateBR(proximo)}` : 'terminou'}</span>
      {valor === null ? (
        <span className="font-mono font-semibold tabular-nums">{formatBRL(Number(c.amount))}</span>
      ) : (
        <Input autoFocus inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)}
          aria-label={`Novo valor de ${c.description}`} className="h-8 w-28" />
      )}
      {podeEditar && (
        <span className="ml-auto flex gap-2">
          {valor === null ? (
            <Button size="sm" variant="outline" onClick={() => setValor(String(c.amount))}>Mudar valor</Button>
          ) : (<>
            <Button size="sm" disabled={atualizar.isPending || !(parseAmount(valor) ?? 0)}
              onClick={() => atualizar.mutate({ id: c.id, amount: parseAmount(valor)! }, { onSuccess: () => setValor(null) })}>
              Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setValor(null)}>Cancelar</Button>
          </>)}
          {/* Encerrar pede um segundo toque: não gera mais, e o que já saiu fica na lista. */}
          <Button size="sm" variant={encerrando ? 'destructive' : 'ghost'} disabled={atualizar.isPending}
            onClick={() => (encerrando ? atualizar.mutate({ id: c.id, encerrada_em: new Date().toISOString() }) : setEncerrando(true))}
            onBlur={() => setEncerrando(false)}>
            {encerrando ? 'Confirmar: encerrar' : 'Encerrar'}
          </Button>
        </span>
      )}
    </li>
  );
}
