// Os prints da notícia (dono, 2026-10-15: "no menu de atualizações do sistema, sempre que explicar o que foi feito, ter
// prints dos menus e locais do que foi alterado"). Os anexos que são imagem aparecem como imagem, com a legenda (o nome
// do arquivo); clicar amplia na própria página (dono, 2026-10-15: abria aba nova). Os outros anexos continuam como link.
import { useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useAnexosDaNoticia, useCapas } from '@/hooks/useJornal';

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
const legenda = (nome: string) => nome.replace(EH_IMAGEM, '').replace(/[-_]+/g, ' ');

export function PrintsDaNoticia({ noticiaId, origem }: { noticiaId: string; origem?: string | null }) {
  const { data: anexos = [] } = useAnexosDaNoticia(noticiaId, origem);
  const imagens = anexos.filter((a) => EH_IMAGEM.test(a.nome));
  const { data: urls } = useCapas(imagens.map((a) => a.caminho));
  const [aberta, setAberta] = useState<{ url: string; nome: string } | null>(null);
  if (imagens.length === 0) return null;
  return (
    <>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {imagens.map((a) => {
          const url = urls?.get(a.caminho);
          return (
            <figure key={a.id} className="rounded-md border bg-muted/30 overflow-hidden">
              {url
                ? (
                  <button type="button" className="block w-full cursor-zoom-in" title="Ampliar"
                    onClick={() => setAberta({ url, nome: legenda(a.nome) })}>
                    <img src={url} alt={legenda(a.nome)} className="w-full object-contain max-h-80 bg-background" />
                  </button>
                )
                : <div className="h-40 animate-pulse bg-muted" />}
              <figcaption className="px-2 py-1 text-[12px] text-muted-foreground">{legenda(a.nome)}</figcaption>
            </figure>
          );
        })}
      </div>
      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-[95vw] w-auto p-2 sm:p-3">
          <DialogTitle className="text-sm font-medium pr-8">{aberta?.nome}</DialogTitle>
          {aberta && <img src={aberta.url} alt={aberta.nome} className="max-h-[85vh] max-w-full object-contain mx-auto" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
