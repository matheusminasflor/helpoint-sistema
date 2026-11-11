// O tutorial de cada relatório (revisão do sistema, 2026-10-01, decisão do dono).
//
// "Seria interessante ter um tutorialzinho, um pop-up quando eu clico no relatório, explicando o que
// ele faz, de onde vem." Decisão: abre sozinho na primeira vez, com "não mostrar mais", e fica no
// botão "?" do título para rever. O conteúdo de cada relatório mora em
// `src/config/tutoriais-dos-relatorios.ts` — um lugar só, para revisar os textos juntos.
//
// "Não mostrar mais" é preferência de quem olha, guardada no navegador (localStorage): some num
// navegador novo, o que aqui é aceitável — no pior caso o tutorial aparece de novo uma vez.
import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TUTORIAIS, type IdDoTutorial } from '@/config/tutoriais-dos-relatorios';

const chave = (id: string) => `helpoint:tutorial:${id}`;

function jaDispensou(id: string): boolean {
  try { return localStorage.getItem(chave(id)) === 'nao-mostrar'; } catch { return false; }
}
function dispensar(id: string) {
  try { localStorage.setItem(chave(id), 'nao-mostrar'); } catch { /* navegador sem armazenamento: só fecha */ }
}

export function TutorialDoRelatorio({ id }: { id: IdDoTutorial }) {
  const t = TUTORIAIS[id];
  const [aberto, setAberto] = useState(false);

  // Abre sozinho UMA vez por pessoa e navegador (dono, 2026-11-12: "uma vez só"); depois, só pelo "Como ler". Antes abria a
  // cada visita até a pessoa achar o "não mostrar mais".
  useEffect(() => { if (!jaDispensou(id)) { setAberto(true); dispensar(id); } }, [id]);

  return (
    <>
      <Button variant="ghost" size="sm" className="h-8 gap-1 text-muted-foreground print:hidden"
        onClick={() => setAberto(true)} aria-label={`Como ler: ${t.titulo}`}>
        <HelpCircle className="w-4 h-4" aria-hidden="true" /> Como ler
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-[14px]">
            <section>
              <p className="font-semibold">O que é</p>
              <p className="text-muted-foreground">{t.oQueE}</p>
            </section>
            <section>
              <p className="font-semibold">De onde vêm os números</p>
              <p className="text-muted-foreground">{t.deOndeVem}</p>
            </section>
            <section>
              <p className="font-semibold">Como ler</p>
              <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
                {t.comoLer.map((linha) => <li key={linha}>{linha}</li>)}
              </ul>
            </section>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button onClick={() => setAberto(false)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
