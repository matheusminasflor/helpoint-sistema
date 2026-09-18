import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useCriarCanal } from '@/hooks/useChat';
import { useProfiles } from '@/hooks/useInventory';

/**
 * Criar canal (decisão 12: qualquer um da empresa cria). Aberto = todo mundo
 * entra e lê; fechado = só quem for escolhido aqui — e nem dono nem
 * administrador leem as mensagens de um canal fechado de que não participam
 * (decisão 11).
 */
export function NovoCanalDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const criar = useCriarCanal();
  const { profiles } = useProfiles();

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [privado, setPrivado] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);

  const fechar = () => {
    onOpenChange(false);
    setNome('');
    setDescricao('');
    setPrivado(false);
    setEscolhidos([]);
  };

  const podeCriar = nome.trim() !== '' && !criar.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? onOpenChange(v) : fechar())}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo canal</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome do canal</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: financeiro" maxLength={60} />
          </div>

          <div className="space-y-1.5">
            <Label>Sobre o que é (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Conversa que decide algo sobre um chamado volta para o chamado — este canal é o corredor." />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <Label>Só quem eu escolher</Label>
              <p className="text-[11px] text-muted-foreground">
                Desligado, todo mundo da empresa entra e lê.
              </p>
            </div>
            <Switch checked={privado} onCheckedChange={setPrivado} />
          </div>

          {privado && (
            <div className="space-y-1.5">
              <Label>Quem participa</Label>
              <ul className="rounded-md border border-border divide-y divide-border max-h-48 overflow-y-auto">
                {profiles.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      id={`convidado-${p.id}`}
                      checked={escolhidos.includes(p.id)}
                      onCheckedChange={(v) =>
                        setEscolhidos((prev) => (v ? [...prev, p.id] : prev.filter((id) => id !== p.id)))
                      }
                    />
                    <label htmlFor={`convidado-${p.id}`} className="text-sm text-foreground flex-1 truncate cursor-pointer">
                      {p.full_name || p.email}
                    </label>
                  </li>
                ))}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Dono e administrador vão poder apagar este canal, mas não lêem as mensagens sem participar.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={fechar}>Cancelar</Button>
          <Button
            disabled={!podeCriar}
            onClick={() =>
              criar.mutate(
                { nome, descricao, privado, convidados: privado ? escolhidos : undefined },
                { onSuccess: fechar },
              )
            }
          >
            Criar canal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
