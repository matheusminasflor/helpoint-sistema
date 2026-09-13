import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalvarProjeto, STATUS_PROJETO, type ProjetoRow, type StatusProjeto } from '@/hooks/useProjetos';
import { useMetas } from '@/hooks/useMetas';
import { useProfiles } from '@/hooks/useInventory';

/**
 * Cria e edita o projeto. O objetivo estratégico é opcional de propósito: a
 * maioria dos projetos nasce antes de alguém pendurá-los numa meta.
 */
export function ProjetoDialog({ open, onOpenChange, edicao }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  edicao?: ProjetoRow | null;
}) {
  const salvar = useSalvarProjeto();
  const { profiles } = useProfiles();
  const { data: metas = [] } = useMetas();

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [status, setStatus] = useState<StatusProjeto>('active');
  const [dono, setDono] = useState('eu');
  const [objetivo, setObjetivo] = useState('nenhum');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  useEffect(() => {
    if (!open) return;
    setNome(edicao?.name ?? '');
    setDescricao(edicao?.description ?? '');
    setStatus((edicao?.status as StatusProjeto) ?? 'active');
    setDono(edicao?.owner_id ?? 'eu');
    setObjetivo(edicao?.goal_id ?? 'nenhum');
    setInicio(edicao?.start_date ?? '');
    setFim(edicao?.due_date ?? '');
  }, [open, edicao]);

  const prazoInvertido = inicio !== '' && fim !== '' && fim < inicio;
  const podeSalvar = nome.trim() !== '' && !prazoInvertido && !salvar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{edicao ? 'Editar projeto' : 'Novo projeto'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do projeto</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Trocar o sistema de pedidos" />
          </div>

          <div className="space-y-1.5">
            <Label>Do que se trata (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que precisa acontecer, e por quê." />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Situação</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as StatusProjeto)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_PROJETO).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Quem responde</Label>
              <Select value={dono} onValueChange={setDono}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="eu">Eu</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Serve a qual objetivo? (opcional)</Label>
            <Select value={objetivo} onValueChange={setObjetivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">Nenhum — existe por si</SelectItem>
                {metas.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Começa em (opcional)</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo (opcional)</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {prazoInvertido && (
            <p className="text-[11px] text-destructive">O projeto não pode terminar antes de começar.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!podeSalvar}
            onClick={() => salvar.mutate({
              id: edicao?.id,
              name: nome,
              description: descricao,
              status,
              owner_id: dono === 'eu' ? null : dono,
              goal_id: objetivo === 'nenhum' ? null : objetivo,
              start_date: inicio,
              due_date: fim,
            }, { onSuccess: () => onOpenChange(false) })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
