// Transferir o chamado para outra pessoa. Se ela NÃO atende o setor do chamado, o chamado vai junto
// para o setor dela (dono, 2026-10-06 — o #27 foi para a Merilyn e ficou na TI, invisível para ela):
// a tela avisa, pede a categoria do setor novo e o banco faz tudo num comando (`transferir_chamado`).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useTICategories, type TIModule } from '@/hooks/useTICategories';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { unwrap, mensagemDeErro } from '@/lib/supabase-result';
import { setorDoModulo } from '@/lib/permissoes';
import { DEPARTMENT_SCHEMAS } from '@/config/access-profile-schemas';
import { toast } from 'sonner';
import { ArrowRightLeft, Loader2 } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

const SEM_SUB = '__sem_sub__';

/** "Marketing", "TI"… — o nome do setor de um módulo de chamado ('tickets' é a TI). */
const nomeDoSetor = (modulo: string) => {
  const setor = setorDoModulo(modulo);
  return setor ? DEPARTMENT_SCHEMAS[setor].label : modulo;
};

interface TransferTicketDialogProps {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onTransfer: () => void;
}

export function TransferTicketDialog({
  ticket,
  open,
  onClose,
  onTransfer
}: TransferTicketDialogProps) {
  const { user, tenantId } = useAuth();
  const { data: technicians, isLoading: loadingTechnicians } = useTechnicians();
  const { transferTicket, transferToSector, isLoading } = useTicketActions();

  const [selectedTechnician, setSelectedTechnician] = useState<string>('');
  const [transferNote, setTransferNote] = useState('');
  const [setorEscolhido, setSetorEscolhido] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [subId, setSubId] = useState(SEM_SUB);

  const availableTechnicians = technicians?.filter(t => t.id !== user?.id) || [];
  const moduloAtual = ticket.module || 'tickets';

  // Os setores em que a pessoa escolhida atende — a regra é do banco (`setores_para_transferir`).
  const { data: setores, isLoading: carregandoSetores } = useQuery({
    queryKey: ['setores-para-transferir', tenantId, selectedTechnician],
    enabled: !!selectedTechnician && ticket.module !== 'compras',
    queryFn: async (): Promise<string[]> =>
      (unwrap(await supabase.rpc('setores_para_transferir' as never, { p_user: selectedTechnician } as never)) ?? []) as string[],
  });

  // Chamado de Compras não muda de setor (orçamentos e aprovação próprios): transfere como antes.
  const ehCompras = moduloAtual === 'compras';
  const mudaDeSetor = !ehCompras && !!setores && !setores.includes(moduloAtual);
  const semSetor = !ehCompras && !!setores && setores.length === 0;
  const setorNovo = mudaDeSetor ? (setores.length === 1 ? setores[0] : setorEscolhido) : '';

  const { rootCategories, getSubcategories } = useTICategories((setorNovo || moduloAtual) as TIModule);
  const categoria = setorNovo ? rootCategories.find(c => c.id === categoriaId) : undefined;
  const subs = categoria ? getSubcategories(categoria.id) : [];

  const pronto = !!selectedTechnician && !!transferNote.trim() && (ehCompras || (!!setores && !semSetor))
    && (!mudaDeSetor || (!!setorNovo && !!categoria));

  const handleSubmit = async () => {
    if (!pronto) {
      toast.error('Selecione a pessoa, o motivo e, se mudar de setor, a categoria do setor novo');
      return;
    }

    const tech = technicians?.find(t => t.id === selectedTechnician);
    if (!tech) return;
    const nome = tech.full_name || tech.email;

    try {
      if (mudaDeSetor && categoria) {
        await transferToSector(ticket.id, selectedTechnician, setorNovo,
          subId !== SEM_SUB ? subId : categoria.id, transferNote.trim());
        toast.success(`Chamado transferido para ${nome}, no setor ${nomeDoSetor(setorNovo)}`);
      } else {
        await transferTicket(ticket.id, selectedTechnician, nome, transferNote);
        toast.success(`Chamado transferido para ${nome}`);
      }
      onTransfer();
      handleClose();
    } catch (error) {
      toast.error(`Erro ao transferir chamado: ${mensagemDeErro(error)}`);
    }
  };

  const handleClose = () => {
    setSelectedTechnician('');
    setTransferNote('');
    setSetorEscolhido('');
    setCategoriaId('');
    setSubId(SEM_SUB);
    onClose();
  };

  const escolherPessoa = (id: string) => {
    setSelectedTechnician(id);
    setSetorEscolhido('');
    setCategoriaId('');
    setSubId(SEM_SUB);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-semibold">
            <ArrowRightLeft className="w-4 h-4 text-accent" strokeWidth={2} />
            Transferir Chamado #{ticket.ticket_number}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="technician" className="text-[14px]">Transferir para</Label>
            <Select
              value={selectedTechnician}
              onValueChange={escolherPessoa}
              disabled={loadingTechnicians}
            >
              <SelectTrigger id="technician" className="h-9 text-[14px] focus:ring-1 focus:ring-accent">
                <SelectValue placeholder="Selecione uma pessoa" />
              </SelectTrigger>
              <SelectContent>
                {availableTechnicians.map((tech) => (
                  <SelectItem key={tech.id} value={tech.id} className="text-[14px]">
                    {tech.full_name || tech.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedTechnician && carregandoSetores && (
            <p className="text-[13px] text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Conferindo o setor da pessoa…
            </p>
          )}

          {semSetor && (
            <p className="text-[13px] text-destructive">
              Esta pessoa não atende nenhum setor de chamados. Peça a quem cuida dos perfis para dar acesso a ela.
            </p>
          )}

          {mudaDeSetor && !semSetor && (
            <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
              {setores.length > 1 ? (
                <div className="space-y-2">
                  <Label htmlFor="setor-novo" className="text-[14px]">
                    Esta pessoa é de outro setor. Para qual setor o chamado vai? *
                  </Label>
                  <Select value={setorEscolhido} onValueChange={(v) => { setSetorEscolhido(v); setCategoriaId(''); setSubId(SEM_SUB); }}>
                    <SelectTrigger id="setor-novo" className="h-9 text-[14px]"><SelectValue placeholder="Escolha o setor" /></SelectTrigger>
                    <SelectContent>
                      {setores.map(s => <SelectItem key={s} value={s}>{nomeDoSetor(s)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <p className="text-[14px] text-foreground">
                  Este chamado vai para o setor <span className="font-semibold">{nomeDoSetor(setorNovo)}</span>.
                  O prazo passa a seguir o setor novo, contando desde a abertura.
                </p>
              )}

              {setorNovo && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="categoria-setor-novo" className="text-[14px]">Categoria no {nomeDoSetor(setorNovo)} *</Label>
                    <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setSubId(SEM_SUB); }}>
                      <SelectTrigger id="categoria-setor-novo" className="h-9 text-[14px]"><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
                      <SelectContent>
                        {rootCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {subs.length > 0 && (
                    <div className="space-y-2">
                      <Label htmlFor="subcategoria-setor-novo" className="text-[14px]">Subcategoria</Label>
                      <Select value={subId} onValueChange={setSubId}>
                        <SelectTrigger id="subcategoria-setor-novo" className="h-9 text-[14px]"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SEM_SUB}>Sem subcategoria</SelectItem>
                          {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="note" className="text-[14px]">Motivo da transferência *</Label>
            <Textarea
              id="note"
              placeholder="Explique o motivo da transferência..."
              value={transferNote}
              onChange={(e) => setTransferNote(e.target.value)}
              rows={3}
              className="text-[14px] focus-visible:ring-1 focus-visible:ring-accent focus-visible:border-accent"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading} className="h-8 text-[14px]">
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading || !pronto} className="h-8 text-[14px]">
            {isLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                Transferindo...
              </>
            ) : (
              'Transferir'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
