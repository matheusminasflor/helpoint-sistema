import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useSalvarTarefa, useApagarTarefa, COLUNAS,
  type TarefaRow, type StatusTarefa,
} from '@/hooks/useProjetos';

/**
 * A tarefa do quadro. O responsável é opcional: no "A fazer" é normal o item
 * existir antes de alguém pegar. Só quem participa do projeto aparece na lista
 * de responsáveis — pôr ali quem não participa criaria uma tarefa que o próprio
 * dono não conseguiria abrir.
 */
export function TarefaDialog({ open, onOpenChange, projectId, edicao, statusInicial, participantes }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  edicao?: TarefaRow | null;
  statusInicial?: StatusTarefa;
  participantes: { user_id: string; nome: string }[];
}) {
  const salvar = useSalvarTarefa(projectId);
  const apagar = useApagarTarefa(projectId);

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [status, setStatus] = useState<StatusTarefa>('pending');
  const [dono, setDono] = useState('ninguem');
  const [prazo, setPrazo] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitulo(edicao?.title ?? '');
    setDescricao(edicao?.description ?? '');
    setStatus((edicao?.status as StatusTarefa) ?? statusInicial ?? 'pending');
    setDono(edicao?.user_id ?? 'ninguem');
    setPrazo(edicao?.due_date ? edicao.due_date.slice(0, 10) : '');
  }, [open, edicao, statusInicial]);

  const podeSalvar = titulo.trim() !== '' && !salvar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{edicao ? 'Tarefa' : 'Nova tarefa'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>O que precisa ser feito</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Detalhes (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Coluna</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusTarefa)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COLUNAS.map(c => <SelectItem key={c.status} value={c.status}>{c.titulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quem faz</Label>
              <Select value={dono} onValueChange={setDono}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ninguem">Ninguém ainda</SelectItem>
                  {participantes.map(p => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Prazo (opcional)</Label>
            <Input type="date" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
          </div>

          {edicao?.ticket_id && (
            <p className="text-[11px] text-muted-foreground">
              Esta tarefa nasceu de um chamado. Concluí-la aqui fecha o chamado junto.
            </p>
          )}
        </div>

        <DialogFooter className="sm:justify-between">
          {edicao ? (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => apagar.mutate(edicao.id, { onSuccess: () => onOpenChange(false) })}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              Remover
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button
              disabled={!podeSalvar}
              onClick={() => salvar.mutate({
                id: edicao?.id,
                project_id: projectId,
                title: titulo,
                description: descricao,
                status,
                user_id: dono === 'ninguem' ? null : dono,
                due_date: prazo || null,
              }, { onSuccess: () => onOpenChange(false) })}
            >
              Salvar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
