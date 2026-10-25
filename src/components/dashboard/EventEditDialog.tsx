// Editar um evento da Agenda (proposta "Helpoint no dia a dia", defeito 12, 2026-10-24): dava para criar e apagar,
// e corrigir um erro de digitação exigia apagar e criar de novo. A gravação é `updateEvent` (useCalendarEvents).
import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export interface EventoEditavel { id: string; title: string; description?: string; start_at: string; seriesId: string | null }
export interface MudancaDoEvento { title: string; description: string | null; start_at: string }

interface Props {
  evento: EventoEditavel | null;
  enviando: boolean;
  onCancelar: () => void;
  onSalvar: (mudanca: MudancaDoEvento, mudouAHora: boolean) => void;
}

export function EventEditDialog({ evento, enviando, onCancelar, onSalvar }: Props) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dia, setDia] = useState('');
  const [hora, setHora] = useState('');

  useEffect(() => {
    if (!evento) return;
    const d = new Date(evento.start_at);
    setTitulo(evento.title);
    setDescricao(evento.description ?? '');
    setDia(format(d, 'yyyy-MM-dd'));
    setHora(format(d, 'HH:mm'));
  }, [evento]);

  if (!evento) return null;
  const original = new Date(evento.start_at);
  const novo = new Date(`${dia}T${hora || '00:00'}`);
  const mudouAHora = !Number.isNaN(novo.getTime()) && novo.getTime() !== original.getTime();
  const pronto = titulo.trim().length > 0 && !!dia && !!hora;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCancelar(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar evento</DialogTitle>
          {evento.seriesId && (
            <DialogDescription>Este evento se repete. Ao salvar, você escolhe se a mudança vale só para este ou para os outros.</DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ev-titulo">Título</Label>
            <Input id="ev-titulo" name="titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ev-descricao">Descrição</Label>
            <Textarea id="ev-descricao" name="descricao" value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={3} />
          </div>
          <div className="flex gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ev-dia">Dia</Label>
              <Input id="ev-dia" name="dia" type="date" value={dia} onChange={(e) => setDia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-hora">Hora</Label>
              <Input id="ev-hora" name="hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
            </div>
          </div>
          {evento.seriesId && mudouAHora && (
            <p className="text-xs text-muted-foreground">Mudar o dia ou a hora vale só para esta vez; as outras repetições continuam no horário delas.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancelar}>Voltar</Button>
          <Button disabled={!pronto || enviando}
            onClick={() => onSalvar({ title: titulo.trim(), description: descricao.trim() || null, start_at: novo.toISOString() }, mudouAHora)}>
            {enviando ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
