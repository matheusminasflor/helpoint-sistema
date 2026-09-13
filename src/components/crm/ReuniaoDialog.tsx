import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgendarReuniao } from '@/hooks/useReuniao';

/**
 * "Marcar reunião" de dentro do negócio (CRM-3b). Entra na agenda de quem marca
 * e na linha do tempo do negócio, e o cliente pode receber o convite por e-mail.
 */
export function ReuniaoDialog({ open, onOpenChange, dealId, dealTitle, contato }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  dealId: string;
  dealTitle: string;
  contato: { name: string; email: string | null } | null;
}) {
  const agendar = useAgendarReuniao();
  const [titulo, setTitulo] = useState(`Reunião — ${dealTitle}`);
  const [quando, setQuando] = useState(proximaHoraCheia());
  const [minutos, setMinutos] = useState('60');
  const [notas, setNotas] = useState('');
  const [avisar, setAvisar] = useState(true);

  // O diálogo fica montado com a página, então sem isto a segunda reunião abria
  // com o assunto editado, as anotações antigas e um horário congelado no
  // momento em que a página carregou — possivelmente já no passado.
  useEffect(() => {
    if (!open) return;
    setTitulo(`Reunião — ${dealTitle}`);
    setQuando(proximaHoraCheia());
    setMinutos('60');
    setNotas('');
    setAvisar(true);
  }, [open, dealTitle]);

  const temEmail = !!contato?.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Marcar reunião</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Assunto</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Quando</Label>
              <Input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Duração</Label>
              <Select value={minutos} onValueChange={setMinutos}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="15">15 minutos</SelectItem>
                  <SelectItem value="30">30 minutos</SelectItem>
                  <SelectItem value="60">1 hora</SelectItem>
                  <SelectItem value="90">1 hora e meia</SelectItem>
                  <SelectItem value="120">2 horas</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Anotações (opcional)</Label>
            <Textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Pauta, link da chamada, endereço…" />
          </div>

          <div className="flex items-start gap-2">
            <Switch checked={avisar && temEmail} onCheckedChange={setAvisar} disabled={!temEmail} />
            <div>
              <Label className="font-normal">Avisar {contato?.name ?? 'o cliente'} por e-mail</Label>
              {!temEmail && (
                <p className="text-[11px] text-muted-foreground">
                  Sem e-mail no cadastro do cliente não dá para avisar. A reunião entra na agenda do mesmo jeito.
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!titulo.trim() || !quando || agendar.isPending}
            onClick={() => agendar.mutate(
              { deal_id: dealId, titulo: titulo.trim(), quando, minutos: Number(minutos), notas, avisar_cliente: avisar && temEmail },
              { onSuccess: () => onOpenChange(false) },
            )}
          >
            Marcar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Próxima hora cheia, no formato que o `datetime-local` espera. */
function proximaHoraCheia(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
