import { useState } from 'react';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIALigada } from '@/hooks/useAssistantName';
import { invokeEdge } from '@/lib/edge-function';
import { mensagemDeErro } from '@/lib/supabase-result';
import { toast } from 'sonner';

const paraBase64 = (arquivo: File) => new Promise<string>((ok, falha) => {
  const leitor = new FileReader();
  leitor.onload = () => ok(String(leitor.result).split(',')[1] ?? '');
  leitor.onerror = () => falha(new Error('Não foi possível abrir o arquivo.'));
  leitor.readAsDataURL(arquivo);
});

/** Lê o anexo e preenche os campos; a pessoa confere antes de enviar (Onda 1 do mapa de IA). Só usa IA no clique. */
export function PreencherComIA<T>({ arquivo, modelo, onCampos }: {
  arquivo: File; modelo: 'orcamento' | 'comprovante'; onCampos: (campos: T) => void;
}) {
  const iaLigada = useIALigada();
  const [lendo, setLendo] = useState(false);
  if (!iaLigada) return null;
  const ler = async () => {
    setLendo(true);
    try {
      const { campos } = await invokeEdge<{ campos: T }>('ai-ler-anexo', { arquivo: await paraBase64(arquivo), tipo: arquivo.type, modelo });
      onCampos(campos);
      toast.success('Campos preenchidos. Confira antes de enviar.');
    } catch (e) {
      toast.error(mensagemDeErro(e));
    } finally {
      setLendo(false);
    }
  };
  return (
    <Button type="button" size="sm" variant="outline" className="gap-1.5" disabled={lendo} onClick={ler}>
      {lendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Wand2 className="h-3.5 w-3.5" aria-hidden="true" />}
      Preencher com IA
    </Button>
  );
}
