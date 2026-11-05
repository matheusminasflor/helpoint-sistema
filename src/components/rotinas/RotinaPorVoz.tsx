import { useCallback, useState } from 'react';
import { Loader2, Mic, Square, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useDitado } from '@/hooks/useDitado';
import type { RotinaNova } from '@/hooks/useRotinas';
import { invokeEdge } from '@/lib/edge-function';
import { mensagemDeErro } from '@/lib/supabase-result';
import { toast } from 'sonner';

export type RotinaFalada = Pick<RotinaNova, 'titulo' | 'como_fazer' | 'periodo' | 'repeticao' | 'dias_da_semana' | 'dia_do_mes' | 'pede'>;

/** A fala vira texto no aparelho, sem IA. Só "Montar rotina" gasta, e o resultado apenas preenche o formulário de sempre. */
export function RotinaPorVoz({ onFechar, onMontada, inicial = '' }: { onFechar: () => void; onMontada: (rotina: RotinaFalada) => void; inicial?: string }) {
  const [texto, setTexto] = useState(inicial);
  const [montando, setMontando] = useState(false);
  const juntar = useCallback((trecho: string) => setTexto((t) => (t ? `${t} ${trecho}` : trecho)), []);
  const { ouvindo, provisorio, semResposta, iniciar, parar } = useDitado(juntar);

  const montar = async () => {
    parar();
    setMontando(true);
    try {
      onMontada(await invokeEdge<RotinaFalada>('ai-montar-rotina', { texto }));
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setMontando(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) { parar(); onFechar(); } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" aria-hidden="true" />Falar com a Lyra</DialogTitle>
          <DialogDescription>Diga o que você faz, quando e com que frequência. Você confere no formulário antes de salvar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Button type="button" variant={ouvindo ? 'destructive' : 'outline'} onClick={ouvindo ? parar : iniciar} className="gap-2" aria-pressed={ouvindo}>
            {ouvindo ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
            {ouvindo ? 'Parar' : 'Falar'}
          </Button>
          {semResposta && <p className="text-[13px] text-aviso font-medium">Este aparelho não transcreveu. Toque no campo abaixo e use o microfone do teclado.</p>}
          <Textarea aria-label="A rotina que você quer criar" rows={4} value={ouvindo && provisorio ? `${texto} ${provisorio}`.trim() : texto} readOnly={ouvindo}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: toda segunda de manhã, conferir o backup e guardar um print." />
        </div>
        <DialogFooter>
          <Button className="gap-2" disabled={montando || ouvindo || texto.trim().length < 5} onClick={montar}>
            {montando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
            Montar rotina
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
