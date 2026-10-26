// As ações de uma visita marcada (rodada 2, R5): "Fiz a visita" (com o que aconteceu), remarcar e cancelar. As mesmas
// na Agenda e na ficha do salão. Cancelar apaga a visita (o banco já deixava: policy de DELETE de `dist_visitas`).
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { useCancelarVisita, useConcluirVisita, useRemarcarVisita, type Visita } from '@/hooks/usePortalDoDistribuidor';
import { dataHora, fromLocalDateTimeInput, toLocalDateTimeInput } from '@/lib/dates';

export function AcoesDaVisita({ v, children }: { v: Visita; children: ReactNode }) {
  const concluir = useConcluirVisita();
  const remarcar = useRemarcarVisita();
  const cancelar = useCancelarVisita();
  const [aberto, setAberto] = useState<'feita' | 'remarcar' | null>(null);
  const [resultado, setResultado] = useState('');
  const [quando, setQuando] = useState(toLocalDateTimeInput(v.quando));
  const [confirmar, setConfirmar] = useState(false);
  return (
    <li className="py-2.5 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[160px]">{children}</div>
        {!aberto && (
          <div className="flex gap-2">
            <Button variant="outline" className="h-11" onClick={() => setAberto('feita')}>Fiz a visita</Button>
            <Button variant="ghost" className="h-11" onClick={() => setAberto('remarcar')}>Remarcar</Button>
            <Button variant="ghost" className="h-11 text-status-danger" onClick={() => setConfirmar(true)}>Cancelar</Button>
          </div>
        )}
      </div>
      {aberto === 'feita' && (
        <div className="space-y-2">
          <Textarea rows={2} placeholder="Como foi? (deixou amostra, vai testar, comprou…)" aria-label="Como foi a visita"
            value={resultado} onChange={(e) => setResultado(e.target.value)} />
          <div className="flex gap-2">
            <Button className="h-11" disabled={concluir.isPending}
              onClick={() => concluir.mutate({ id: v.id, resultado }, { onSuccess: () => setAberto(null) })}>Registrar</Button>
            <Button variant="outline" className="h-11" onClick={() => setAberto(null)}>Voltar</Button>
          </div>
        </div>
      )}
      {aberto === 'remarcar' && (
        <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => {
          e.preventDefault();
          remarcar.mutate({ id: v.id, quando: fromLocalDateTimeInput(quando) }, { onSuccess: () => setAberto(null) });
        }}>
          <Input type="datetime-local" className="h-11 text-base flex-1 min-w-[200px]" aria-label="Nova data da visita" required
            value={quando} onChange={(e) => setQuando(e.target.value)} />
          <Button type="submit" className="h-11" disabled={!quando || remarcar.isPending}>Remarcar</Button>
          <Button type="button" variant="outline" className="h-11" onClick={() => setAberto(null)}>Voltar</Button>
        </form>
      )}
      <ConfirmarExclusao aberto={confirmar} titulo="Cancelar a visita?" acao="Cancelar a visita" enviando={cancelar.isPending}
        descricao={`A visita de ${dataHora(v.quando)} sai da agenda.`}
        onCancelar={() => setConfirmar(false)} onConfirmar={() => cancelar.mutate(v.id, { onSuccess: () => setConfirmar(false) })} />
    </li>
  );
}
