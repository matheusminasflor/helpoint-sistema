// Os prints da notícia (dono, 2026-10-15: "no menu de atualizações do sistema, sempre que explicar o que foi feito, ter
// prints dos menus e locais do que foi alterado"). Os anexos que são imagem aparecem como imagem, com a legenda (o nome
// do arquivo); clicar abre em tamanho real. Os outros anexos continuam como link.
import { useAnexosDaNoticia, useCapas } from '@/hooks/useJornal';

const EH_IMAGEM = /\.(png|jpe?g|webp|gif)$/i;
const legenda = (nome: string) => nome.replace(EH_IMAGEM, '').replace(/[-_]+/g, ' ');

export function PrintsDaNoticia({ noticiaId, origem }: { noticiaId: string; origem?: string | null }) {
  const { data: anexos = [] } = useAnexosDaNoticia(noticiaId, origem);
  const imagens = anexos.filter((a) => EH_IMAGEM.test(a.nome));
  const { data: urls } = useCapas(imagens.map((a) => a.caminho));
  if (imagens.length === 0) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {imagens.map((a) => {
        const url = urls?.get(a.caminho);
        return (
          <figure key={a.id} className="rounded-md border bg-muted/30 overflow-hidden">
            {url
              ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={legenda(a.nome)} className="w-full object-contain max-h-80 bg-background" /></a>
              : <div className="h-40 animate-pulse bg-muted" />}
            <figcaption className="px-2 py-1 text-[12px] text-muted-foreground">{legenda(a.nome)}</figcaption>
          </figure>
        );
      })}
    </div>
  );
}
