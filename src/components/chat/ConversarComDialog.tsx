import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useProfiles } from '@/hooks/useInventory';
import { useAbrirConversa } from '@/hooks/useChat';

/**
 * "Conversar com…" (decisão 2, L11b). Escolher uma pessoa chama
 * `chat_abrir_conversa`, que é find-or-create no banco — clicar em quem já
 * se conversa antes abre a MESMA conversa, com o histórico.
 */
export function ConversarComDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const { profiles } = useProfiles();
  const abrir = useAbrirConversa();
  const [busca, setBusca] = useState('');

  const pessoas = profiles
    .filter((p) => p.id !== user?.id)
    .filter((p) => (p.full_name || p.email).toLowerCase().includes(busca.toLowerCase()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Conversar com…</DialogTitle>
        </DialogHeader>

        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pessoa…"
          autoFocus
        />

        <ul className="rounded-md border border-border divide-y divide-border max-h-72 overflow-y-auto">
          {pessoas.length === 0 ? (
            <li className="px-3 py-4 text-[12px] text-muted-foreground text-center">Nenhuma pessoa encontrada.</li>
          ) : (
            pessoas.map((p) => {
              const nome = p.full_name || p.email;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 disabled:opacity-60"
                    disabled={abrir.isPending}
                    onClick={() => abrir.mutate(p.id, { onSuccess: () => onOpenChange(false) })}
                  >
                    <Avatar className="h-7 w-7 shrink-0">
                      <AvatarFallback className="text-[10px]">
                        {nome.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-foreground truncate">{nome}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
