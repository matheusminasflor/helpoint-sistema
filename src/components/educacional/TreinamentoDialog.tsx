import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalvarTreinamento, PUBLICOS, type Treinamento } from '@/hooks/useTreinamentos';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existente?: Treinamento;
}

/**
 * O treinamento é o **assunto** — "Aplicação de coloração". Quando ele acontece
 * é a turma, e é lá que entram data, local e participantes.
 */
export function TreinamentoDialog({ open, onOpenChange, existente }: Props) {
  const salvar = useSalvarTreinamento();
  const [title, setTitle] = useState(existente?.title ?? '');
  const [description, setDescription] = useState(existente?.description ?? '');
  const [audience, setAudience] = useState(existente?.audience ?? 'interno');
  const [hours, setHours] = useState(existente?.hours != null ? String(existente.hours) : '');
  const [ativo, setAtivo] = useState(existente?.is_active ?? true);

  const cargaValida = hours.trim() === '' || Number(hours.replace(',', '.')) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{existente ? 'Editar treinamento' : 'Novo treinamento'}</DialogTitle>
          <DialogDescription>
            O assunto e para quem ele é. As datas ficam nas turmas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Nome do treinamento *</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Aplicação de coloração"
              maxLength={160}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Para quem *</Label>
              <Select value={audience} onValueChange={setAudience}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PUBLICOS.map(p => (
                    <SelectItem key={p.valor} value={p.valor}>{p.rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Carga horária</Label>
              <Input
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                placeholder="4"
                inputMode="decimal"
              />
              <p className="text-[11px] text-muted-foreground">
                Em horas. É o que aparece no histórico de quem fez.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="O que a pessoa aprende, o que precisa levar…"
            />
          </div>

          {existente && (
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Em uso</p>
                <p className="text-[12px] text-muted-foreground">
                  Desligado, ele some da lista de escolha — as turmas e o histórico continuam.
                </p>
              </div>
              <Switch checked={ativo} onCheckedChange={setAtivo} aria-label="Treinamento em uso" />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!title.trim() || !cargaValida || salvar.isPending}
            onClick={() => salvar.mutate(
              {
                id: existente?.id,
                title,
                description,
                audience,
                hours: hours.trim() ? Number(hours.replace(',', '.')) : null,
                is_active: ativo,
              },
              { onSuccess: () => onOpenChange(false) },
            )}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
