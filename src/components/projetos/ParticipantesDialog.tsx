import { useState } from 'react';
import { UserPlus, X, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useParticipantes, useConvidar, useTirarParticipante } from '@/hooks/useProjetos';
import { useProfiles } from '@/hooks/useInventory';

/**
 * Quem participa do projeto. Isto **é** a permissão: o projeto é fechado, e
 * quem não está nesta lista não vê o quadro nem as tarefas (salvo dono e
 * administrador da empresa, que veem tudo).
 */
export function ParticipantesDialog({ open, onOpenChange, projectId, podeMexer }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  podeMexer: boolean;
}) {
  const { data: participantes = [] } = useParticipantes(projectId);
  const { profiles } = useProfiles();
  const convidar = useConvidar(projectId);
  const tirar = useTirarParticipante(projectId);
  const [escolhido, setEscolhido] = useState('');

  const deFora = profiles.filter(p => !participantes.some(m => m.user_id === p.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Quem participa</DialogTitle>
        </DialogHeader>

        <p className="text-[12px] text-muted-foreground">
          Este projeto é fechado: quem não estiver aqui não vê o quadro nem as tarefas.
          Quem responde pela empresa vê todos os projetos.
        </p>

        <ul className="rounded-md border border-border divide-y divide-border">
          {participantes.map(p => (
            <li key={p.user_id} className="flex items-center gap-2 px-3 py-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[10px]">
                  {p.nome.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm text-foreground flex-1 truncate">{p.nome}</span>
              {p.e_dono && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Crown className="w-3 h-3" aria-hidden="true" />
                  responde
                </span>
              )}
              {podeMexer && !p.e_dono && (
                <Button
                  variant="ghost" size="icon" className="h-7 w-7"
                  aria-label={`Tirar ${p.nome} do projeto`}
                  onClick={() => tirar.mutate(p.user_id)}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </Button>
              )}
            </li>
          ))}
        </ul>

        {podeMexer && (
          <div className="space-y-1.5">
            <Label>Incluir alguém</Label>
            <div className="flex gap-2">
              <Select value={escolhido} onValueChange={setEscolhido}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Escolha uma pessoa" />
                </SelectTrigger>
                <SelectContent>
                  {deFora.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                disabled={!escolhido || convidar.isPending}
                onClick={() => convidar.mutate(escolhido, { onSuccess: () => setEscolhido('') })}
              >
                <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Incluir
              </Button>
            </div>
            {deFora.length === 0 && (
              <p className="text-[11px] text-muted-foreground">Todo mundo da empresa já participa.</p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
