// Escrever ou editar uma notícia do Jornal (quem tem "Criar e editar" na seção Jornal do Marketing).
// Salva sempre como está; publicar é outro botão, de quem tem "Publicar e despublicar".
import { useState } from 'react';
import { toast } from 'sonner';
import { Paperclip, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { todayISO } from '@/lib/dates';
import { mensagemDeErro } from '@/lib/supabase-result';
import { ROTULO_DO_TIPO, type TipoDeNoticia } from '@/lib/jornal';
import {
  abrirAnexoDoJornal, useAnexarNaNoticia, useAnexosDaNoticia, useRemoverAnexoDaNoticia, useSalvarNoticia,
  type FormularioDeNoticia, type Noticia,
} from '@/hooks/useJornal';

export function EditorDeNoticia({ noticia, onClose }: { noticia: Noticia | null; onClose: () => void }) {
  const [f, setF] = useState<FormularioDeNoticia>(() => ({
    titulo: noticia?.titulo ?? '',
    texto: noticia?.texto ?? '',
    tipo: noticia?.tipo ?? 'aviso',
    data_noticia: noticia?.data_noticia ?? todayISO(),
    exibir_de: noticia?.exibir_de ?? null,
    exibir_ate: noticia?.exibir_ate ?? null,
    destaque: noticia?.destaque ?? false,
  }));
  const [id, setId] = useState<string | undefined>(noticia?.id);
  const [capaAtual, setCapaAtual] = useState<string | null>(noticia?.capa_caminho ?? null);
  const [capa, setCapa] = useState<File | null>(null);
  const salvar = useSalvarNoticia();
  const anexar = useAnexarNaNoticia();
  const remover = useRemoverAnexoDaNoticia();
  const { data: anexos = [] } = useAnexosDaNoticia(id ?? null);

  const mudar = <K extends keyof FormularioDeNoticia>(k: K, v: FormularioDeNoticia[K]) => setF((x) => ({ ...x, [k]: v }));
  const periodoInvalido = !!f.exibir_de && !!f.exibir_ate && f.exibir_ate < f.exibir_de;

  const gravar = (fechar: boolean) => salvar.mutate({ ...f, id, capa, capaAtual }, {
    onSuccess: (salva) => {
      setId(salva.id);
      setCapaAtual(salva.capa_caminho);
      setCapa(null);
      toast.success('Notícia salva.');
      if (fechar) onClose();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{noticia ? 'Editar notícia' : 'Nova notícia'}</DialogTitle>
          <DialogDescription>
            {noticia?.status === 'publicada' ? 'Já está no ar: o que você salvar aparece na hora.' : 'Fica em rascunho até alguém publicar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="jor-titulo">Título</Label>
            <Input id="jor-titulo" value={f.titulo} onChange={(e) => mudar('titulo', e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="jor-tipo">Tipo</Label>
              <select id="jor-tipo" value={f.tipo} onChange={(e) => mudar('tipo', e.target.value as TipoDeNoticia)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {(Object.keys(ROTULO_DO_TIPO) as TipoDeNoticia[]).map((t) => <option key={t} value={t}>{ROTULO_DO_TIPO[t]}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="jor-data">Data da notícia</Label>
              <Input id="jor-data" type="date" value={f.data_noticia} onChange={(e) => mudar('data_noticia', e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="jor-texto">Texto</Label>
            <Textarea id="jor-texto" rows={8} value={f.texto} onChange={(e) => mudar('texto', e.target.value)} />
            <p className="text-[12px] text-muted-foreground">Dá para usar **negrito**, *itálico* e listas com "- ".</p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Na tela inicial</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="jor-de">Mostrar a partir de</Label>
                <Input id="jor-de" type="date" value={f.exibir_de ?? ''} onChange={(e) => mudar('exibir_de', e.target.value || null)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="jor-ate">Até</Label>
                <Input id="jor-ate" type="date" value={f.exibir_ate ?? ''} onChange={(e) => mudar('exibir_ate', e.target.value || null)} />
              </div>
            </div>
            <p className="text-[12px] text-muted-foreground">Em branco: aparece desde que for publicada e continua até sair do topo. Fora do período, fica só no histórico.</p>
            {periodoInvalido && <p className="text-[12px] text-destructive">O fim não pode ser antes do início.</p>}
            <div className="flex items-center gap-2">
              <Switch id="jor-destaque" checked={f.destaque} onCheckedChange={(v) => mudar('destaque', v)} />
              <Label htmlFor="jor-destaque">Destaque: notícia principal da tela inicial</Label>
            </div>
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="jor-capa">Imagem de capa {capaAtual ? '(já tem uma; escolha outra para trocar)' : ''}</Label>
            <Input id="jor-capa" type="file" accept=".jpg,.jpeg,.png,.webp,.gif" onChange={(e) => setCapa(e.target.files?.[0] ?? null)} />
          </div>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Anexos</h4>
            {!id ? (
              <p className="text-[12px] text-muted-foreground">Salve a notícia para anexar arquivos.</p>
            ) : (
              <>
                {anexos.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <button type="button" className="text-primary hover:underline text-left flex-1" onClick={() => abrirAnexoDoJornal(a.caminho)}>{a.nome}</button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Remover ${a.nome}`} disabled={remover.isPending}
                      onClick={() => remover.mutate(a, { onError: (e) => toast.error(mensagemDeErro(e)) })}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Input type="file" aria-label="Anexar arquivo" disabled={anexar.isPending}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.jpg,.jpeg,.png,.webp,.gif,.zip"
                  onChange={(e) => {
                    const arquivo = e.target.files?.[0];
                    e.target.value = '';
                    if (arquivo) anexar.mutate({ noticiaId: id, arquivo }, { onError: (err) => toast.error(mensagemDeErro(err)) });
                  }} />
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          {!id && <Button variant="outline" disabled={salvar.isPending || !f.titulo.trim() || periodoInvalido} onClick={() => gravar(false)}>Salvar e anexar arquivos</Button>}
          <Button disabled={salvar.isPending || !f.titulo.trim() || periodoInvalido} onClick={() => gravar(true)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
