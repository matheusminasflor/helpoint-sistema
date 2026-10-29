// Os prints da notícia (dono, 2026-10-15: "no menu de atualizações do sistema, sempre que explicar o que foi feito, ter
// prints dos menus e locais do que foi alterado"). Os anexos que são imagem aparecem como imagem, com a legenda (o nome
// do arquivo); clicar amplia na própria página (dono, 2026-10-15: abria aba nova). Os outros anexos continuam como link.
// Um print por linha, na largura toda (dono, 2026-10-29: "pequenos demais, não dá para ver nada"); ampliado, abre no
// tamanho real com rolagem — encolher para caber na tela é o que deixava a letra ilegível.
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
      <div className="mt-3 space-y-4">
        {imagens.map((a) => {
          const url = urls?.get(a.caminho);
          return (
            <figure key={a.id} className="rounded-md border bg-muted/30 overflow-hidden">
              {url
                ? (
                  <button type="button" className="block w-full cursor-zoom-in" title="Ver no tamanho real"
                    onClick={() => setAberta({ url, nome: legenda(a.nome) })}>
                    <img src={url} alt={legenda(a.nome)} className="block w-full h-auto bg-background" />
                  </button>
                )
                : <div className="h-60 animate-pulse bg-muted" />}
              <figcaption className="px-3 py-1.5 text-[13px] text-muted-foreground">{legenda(a.nome)}</figcaption>
            </figure>
          );
        })}
      </div>
      <Dialog open={!!aberta} onOpenChange={(o) => !o && setAberta(null)}>
        <DialogContent className="max-w-[96vw] w-auto max-h-[94vh] p-2 sm:p-3 flex flex-col">
          <DialogTitle className="text-sm font-medium pr-8">{aberta?.nome}</DialogTitle>
          <div className="overflow-auto min-h-0">
            {aberta && <img src={aberta.url} alt={aberta.nome} className="max-w-none" />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
