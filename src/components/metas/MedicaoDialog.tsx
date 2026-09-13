import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2 } from 'lucide-react';
import {
  useLancarMedicao, useApagarMedicao, useMedicoes,
  formatarValor, periodoDe, rotuloPeriodo, type Meta,
} from '@/hooks/useMetas';

/**
 * Lançar o número do período e ver o histórico. Lançar o mesmo período de novo
 * corrige o que estava lá — o banco guarda uma medição por período, e é isso
 * que deixa arrumar o número de março em abril sem inventar um segundo março.
 */
export function MedicaoDialog({ open, onOpenChange, meta }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  meta: Meta | null;
}) {
  const lancar = useLancarMedicao();
  const apagar = useApagarMedicao();
  const { data: medicoes = [] } = useMedicoes(meta?.id);

  const [periodo, setPeriodo] = useState('');
  const [valor, setValor] = useState('');
  const [nota, setNota] = useState('');

  useEffect(() => {
    if (!open || !meta) return;
    setPeriodo(periodoDe(new Date(), meta.frequency));
    setValor('');
    setNota('');
  }, [open, meta]);

  if (!meta) return null;

  // Escolher o período por um campo de mês evita o engano de lançar "15 de
  // março" e "20 de março" como duas medições diferentes do mesmo mês.
  const jaLancado = medicoes.find(m => m.period_date === periodo);
  const numero = Number(valor.replace(',', '.'));
  const podeSalvar = valor.trim() !== '' && Number.isFinite(numero) && periodo !== '' && !lancar.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançar número</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-sm font-medium text-foreground">{meta.title}</p>
            <p className="text-[13px] text-muted-foreground">
              Meta: {meta.direction === 'down' ? 'cair até' : 'chegar a'}{' '}
              {formatarValor(Number(meta.target_value), meta.unit)}
              {meta.baseline != null && ` · partiu de ${formatarValor(Number(meta.baseline), meta.unit)}`}
              {meta.current_value === null && ' · ainda sem número lançado'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Período</Label>
              <Input
                type="month"
                value={periodo.slice(0, 7)}
                onChange={(e) => {
                  const [a, m] = e.target.value.split('-').map(Number);
                  if (!a || !m) return;
                  setPeriodo(periodoDe(new Date(a, m - 1, 1), meta.frequency));
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Número</Label>
              <Input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            Vale para {rotuloPeriodo(periodo, meta.frequency)}.
            {jaLancado && ` Já há ${formatarValor(Number(jaLancado.value), meta.unit)} lançado — salvar corrige.`}
          </p>

          <div className="space-y-1.5">
            <Label>Comentário (opcional)</Label>
            <Textarea rows={2} value={nota} onChange={(e) => setNota(e.target.value)}
              placeholder="O que explica esse número, o que foi feito, o que travou…" />
          </div>

          {medicoes.length > 0 && (
            <div className="space-y-1.5">
              <Label>Histórico</Label>
              <ul className="rounded-md border border-border divide-y divide-border">
                {[...medicoes].reverse().map(m => (
                  <li key={m.id} className="flex items-start gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-foreground">
                        <span className="text-muted-foreground">{rotuloPeriodo(m.period_date, meta.frequency)}</span>
                        {' · '}
                        <strong>{formatarValor(Number(m.value), meta.unit)}</strong>
                      </p>
                      {m.note && <p className="text-[11px] text-muted-foreground">{m.note}</p>}
                    </div>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 flex-shrink-0"
                      aria-label={`Remover a medição de ${rotuloPeriodo(m.period_date, meta.frequency)}`}
                      onClick={() => apagar.mutate({ id: m.id, goal_id: meta.id })}
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button
            disabled={!podeSalvar}
            onClick={() => lancar.mutate(
              { goal_id: meta.id, period_date: periodo, value: numero, note: nota },
              { onSuccess: () => { setValor(''); setNota(''); } },
            )}
          >
            {jaLancado ? 'Corrigir' : 'Lançar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
