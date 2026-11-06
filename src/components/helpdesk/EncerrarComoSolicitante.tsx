// Quem abriu cancela ou marca como resolvido (dono, 2026-11-06, proposta aprovada): antes precisava pedir ao setor. As
// regras moram em `chamado_encerrar_como_solicitante`; aqui só a pergunta, com o "Desfazer" de 8 s das outras ações.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantPath } from '@/hooks/useTenantPath';
import { supabase } from '@/integrations/supabase/client';
import { feitoComDesfazer } from '@/lib/desfazer';
import { ehPedido } from '@/lib/estado-para-quem-pediu';
import { unwrap } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';
import type { TicketWithDetails } from '@/types/helpdesk';

const MOTIVOS = ['Abri errado', 'Não preciso mais', 'Abri repetido', 'Outro motivo'];
type Acao = 'cancelar' | 'resolver';

export function EncerrarComoSolicitante({ ticket, onUpdate, onPatch }: {
  ticket: TicketWithDetails;
  onUpdate: () => void;
  onPatch?: (p: Partial<TicketWithDetails>) => void;
}) {
  const { user, tenantId } = useAuth();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const [acao, setAcao] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState('');
  const [detalhe, setDetalhe] = useState('');

  const minha = ticket.requester_id === user?.id && ticket.module !== 'compras';
  const aberto = !['resolved', 'closed', 'cancelled', 'rejected'].includes(ticket.status);
  const nome = ehPedido(ticket.module) ? 'pedido' : 'chamado';
  const { data: respondeu } = useQuery({
    queryKey: ['chamado-equipe-respondeu', tenantId, ticket.id],
    enabled: minha && aberto,
    queryFn: async () => unwrap(await supabase.rpc('chamado_equipe_respondeu' as never, { p_ticket: ticket.id } as never)) as unknown as boolean,
  });
  const { data: temEtapa = true } = useQuery({
    queryKey: ['chamado-etapa-pendente', tenantId, ticket.id],
    enabled: minha && aberto,
    queryFn: async () => unwrap(await supabase.rpc('chamado_tem_etapa_pendente' as never, { p_ticket: ticket.id } as never)) as unknown as boolean,
  });

  if (minha && ticket.status === 'cancelled') {
    return <Button variant="outline" size="sm" onClick={() => navigate(tenantPath('/nova-solicitacao'))}>Abrir novo {nome}</Button>;
  }
  if (!minha || !aberto) return null;

  const fechar = () => { setAcao(null); setMotivo(''); setDetalhe(''); };
  const confirmar = () => {
    const pedido = { p_ticket: ticket.id, p_acao: acao, p_motivo: acao === 'cancelar' ? motivo : null, p_detalhe: detalhe.trim() || null };
    const antes = { status: ticket.status };
    onPatch?.({ status: acao === 'cancelar' || !respondeu ? 'cancelled' : 'resolved' });
    feitoComDesfazer({
      chave: `chamado:${ticket.id}`,
      mensagem: acao === 'cancelar' ? `${nome === 'pedido' ? 'Pedido cancelado' : 'Chamado cancelado'}` : respondeu ? 'Marcado como resolvido' : 'Encerrado sem atendimento',
      gravar: async () => unwrap(await supabase.rpc('chamado_encerrar_como_solicitante' as never, pedido as never)),
      aoDesfazer: () => onPatch?.(antes),
      depois: (erro) => {
        if (erro) toast.error(erro instanceof Error ? erro.message : 'Não consegui encerrar. Tente de novo.');
        onUpdate();
      },
    });
    fechar();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {!temEtapa && (
          <Button variant="outline" size="sm" className="gap-1.5 border-status-success text-status-success" onClick={() => setAcao('resolver')}>
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Já está resolvido
          </Button>
        )}
        <Button variant="outline" size="sm" className="gap-1.5 border-destructive text-destructive" onClick={() => setAcao('cancelar')}>
          <XCircle className="w-4 h-4" aria-hidden="true" /> Cancelar {nome}
        </Button>
      </div>

      <Dialog open={acao !== null} onOpenChange={(v) => { if (!v) fechar(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {acao === 'cancelar' ? `Cancelar o ${nome} #${ticket.ticket_number}?` : `Este ${nome} já foi resolvido?`}
            </DialogTitle>
          </DialogHeader>
          {acao === 'cancelar' && (
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Motivo do cancelamento">
              {MOTIVOS.map((m) => (
                <button key={m} type="button" role="radio" aria-checked={motivo === m} onClick={() => setMotivo(m)}
                  className={cn('rounded-full border px-3 py-1 text-[14px]', motivo === m ? 'border-primary bg-primary/10 text-primary font-semibold' : 'border-border')}>
                  {m}
                </button>
              ))}
            </div>
          )}
          {acao === 'resolver' && !respondeu && <p className="text-[14px] text-muted-foreground">A equipe ainda não respondeu: o {nome} será encerrado sem contar como atendimento.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="detalhe-encerrar">{acao === 'cancelar' ? 'Quer explicar? (opcional)' : 'O que resolveu? (opcional)'}</Label>
            <Textarea id="detalhe-encerrar" rows={2} value={detalhe} onChange={(e) => setDetalhe(e.target.value)} />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={fechar}>Voltar</Button>
            <Button variant={acao === 'cancelar' ? 'destructive' : 'default'} disabled={acao === 'cancelar' && !motivo} onClick={confirmar}>
              {acao === 'cancelar' ? `Cancelar ${nome}` : 'Marcar como resolvido'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
