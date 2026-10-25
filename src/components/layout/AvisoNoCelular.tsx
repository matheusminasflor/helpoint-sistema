import { useEffect, useState } from 'react';
import { BellRing } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { desligarAvisoNoCelular, estadoDoAviso, ligarAvisoNoCelular, type EstadoDoAviso } from '@/lib/aviso-no-celular';
import { mensagemDeErro } from '@/lib/supabase-result';

const FRASE: Record<EstadoDoAviso, string> = {
  sem_suporte: 'Este navegador não recebe aviso fora da tela.',
  precisa_instalar: 'No iPhone, instale o Helpoint (Compartilhar › Adicionar à Tela de Início) para receber os avisos.',
  negado: 'Os avisos estão bloqueados neste aparelho: libere nas configurações do navegador.',
  ligado: 'Este aparelho recebe os avisos.',
  desligado: '',
};

/** "Receber no celular" (etapa 4b): liga ou desliga o aviso neste aparelho. */
export function AvisoNoCelular() {
  const [estado, setEstado] = useState<EstadoDoAviso | null>(null);
  const [mudando, setMudando] = useState(false);
  useEffect(() => { void estadoDoAviso().then(setEstado).catch(() => setEstado('sem_suporte')); }, []);
  if (!estado) return null;
  const alternar = async () => {
    setMudando(true);
    try {
      const novo = estado === 'ligado' ? await desligarAvisoNoCelular() : await ligarAvisoNoCelular();
      setEstado(novo);
      if (novo === 'ligado') toast.success('Pronto: os avisos chegam neste aparelho.');
    } catch (e) {
      toast.error('Não ligou o aviso', { description: mensagemDeErro(e) });
    } finally {
      setMudando(false);
    }
  };
  if (estado === 'sem_suporte' || estado === 'precisa_instalar' || estado === 'negado') {
    return <p className="text-[13px] text-muted-foreground max-w-xs">{FRASE[estado]}</p>;
  }
  return (
    <Button variant="outline" size="sm" disabled={mudando} onClick={alternar} title={FRASE[estado] || undefined}>
      <BellRing className="w-4 h-4 mr-1.5" aria-hidden="true" />
      {estado === 'ligado' ? 'Parar avisos neste aparelho' : 'Receber avisos no celular'}
    </Button>
  );
}
