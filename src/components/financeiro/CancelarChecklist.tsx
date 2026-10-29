// Cancelar o checklist (dono, 2026-10-29): definitivo, com justificativa, e o Comercial avisado. A ação sem volta segue
// as Leis de UX que a casa usa: o botão fica longe das ações do dia a dia (Fitts — não se acerta sem querer), a janela
// diz o que acontece antes (o usuário não decide no escuro), e só libera com o motivo escrito e a ciência marcada
// (Postel — o sistema protege contra o erro grave).
import { useState } from 'react';
import { Ban } from 'lucide-react';
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCancelarChecklist, type ChecklistResumo } from '@/hooks/usePedidosChecklist';
import { formatDateBR } from '@/types/financeiro';

const MINIMO = 10;

export function CancelarChecklist({ checklist, onCancelado }: { checklist: ChecklistResumo; onCancelado?: () => void }) {
  const cancelar = useCancelarChecklist();
  const [aberta, setAberta] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [ciente, setCiente] = useState(false);
  const faltam = Math.max(0, MINIMO - motivo.trim().length);
  const fechar = (v: boolean) => { setAberta(v); if (!v) { setMotivo(''); setCiente(false); } };

  return (
    <>
      <Button type="button" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10 sm:mr-auto"
        onClick={() => setAberta(true)}>
        <Ban className="w-4 h-4 mr-1.5" aria-hidden="true" /> Cancelar checklist
      </Button>
      <AlertDialog open={aberta} onOpenChange={fechar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar o checklist {checklist.protocolo}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[14px]">
                <p>O cancelamento é <strong className="text-destructive">definitivo e não pode ser desfeito</strong>.</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>O checklist para de vez: não recebe aprovação, pagamento, finalização, reajuste nem correção.</li>
                  <li>{checklist.vendedor_nome ?? 'A vendedora'} é avisada com o motivo que você escrever.</li>
                  <li>O lançamento fica registrado, mas sai dos indicadores do Comercial. Pedido novo é um lançamento novo.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2">
            <Label htmlFor="motivo-cancelamento" className="text-[13px]">Motivo do cancelamento (o Comercial vai ler)</Label>
            <Textarea id="motivo-cancelamento" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            <p className={`text-[12px] ${faltam > 0 ? 'text-muted-foreground' : 'text-status-success'}`}>
              {faltam > 0 ? `Escreva mais ${faltam} ${faltam === 1 ? 'letra' : 'letras'}.` : 'Motivo ok.'}
            </p>
            <label className="flex items-start gap-2 text-[13px] cursor-pointer">
              <Checkbox checked={ciente} onCheckedChange={(v) => setCiente(v === true)} className="mt-0.5" />
              Entendo que o cancelamento não pode ser desfeito.
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button variant="destructive" disabled={faltam > 0 || !ciente || cancelar.isPending}
              onClick={() => cancelar.mutate({ checklistId: checklist.id, motivo }, { onSuccess: () => { fechar(false); onCancelado?.(); } })}>
              Cancelar definitivamente
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** O aviso de cancelado, igual no Financeiro e no Comercial (vermelho: o estado que não volta). */
export function AvisoDeCancelado({ c }: { c: ChecklistResumo }) {
  if (c.situacao !== 'Cancelado') return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-[13px] space-y-1">
      <p className="font-semibold text-destructive">Cancelado pelo Financeiro — definitivo</p>
      <p>
        {c.cancelado_por ?? 'O Financeiro'}{c.cancelado_em ? ` em ${formatDateBR(c.cancelado_em)}` : ''}: {c.cancelamento_motivo}
      </p>
      <p className="text-muted-foreground">O lançamento fica registrado, fora dos indicadores. Pedido novo é um lançamento novo.</p>
    </div>
  );
}
