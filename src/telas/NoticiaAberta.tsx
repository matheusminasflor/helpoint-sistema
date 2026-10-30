// A notícia aberta em página própria (dono, 2026-10-30: "está pequeno quando clico para ler ou ver as imagens; o
// colaborador ler e poder compartilhar a notícia por link"). Era uma janela por cima da lista, do tamanho dela; agora
// é `/jornal/<id>`: texto numa coluna de leitura, imagens na largura toda, e o endereço é o link que se compartilha.
// Quem recebe precisa entrar no sistema — o banco só mostra a notícia publicada a quem é da empresa.
import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { ArrowLeft, Link2, Newspaper, Paperclip, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { PrintsDaNoticia } from '@/components/jornal/PrintsDaNoticia';
import { ImagemDaNoticiaNoCartao, SeloDoTipo } from '@/components/jornal/CartaoDaNoticia';
import { useTenantPath } from '@/hooks/useTenantPath';
import { abrirAnexoDoJornal, useAnexosDaNoticia, useImagensDasNoticias, useLeituraDaNoticia, useNoticias } from '@/hooks/useJornal';

async function copiarLink(url: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast.success('Link copiado. Quem receber precisa entrar no sistema para ler.');
  } catch {
    toast.error('Não consegui copiar. Copie o endereço na barra do navegador.');
  }
}

export default function NoticiaAberta() {
  const { id = '' } = useParams();
  const tenantPath = useTenantPath();
  const { data: noticias = [], isLoading, error } = useNoticias();
  const noticia = noticias.find((n) => n.id === id) ?? null;
  const imagemDe = useImagensDasNoticias(noticia ? [noticia] : []);
  const { data: anexos = [] } = useAnexosDaNoticia(noticia?.id ?? null, noticia?.repeticao_de);
  const { ler, carregou } = useLeituraDaNoticia();

  useEffect(() => {
    if (noticia?.status === 'publicada') ler(noticia.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noticia?.id, carregou]);

  const voltar = (
    <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 text-[14px] font-semibold">
      <Link to={tenantPath('/jornal')}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Notícias</Link>
    </Button>
  );

  if (error) return <div className="px-4 py-6 lg:px-8">{voltar}<p className="mt-4 text-sm text-destructive">Não foi possível carregar a notícia.</p></div>;
  if (isLoading) return <div className="px-4 py-6 lg:px-8"><p className="text-sm text-muted-foreground">Carregando…</p></div>;
  if (!noticia) {
    return (
      <div className="px-4 py-6 lg:px-8">
        {voltar}
        <EmptyState icon={Newspaper} title="Notícia não encontrada" description="Ela pode ter saído do ar, ou o link está incompleto." />
      </div>
    );
  }

  const link = window.location.href.split('?')[0];
  const compartilhar = async () => {
    // No celular abre a folha de compartilhar (WhatsApp, e-mail…); no computador, copia o link.
    if (navigator.share) {
      try { await navigator.share({ title: noticia.titulo, url: link }); return; } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    await copiarLink(link);
  };
  const imagem = imagemDe(noticia);
  const outrosAnexos = anexos.filter((a) => !/\.(png|jpe?g|webp|gif)$/i.test(a.nome));

  return (
    <article className="w-full px-4 pb-10 pt-4 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        {voltar}
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" className="h-10 gap-1.5" onClick={() => copiarLink(link)}>
            <Link2 className="h-4 w-4" aria-hidden="true" />Copiar link
          </Button>
          <Button size="sm" className="h-10 gap-1.5" onClick={compartilhar}>
            <Share2 className="h-4 w-4" aria-hidden="true" />Compartilhar
          </Button>
        </div>
      </div>

      <header className="mt-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-[14px] text-muted-foreground">
          <SeloDoTipo tipo={noticia.tipo} />
          <span>{format(new Date(`${noticia.data_noticia}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
          {noticia.autor?.full_name && <span>· por {noticia.autor.full_name}</span>}
        </div>
        <h1 className="text-[26px] font-extrabold leading-tight text-foreground [text-wrap:balance] sm:text-[34px]">{noticia.titulo}</h1>
      </header>

      {/* A capa feita para 16:9 abre a notícia na largura toda; a imagem anexada aparece entre os prints, sem corte. */}
      {imagem.url && !imagem.inteira && (
        <ImagemDaNoticiaNoCartao imagem={imagem} tipo={noticia.tipo} className="mt-5 aspect-video w-full rounded-2xl" />
      )}

      {/* Coluna de leitura (~70 letras por linha) e letra maior que a das telas de trabalho. */}
      <div className="mt-6 max-w-[72ch]">
        <MarkdownRenderer content={noticia.texto}
          className="[&_h1]:text-[24px] [&_h2]:text-[21px] [&_h3]:text-[19px] [&_li]:text-[17px] [&_p]:mb-3 [&_p]:text-[17px] [&_ul]:space-y-1" />
      </div>

      <div className="mt-6">
        <PrintsDaNoticia noticiaId={noticia.id} origem={noticia.repeticao_de} />
      </div>

      {outrosAnexos.length > 0 && (
        <section className="mt-6 space-y-2">
          <h2 className="flex items-center gap-1.5 text-[15px] font-bold"><Paperclip className="h-4 w-4" aria-hidden="true" />Anexos</h2>
          {outrosAnexos.map((a) => (
            <button key={a.id} type="button" onClick={() => abrirAnexoDoJornal(a.caminho)} className="block text-left text-[15px] font-semibold text-primary hover:underline">
              {a.nome}
            </button>
          ))}
        </section>
      )}
    </article>
  );
}
