// Mudar a categoria do chamado (decisão do dono, 2026-10-05): só categorias do MESMO setor. Sem
// atendente, o banco põe o responsável da categoria nova; com atendente, fica quem está.
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTicketActions } from '@/hooks/useTicketActions';
import { useTICategories, type TIModule } from '@/hooks/useTICategories';
import { toast } from 'sonner';
import { Loader2, Tags } from 'lucide-react';
import type { TicketWithDetails } from '@/types/helpdesk';

const SEM_SUB = '__sem_sub__';

interface ChangeCategoryDialogProps {
  ticket: TicketWithDetails;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function ChangeCategoryDialog({ ticket, open, onClose, onConfirm }: ChangeCategoryDialogProps) {
  const { changeCategory, isLoading } = useTicketActions();
  const { rootCategories, getSubcategories } = useTICategories((ticket.module || 'tickets') as TIModule);
  const [categoriaId, setCategoriaId] = useState('');
  const [subId, setSubId] = useState(SEM_SUB);
  const [motivo, setMotivo] = useState('');

  const categoria = rootCategories.find(c => c.id === categoriaId);
  const subs = categoria ? getSubcategories(categoria.id) : [];
  const sub = subs.find(s => s.id === subId) ?? null;
  const atual = ticket.subcategory ? `${ticket.category ?? 'Sem categoria'} › ${ticket.subcategory}` : (ticket.category ?? 'Sem categoria');
  const mesma = !!categoria && (sub?.id ?? categoria.id) === ticket.category_id;

  const fechar = () => {
    setCategoriaId('');
    setSubId(SEM_SUB);
    setMotivo('');
    onClose();
  };

  const salvar = async () => {
    if (!categoria || mesma) return;
    try {
      await changeCategory(ticket.id, atual, categoria, sub, motivo);
      toast.success('Categoria alterada');
      onConfirm();
      fechar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao alterar a categoria');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="sm:max-w-md p-6 gap-4">
        <DialogHeader className="space-y-2">
          <DialogTitle className="flex items-center gap-2 text-[16px] font-semibold">
            <Tags className="w-4 h-4 text-accent" strokeWidth={2} />
            Mudar categoria do chamado #{ticket.ticket_number}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            Hoje: <span className="font-medium text-foreground">{atual}</span>. Só categorias deste setor — para outro
            setor, transfira o chamado. Sem atendente, ele vai para o responsável da categoria nova.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="categoria-nova" className="text-[14px]">Categoria *</Label>
            <Select value={categoriaId} onValueChange={(v) => { setCategoriaId(v); setSubId(SEM_SUB); }}>
              <SelectTrigger id="categoria-nova"><SelectValue placeholder="Escolha a categoria" /></SelectTrigger>
              <SelectContent>
                {rootCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {subs.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="subcategoria-nova" className="text-[14px]">Subcategoria</Label>
              <Select value={subId} onValueChange={setSubId}>
                <SelectTrigger id="subcategoria-nova"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={SEM_SUB}>Sem subcategoria</SelectItem>
                  {subs.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="motivo-categoria" className="text-[14px]">Motivo (opcional)</Label>
            <Textarea id="motivo-categoria" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: aberto em Banner, mas é rótulo" className="text-[14px]" />
            <p className="text-[13px] text-muted-foreground">A mudança fica registrada no histórico do chamado.</p>
          </div>
          {mesma && <p className="text-[13px] text-muted-foreground">Esta já é a categoria do chamado.</p>}
        </div>

        <DialogFooter className="gap-2 pt-2">
          <Button variant="outline" onClick={fechar} disabled={isLoading} className="h-8 text-[14px]">Cancelar</Button>
          <Button onClick={salvar} disabled={isLoading || !categoria || mesma} className="h-8 text-[14px]">
            {isLoading ? <><Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />Salvando...</> : 'Mudar categoria'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
