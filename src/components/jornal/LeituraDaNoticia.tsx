// Ler uma notícia do Jornal da empresa: capa, texto e anexos.
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { ROTULO_DO_TIPO } from '@/lib/jornal';
import { abrirAnexoDoJornal, useAnexosDaNoticia, type Noticia } from '@/hooks/useJornal';

export function LeituraDaNoticia({ noticia, capa, onClose }: { noticia: Noticia | null; capa?: string; onClose: () => void }) {
  const { data: anexos = [] } = useAnexosDaNoticia(noticia?.id ?? null);
  if (!noticia) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {capa && <img src={capa} alt="" className="w-full aspect-video object-cover rounded-md" />}
        <DialogHeader>
          <DialogTitle>{noticia.titulo}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{ROTULO_DO_TIPO[noticia.tipo] ?? noticia.tipo}</Badge>
            <span>{format(new Date(`${noticia.data_noticia}T12:00:00`), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>
            {noticia.autor?.full_name && <span>· por {noticia.autor.full_name}</span>}
          </DialogDescription>
        </DialogHeader>
        <MarkdownRenderer content={noticia.texto} />
        {anexos.length > 0 && (
          <section className="space-y-1">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Anexos</h4>
            {anexos.map((a) => (
              <button key={a.id} type="button" onClick={() => abrirAnexoDoJornal(a.caminho)} className="block text-sm text-primary hover:underline text-left">
                {a.nome}
              </button>
            ))}
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
