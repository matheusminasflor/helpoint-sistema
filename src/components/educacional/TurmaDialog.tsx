import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useSalvarTurma, SITUACOES_TURMA, type Turma } from '@/hooks/useTreinamentos';
import { toLocalDateTimeInput, fromLocalDateTimeInput } from '@/lib/dates';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  treinamentoId: string;
  existente?: Turma;
}

/** A turma é **quando** o treinamento acontece. É nela que se marca presença. */
export function TurmaDialog({ open, onOpenChange, treinamentoId, existente }: Props) {
  const { data: pessoas = [] } = useTechnicians();
  const salvar = useSalvarTurma();

  const [inicio, setInicio] = useState(
    existente ? toLocalDateTimeInput(existente.starts_at) : '',
  );
  const [fim, setFim] = useState(
    existente?.ends_at ? toLocalDateTimeInput(existente.ends_at) : '',
  );
  const [modality, setModality] = useState(existente?.modality ?? 'presencial');
  const [location, setLocation] = useState(existente?.location ?? '');
  const [capacity, setCapacity] = useState(existente?.capacity != null ? String(existente.capacity) : '');
  const [instrutor, setInstrutor] = useState(existente?.instructor_id ?? '');
  const [status, setStatus] = useState(existente?.status ?? 'agendada');
  const [notes, setNotes] = useState(existente?.notes ?? '');

  const vagasValidas = capacity.trim() === '' || Number(capacity) > 0;
  const periodoValido = !fim || !inicio || new Date(fim) >= new Date(inicio);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existente ? 'Editar turma' : 'Nova turma'}</DialogTitle>
          <DialogDescription>
            Quando, onde e quantas vagas. Quem participa se inscreve depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Começa *</Label>
              <Input type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Termina</Label>
              <Input type="datetime-local" value={fim} onChange={(e) => setFim(e.target.value)} />
              {!periodoValido && (
                <p className="text-[11px] text-destructive">O fim não pode ser antes do começo.</p>
              )}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Como *</Label>
              <Select value={modality} onValueChange={setModality}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="presencial">Presencial</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Vagas</Label>
              <Input
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="sem limite"
                inputMode="numeric"
              />
              <p className="text-[11px] text-muted-foreground">
                Em branco, a turma não tem limite.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{modality === 'online' ? 'Link da sala' : 'Onde'}</Label>
            <Input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder={modality === 'online' ? 'https://…' : 'Sala 2 — fábrica'}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Instrutor</Label>
              <Select value={instrutor || '__none__'} onValueChange={(v) => setInstrutor(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Sem instrutor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem instrutor</SelectItem>
                  {pessoas.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {existente && (
              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITUACOES_TURMA.map(s => (
                      <SelectItem key={s.valor} value={s.valor}>{s.rotulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!inicio || !vagasValidas || !periodoValido || salvar.isPending}
            onClick={() => salvar.mutate(
              {
                id: existente?.id,
                training_id: treinamentoId,
                starts_at: fromLocalDateTimeInput(inicio),
                ends_at: fim ? fromLocalDateTimeInput(fim) : null,
                modality,
                location,
                capacity: capacity.trim() ? Number(capacity) : null,
                instructor_id: instrutor || null,
                status,
                notes,
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
