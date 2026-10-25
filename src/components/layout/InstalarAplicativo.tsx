import { Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { abertoComoAplicativo, ehIphone, instalar, usePodeInstalar } from '@/lib/aplicativo';

/**
 * "Instalar o Helpoint" no menu da pessoa (PWA, decisão 6, 2026-10-24). Onde o navegador oferece (Chrome, Edge,
 * Android), abre o pedido dele; no iPhone, que não oferece, diz o caminho do Compartilhar. Some quando já está aberto
 * como aplicativo.
 */
export function InstalarAplicativo({ aoClicar }: { aoClicar: () => void }) {
  const podeInstalar = usePodeInstalar();
  if (abertoComoAplicativo()) return null;

  const clicar = async () => {
    aoClicar();
    if (podeInstalar) {
      if (await instalar()) toast.success('Pronto: o Helpoint está na sua tela inicial.');
      return;
    }
    toast.info(ehIphone()
      ? 'No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".'
      : 'No menu do navegador (⋮), escolha "Instalar Helpoint" ou "Adicionar à tela inicial".', { duration: 10000 });
  };

  return (
    <button
      type="button"
      onClick={clicar}
      className="w-full flex items-center gap-2 px-2.5 py-2 min-h-[40px] rounded-md text-[14px] hover:bg-secondary transition-colors text-left"
    >
      <Smartphone className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
      <span>Instalar o Helpoint</span>
    </button>
  );
}
