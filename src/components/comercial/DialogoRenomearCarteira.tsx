import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

/**
 * O diálogo de renomear (plano §4): campo com o nome atual (pré-preenchido
 * — o dono edita por cima) e a caixa "lembrar" MARCADA POR PADRÃO (decisão
 * dele). O erro de recusa (nome já existe) chega da RPC pronto em
 * português — `useRenomearCarteira` só repassa `e.message`.
 */
export function DialogoRenomearCarteira({
  nomeAtual, pendente, onOpenChange, onConfirmar,
}: {
  nomeAtual: string | null;
  pendente: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmar: (novoNome: string, lembrar: boolean) => void;
}) {
  const [texto, setTexto] = useState('');
  const [lembrar, setLembrar] = useState(true);

  useEffect(() => {
    setTexto(nomeAtual ?? '');
    setLembrar(true);
  }, [nomeAtual]);

  return (
    <Dialog open={!!nomeAtual} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Renomear carteira {nomeAtual}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="renomear-carteira-nome">Novo nome</Label>
            <Input
              id="renomear-carteira-nome"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              autoFocus
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="renomear-carteira-lembrar"
              checked={lembrar}
              onCheckedChange={(v) => setLembrar(v === true)}
            />
            <Label htmlFor="renomear-carteira-lembrar" className="text-[13px] font-normal">
              Lembrar: trocar &quot;{nomeAtual}&quot; por este nome em toda importação futura
            </Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!texto.trim() || pendente} onClick={() => onConfirmar(texto, lembrar)}>
            Renomear
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
