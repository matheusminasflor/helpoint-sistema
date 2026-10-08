// O botão do gestor (dono, 2026-10-08): quem do setor vai viajar, a ida e a volta com hora. Chamado novo
// para quem viaja — ou para a fila, se o setor inteiro viaja — conta o prazo da volta; o que já estava
// aberto mantém o prazo (precisa ser resolvido antes de ir).
import { useState } from 'react';
import { format } from 'date-fns';
import { Plane, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';
import { useViagens } from '@/hooks/useViagens';

interface Props { setor: string; setorNome: string }

export function ViagensDoSetorDialog({ setor, setorNome }: Props) {
  const [aberta, setAberta] = useState(false);
  const { data: membros = [] } = useMembrosDoSetor(aberta ? setor : undefined);
  const { viagens, registrar, tirar } = useViagens(membros.map((m) => m.id));
  const [pessoa, setPessoa] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const nome = (id: string) => membros.find((m) => m.id === id)?.full_name ?? 'Alguém do setor';
  const podeSalvar = !!pessoa && !!inicio && !!fim && fim > inicio && !registrar.isPending;

  const salvar = async () => {
    // `datetime-local` é a hora de quem digita (Brasil); `new Date` a lê assim e manda em UTC.
    await registrar.mutateAsync({ user_id: pessoa, inicio: new Date(inicio).toISOString(), fim: new Date(fim).toISOString() });
    setPessoa(''); setInicio(''); setFim('');
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs" onClick={() => setAberta(true)}>
        <Plane className="h-3.5 w-3.5" /> Viagens
      </Button>
      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Viagens do {setorNome}</DialogTitle>
            <DialogDescription>
              Chamado novo para quem está viajando conta o prazo a partir da volta, e quem abre é avisado. Se o setor
              inteiro viaja, a fila também espera. Os chamados já abertos mantêm o prazo.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Quem vai viajar</Label>
              <Select value={pessoa} onValueChange={setPessoa}>
                <SelectTrigger><SelectValue placeholder="Escolha a pessoa" /></SelectTrigger>
                <SelectContent>
                  {membros.map((m) => <SelectItem key={m.id} value={m.id}>{m.full_name ?? m.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="viagem-ida">Ida (dia e hora)</Label>
                <Input id="viagem-ida" type="datetime-local" value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="viagem-volta">Volta (dia e hora)</Label>
                <Input id="viagem-volta" type="datetime-local" value={fim} min={inicio || undefined} onChange={(e) => setFim(e.target.value)} />
              </div>
            </div>
            {inicio && fim && fim <= inicio && <p className="text-xs text-destructive">A volta precisa ser depois da ida.</p>}
            <Button onClick={salvar} disabled={!podeSalvar}>{registrar.isPending ? 'Salvando…' : 'Registrar viagem'}</Button>
          </div>

          <div className="mt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Viagens marcadas</p>
            {viagens.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ninguém do setor com viagem marcada.</p>
            ) : (
              <ul className="grid gap-2">
                {viagens.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">{nome(v.user_id)}</span>{' '}
                      <span className="text-muted-foreground">
                        {format(new Date(v.inicio), "dd/MM HH:mm")} → {format(new Date(v.fim), "dd/MM HH:mm")}
                      </span>
                    </span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Tirar a viagem"
                      onClick={() => tirar.mutate(v.id)} disabled={tirar.isPending}>
                      <Trash2 className="h-4 w-4" />
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
