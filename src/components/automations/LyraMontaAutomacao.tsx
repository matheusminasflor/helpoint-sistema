import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Mic, Square, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useSaveWorkflow } from '@/hooks/useAutomations';
import { useDitado } from '@/hooks/useDitado';
import { useTenantPath } from '@/hooks/useTenantPath';
import { describeFlow, validateFlow, type AutomationModule, type DescribeContext, type FlowStep, type FlowTrigger } from '@/lib/automation-flow';
import { invokeEdge } from '@/lib/edge-function';
import { mensagemDeErro } from '@/lib/supabase-result';
import { toast } from 'sonner';

interface Montada { nome: string; trigger: FlowTrigger; steps: FlowStep[] }
type Resposta = Montada | { pergunta: string };

/** A fala vira texto no aparelho, sem IA. Só "Montar automação" gasta, e nada roda antes do clique em Ativar. */
export function LyraMontaAutomacao({ aberto, onFechar, module, ctx }: {
  aberto: boolean; onFechar: () => void; module: AutomationModule; ctx: DescribeContext;
}) {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const salvar = useSaveWorkflow();
  const [texto, setTexto] = useState('');
  const [pergunta, setPergunta] = useState('');
  const [montada, setMontada] = useState<Montada | null>(null);
  const [montando, setMontando] = useState(false);
  const juntar = useCallback((trecho: string) => setTexto((t) => (t ? `${t} ${trecho}` : trecho)), []);
  const { ouvindo, provisorio, semResposta, iniciar, parar } = useDitado(juntar);

  const fechar = () => { parar(); setTexto(''); setPergunta(''); setMontada(null); onFechar(); };

  const montar = async () => {
    parar();
    setMontando(true);
    setPergunta('');
    try {
      const r = await invokeEdge<Resposta>('ai-montar-automacao', { texto, modulo: module });
      if ('pergunta' in r) { setPergunta(r.pergunta); return; }
      const erro = validateFlow(r.trigger, r.steps);
      if (erro) { setPergunta(`Não consegui montar: ${erro}. Pode explicar de outro jeito?`); return; }
      setMontada(r);
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setMontando(false);
    }
  };

  const guardar = (status: 'active' | 'draft') => {
    if (!montada) return;
    salvar.mutate({ module, name: montada.nome, trigger: montada.trigger, steps: montada.steps, status }, {
      onSuccess: (id) => { fechar(); if (status === 'draft') navigate(tenantPath(`/automacoes/${id}`)); },
    });
  };

  const frase = montada && describeFlow(montada.trigger, montada.steps, ctx);

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-primary" aria-hidden="true" />Falar com a Lyra</DialogTitle>
          <DialogDescription>Diga o que deve acontecer. A Lyra monta um rascunho e você confere antes de ativar.</DialogDescription>
        </DialogHeader>

        {frase ? (
          <div className="rounded-lg border border-border p-4 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[15px] font-semibold text-foreground">{montada.nome}</p>
              <span className="rounded-full px-2 py-0.5 text-[12px] font-semibold badge-warning">Rascunho, ainda não roda</span>
            </div>
            <p className="text-[14px] text-foreground"><strong>Quando:</strong> {frase.quando}</p>
            <p className="text-[14px] text-foreground"><strong>Então:</strong> {frase.entao}</p>
          </div>
        ) : (
          <div className="space-y-3">
            <Button type="button" variant={ouvindo ? 'destructive' : 'outline'} onClick={ouvindo ? parar : iniciar} className="gap-2" aria-pressed={ouvindo}>
              {ouvindo ? <Square className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />}
              {ouvindo ? 'Parar' : 'Falar'}
            </Button>
            {semResposta && <p className="text-[13px] text-aviso font-medium">Este aparelho não transcreveu. Toque no campo abaixo e use o microfone do teclado.</p>}
            <Textarea aria-label="O que a automação deve fazer" rows={4} value={ouvindo && provisorio ? `${texto} ${provisorio}`.trim() : texto} readOnly={ouvindo}
              onChange={(e) => setTexto(e.target.value)}
              placeholder="Ex.: quando abrirem chamado de impressora, passe para o responsável e deixe a prioridade alta." />
            {pergunta && <p className="rounded-md badge-warning px-3 py-2 text-[14px]">{pergunta}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          {frase ? (
            <>
              <Button variant="outline" className="text-destructive" onClick={fechar}>Descartar</Button>
              <Button variant="outline" disabled={salvar.isPending} onClick={() => guardar('draft')}>Ajustar</Button>
              <Button disabled={salvar.isPending} onClick={() => guardar('active')}>Ativar</Button>
            </>
          ) : (
            <Button className="gap-2" disabled={montando || ouvindo || texto.trim().length < 10} onClick={montar}>
              {montando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
              Montar automação
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
