// Falha de leitura não pode virar lista vazia, zero ou carregamento sem fim (auditoria 2026-11-06).
import { Button } from '@/components/ui/button';

export function ErroDeCarga({ mensagem, onTentar }: { mensagem: string; onTentar?: () => void }) {
  return (
    <div role="alert" className="rounded-lg border border-border badge-danger p-3 text-[14px] space-y-2">
      <p><strong>{mensagem}</strong> Isto não quer dizer que não há dados.</p>
      {onTentar && <Button size="sm" variant="outline" onClick={onTentar}>Tentar de novo</Button>}
    </div>
  );
}
