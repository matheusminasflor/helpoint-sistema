// O desenho do fluxo em Lançamentos (dono, 2026-11-05): aparece até a pessoa marcar "não mostrar mais", e a interrogação
// abre de novo. ponytail: a escolha fica neste navegador, como "Como ler" da Carteira. Se precisar seguir a pessoa entre
// aparelhos, vai para o perfil.
import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const CHAVE = 'lancamento-fluxo-entendido';
const PASSOS = [
  { titulo: 'Lance o pedido', texto: 'Preencha o lançamento e o checklist.', cor: 'border-t-border' },
  { titulo: 'Financeiro aprova', texto: 'Confere e aprova o pedido.', cor: 'border-t-border' },
  { titulo: 'Faturou? Informe a nota', texto: 'Número, valor faturado e data de emissão.', cor: 'border-t-status-danger' },
  { titulo: 'Conta na hora', texto: 'Entra na Carteira e nos Indicadores, a confirmar.', cor: 'border-t-status-info' },
  { titulo: 'Sexta: Forteplus confere', texto: 'A importação confirma e o valor dela prevalece.', cor: 'border-t-status-success' },
];

const jaEntendeu = () => {
  try { return localStorage.getItem(CHAVE) === '1'; } catch { return false; }
};

export function FluxoDoLancamento() {
  const [aberto, setAberto] = useState(() => !jaEntendeu());
  const [naoMostrar, setNaoMostrar] = useState(false);
  const fechar = () => {
    if (naoMostrar) {
      try { localStorage.setItem(CHAVE, '1'); } catch { /* sem armazenamento: vale só nesta visita */ }
    }
    setAberto(false);
  };
  return (
    <>
      <Button type="button" variant="outline" size="icon" aria-label="Ver como funciona" title="Ver como funciona" onClick={() => setAberto(true)}>
        <CircleHelp className="w-4 h-4" aria-hidden="true" />
      </Button>
      <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar(); }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader><DialogTitle>Como funciona, do lançamento à sexta-feira</DialogTitle></DialogHeader>
          <ol className="grid gap-2 sm:grid-cols-5">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className={`rounded-lg border border-border border-t-4 p-2 space-y-1 ${p.cor}`}>
                <p className="text-[12px] text-muted-foreground">{i + 1}</p>
                <p className="text-[14px] font-semibold leading-tight">{p.titulo}</p>
                <p className="text-[13px] text-muted-foreground">{p.texto}</p>
              </li>
            ))}
          </ol>
          <DialogFooter className="sm:justify-between items-center gap-2">
            <label className="flex items-center gap-2 text-[14px] min-h-9">
              <input type="checkbox" checked={naoMostrar} onChange={(e) => setNaoMostrar(e.target.checked)} />
              Entendi, não mostrar mais
            </label>
            <Button onClick={fechar}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
