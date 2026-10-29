// O Comercial pede reajuste de um checklist já aprovado, pago ou finalizado (dono, 2026-10-29). Quem pede: a vendedora
// do pedido e o gestor do Comercial — a mesma régua do banco (`ped_pedir_reajuste`). O Financeiro decide: aceitando, o
// checklist volta como devolvido e ela corrige; recusando, fica como está. Um pedido por vez, todos no histórico.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HistoricoDeReajustes } from '@/components/financeiro/HistoricoDeReajustes';
import { usePedirReajuste, type ChecklistResumo } from '@/hooks/usePedidosChecklist';
import { formatDateBR } from '@/types/financeiro';

export function PedidoDeReajuste({ resumo, podePedir }: { resumo: ChecklistResumo; podePedir: boolean }) {
  const pedir = usePedirReajuste();
  const [abrindo, setAbrindo] = useState(false);
  const [motivo, setMotivo] = useState('');
  const aprovado = resumo.situacao === 'Aprovado' || resumo.situacao === 'Finalizado';
  const pendente = resumo.reajuste_pendente;

  return (
    <div className="space-y-2">
      {pendente ? (
        <p className="rounded-md badge-info px-2 py-1.5 text-[13px]">
          Reajuste pedido em {formatDateBR(pendente.em)}{pendente.por ? ` por ${pendente.por}` : ''}, esperando o Financeiro.
          Motivo: <strong>{pendente.motivo}</strong>
        </p>
      ) : aprovado && podePedir && (abrindo ? (
        <div className="rounded-lg border border-border p-3 space-y-2">
          <Label htmlFor="motivo-reajuste" className="text-[13px]">Por que reabrir este checklist?</Label>
          <Textarea id="motivo-reajuste" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <p className="text-[12px] text-muted-foreground">
            O Financeiro decide: aceitando, o checklist volta para você corrigir e reenviar; recusando, fica como está.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => { setAbrindo(false); setMotivo(''); }}>Cancelar</Button>
            <Button type="button" size="sm" disabled={!motivo.trim() || pedir.isPending}
              onClick={() => pedir.mutate({ checklistId: resumo.id, motivo }, { onSuccess: () => { setAbrindo(false); setMotivo(''); } })}>
              Pedir reajuste ao Financeiro
            </Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setAbrindo(true)}>Pedir reajuste ao Financeiro</Button>
      ))}
      <HistoricoDeReajustes reajustes={resumo.historico_reajustes ?? []} />
    </div>
  );
}
