// "Ver o chamado" antes de aceitar o convite para atender junto (dono, 2026-10-19: "às vezes não se trata a mim aquele
// assunto"). Só leitura: título, categoria, quem pediu, descrição e a conversa com o solicitante — as notas internas da
// equipe ficam de fora (`convite_ver_chamado`, 20270128050000). Ali mesmo se aceita ou recusa, com motivo opcional.
import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useChamadoDoConvite, useResponderConvite, type MeuConvite } from '@/hooks/useAtenderJunto';
import { categoriaDoChamado, getTicketPriorityLabel } from '@/types/helpdesk';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { dataHora } from '@/lib/dates';

export function VerConvite({ convite, recusar = false, onFechar, onAceito }: {
  convite: MeuConvite;
  /** Abre já no "Por que recusa?" (o botão Recusar do aviso). */
  recusar?: boolean;
  onFechar: () => void;
  onAceito: () => void;
}) {
  const { data: c, isLoading } = useChamadoDoConvite(convite.ticket_id);
  const responder = useResponderConvite();
  const [recusando, setRecusando] = useState(recusar);
  const [motivo, setMotivo] = useState('');
  const setor = c ? setorDoModulo(c.setor) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chamado #{convite.ticket_number} — {convite.titulo}</DialogTitle>
          <DialogDescription>
            {convite.quem_convidou ?? 'Alguém'} convidou você para atender junto. Leia antes de aceitar: aqui é só leitura.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !c ? (
          <p className="text-sm text-muted-foreground">Este convite não existe mais.</p>
        ) : (
          <div className="space-y-4 text-sm">
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              <div><dt className="text-muted-foreground text-[13px]">Setor</dt><dd>{setor ? DEPARTMENT_SCHEMAS[setor].label : c.setor}</dd></div>
              <div><dt className="text-muted-foreground text-[13px]">Categoria</dt><dd>{categoriaDoChamado({ category: c.categoria, subcategory: c.subcategoria })}</dd></div>
              <div><dt className="text-muted-foreground text-[13px]">Quem pediu</dt><dd>{c.solicitante ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground text-[13px]">Prioridade · aberto em</dt><dd>{getTicketPriorityLabel(c.prioridade as never)} · {dataHora(c.aberto_em)}</dd></div>
            </dl>
            {c.descricao && (
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-[12px] font-medium text-muted-foreground mb-1">Descrição do chamado</p>
                <p className="whitespace-pre-wrap break-words">{c.descricao}</p>
              </div>
            )}
            {c.conversa.length > 0 && (
              <div className="space-y-2">
                <p className="text-[13px] font-medium">Conversa com quem pediu</p>
                {c.conversa.map((m, i) => (
                  <div key={i} className="rounded-md border border-border p-2.5">
                    <p className="text-[12px] text-muted-foreground mb-0.5">{m.autor ?? '—'} · {dataHora(m.em)}</p>
                    <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                  </div>
                ))}
              </div>
            )}
            {recusando && (
              <div className="space-y-1.5">
                <Label htmlFor="convite-motivo">Por que recusa? <span className="font-normal text-muted-foreground">(opcional)</span></Label>
                <Textarea id="convite-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: não é comigo, é com o Financeiro." />
                <p className="text-[12px] text-muted-foreground">Quem convidou recebe o motivo junto com o aviso.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {recusando ? (
            <>
              <Button variant="outline" onClick={() => setRecusando(false)}>Voltar</Button>
              <Button variant="destructive" disabled={responder.isPending}
                onClick={() => responder.mutate({ ticketId: convite.ticket_id, aceita: false, motivo }, { onSuccess: onFechar })}>
                Recusar o convite
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={!c || responder.isPending} onClick={() => setRecusando(true)}>Recusar</Button>
              <Button disabled={!c || responder.isPending}
                onClick={() => responder.mutate({ ticketId: convite.ticket_id, aceita: true }, { onSuccess: onAceito })}>
                Aceitar e atender junto
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
