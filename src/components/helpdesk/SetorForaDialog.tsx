// "Setor fora" (dono, 2026-10-27: "a TI está em dias de evento dando apoio… é injusto ficar SLA vencido"). Ao lado de
// Viagens, para quem registra viagem: os dias em que o setor inteiro está fora. Vale também para dias que já passaram.
import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { CalendarOff, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useSetorFora } from '@/hooks/useSetorFora';

const dia = (iso: string) => format(parseISO(iso), 'dd/MM/yyyy');

export function SetorForaDialog({ module, setorNome }: { module: string; setorNome: string }) {
  const [aberta, setAberta] = useState(false);
  const { periodos, registrar, tirar } = useSetorFora(aberta ? module : null);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [motivo, setMotivo] = useState('');
  const podeSalvar = !!de && !!ate && ate >= de && motivo.trim() !== '' && !registrar.isPending;

  const salvar = async () => {
    await registrar.mutateAsync({ de, ate, motivo: motivo.trim() });
    setDe(''); setAte(''); setMotivo('');
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAberta(true)}>
        <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" /> Setor fora
      </Button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{setorNome} fora</DialogTitle>
            <DialogDescription>
              Dias em que o setor inteiro está fora (evento, apoio, treinamento). Nesses dias o prazo de todos os
              chamados do setor para — os já abertos também — e o que for aberto conta a partir da volta. Vale para
              dias que já passaram: os prazos são recalculados na hora.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="fora-de">Primeiro dia</Label>
                <Input id="fora-de" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="fora-ate">Último dia</Label>
                <Input id="fora-ate" type="date" value={ate} min={de || undefined} onChange={(e) => setAte(e.target.value)} />
              </div>
            </div>
            {de && ate && ate < de && <p className="text-xs text-destructive">O último dia precisa ser igual ou depois do primeiro.</p>}
            <div className="grid gap-1.5">
              <Label htmlFor="fora-motivo">Motivo</Label>
              <Input id="fora-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: apoio no evento de lançamento" />
            </div>
            <Button onClick={salvar} disabled={!podeSalvar}>{registrar.isPending ? 'Salvando…' : 'Registrar setor fora'}</Button>
          </div>

          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Períodos registrados</p>
            {periodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum período registrado.</p>
            ) : (
              <ul className="grid gap-2">
                {periodos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{p.de === p.ate ? dia(p.de) : `${dia(p.de)} a ${dia(p.ate)}`}</span>{' '}
                      <span className="text-muted-foreground">· {p.motivo}</span>
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Tirar o período"
                      onClick={() => tirar.mutate(p.id)} disabled={tirar.isPending}>
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
