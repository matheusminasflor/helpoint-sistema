// Os pedidos de reajuste já respondidos de um checklist (dono, 2026-10-29: "com histórico desses reajustes e
// solicitações"). O mesmo na Conferência do Financeiro e no lançamento da vendedora.
import type { Reajuste } from '@/hooks/usePedidosChecklist';
import { formatDateBR } from '@/types/financeiro';

export function HistoricoDeReajustes({ reajustes }: { reajustes: Reajuste[] }) {
  const respondidos = reajustes.filter((r) => r.status !== 'pendente');
  if (respondidos.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="font-semibold">Pedidos de reajuste</p>
      <ul className="text-[13px] space-y-1">
        {respondidos.map((r, i) => (
          <li key={i}>
            {formatDateBR(r.em)} · {r.por ?? '—'} pediu: {r.motivo}
            <br />
            <span className={r.status === 'aceito' ? 'text-status-success font-semibold' : 'text-status-danger font-semibold'}>
              {r.status === 'aceito' ? 'Aceito — devolvido ao Comercial' : 'Recusado — ficou como estava'}
            </span>
            {r.respondido_em && ` em ${formatDateBR(r.respondido_em)}`}{r.respondido_por && ` por ${r.respondido_por}`}
            {r.resposta && <> — {r.resposta}</>}
          </li>
        ))}
      </ul>
    </div>
  );
}
