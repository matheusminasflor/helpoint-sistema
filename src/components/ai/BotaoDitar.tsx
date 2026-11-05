import { useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDitado } from '@/hooks/useDitado';
import { toast } from 'sonner';

/** O microfone de um campo de texto: a fala vira texto no aparelho, sem IA e sem custo. */
export function BotaoDitar({ onTexto }: { onTexto: (trecho: string) => void }) {
  const { ouvindo, provisorio, semResposta, iniciar, parar } = useDitado(onTexto);

  useEffect(() => {
    if (semResposta) toast.info('Este aparelho não transcreveu. Toque no campo e use o microfone do teclado.');
  }, [semResposta]);

  return (
    <span className="flex min-w-0 items-center gap-2">
      {ouvindo && <span aria-live="polite" className="truncate text-[13px] text-muted-foreground">{provisorio || 'Ouvindo…'}</span>}
      <Button type="button" size="sm" variant={ouvindo ? 'destructive' : 'outline'} onClick={ouvindo ? parar : iniciar}
        className="shrink-0 gap-1.5" aria-pressed={ouvindo}>
        {ouvindo ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-3.5 w-3.5" aria-hidden="true" />}
        {ouvindo ? 'Parar' : 'Falar'}
      </Button>
    </span>
  );
}
