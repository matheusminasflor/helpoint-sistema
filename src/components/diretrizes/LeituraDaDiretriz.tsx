// Ler uma diretriz: a última versão publicada, os anexos, o histórico de versões e o "Li e estou
// ciente" quando ela pede (decisão do dono, 2026-10-04 — versão nova pede ciência de novo).
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { CheckCircle2, History, Paperclip } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MarkdownRenderer } from '@/components/ui/markdown-renderer';
import { useAuth } from '@/contexts/AuthContext';
import { mensagemDeErro } from '@/lib/supabase-result';
import { rotuloDoSetor } from '@/lib/setores';
import {
  abrirAnexo, useDarCiencia, useDetalheDaDiretriz, type Diretriz,
} from '@/hooks/useDiretrizes';

const data = (iso: string) => format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

export function LeituraDaDiretriz({ diretriz, onClose }: { diretriz: Diretriz | null; onClose: () => void }) {
  const { user } = useAuth();
  const { data: detalhe, isLoading } = useDetalheDaDiretriz(diretriz?.id ?? null);
  const darCiencia = useDarCiencia();
  const [versaoAberta, setVersaoAberta] = useState<number | null>(null);

  if (!diretriz) return null;
  const versoes = detalhe?.versoes ?? [];
  const atual = versoes.find((v) => v.numero === diretriz.versao_atual) ?? versoes[0];
  const mostrada = versaoAberta ? versoes.find((v) => v.numero === versaoAberta) ?? atual : atual;
  const jaCiente = (detalhe?.ciencias ?? []).some((c) => c.user_id === user?.id && c.versao === diretriz.versao_atual);

  const ciente = () => darCiencia.mutate(
    { diretrizId: diretriz.id, versao: diretriz.versao_atual },
    {
      onSuccess: () => toast.success('Ciência registrada.'),
      onError: (e) => toast.error(mensagemDeErro(e)),
    },
  );

  return (
    <Dialog open onOpenChange={(o) => { if (!o) { setVersaoAberta(null); onClose(); } }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mostrada?.titulo ?? diretriz.titulo}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{rotuloDoSetor(diretriz.setor)}</Badge>
            {mostrada && <span>Versão {mostrada.numero} · publicada em {data(mostrada.publicada_em)}{mostrada.autor?.full_name ? ` por ${mostrada.autor.full_name}` : ''}</span>}
            {diretriz.responsavel?.full_name && <span>· Responsável: {diretriz.responsavel.full_name}</span>}
            {diretriz.status === 'arquivada' && <Badge variant="secondary">Arquivada</Badge>}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : !mostrada ? (
          <p className="text-sm text-muted-foreground">Esta diretriz ainda não foi publicada.</p>
        ) : (
          <div className="space-y-5">
            {versaoAberta && versaoAberta !== diretriz.versao_atual && (
              <p className="text-[14px] rounded-md badge-warning px-3 py-2">
                Você está vendo a versão {versaoAberta}, que não é a atual.{' '}
                <button type="button" className="underline" onClick={() => setVersaoAberta(null)}>Ver a atual</button>
              </p>
            )}
            <MarkdownRenderer content={mostrada.conteudo} />

            {(detalhe?.anexos.length ?? 0) > 0 && (
              <section className="space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Anexos</h4>
                {detalhe!.anexos.map((a) => (
                  <button key={a.id} type="button" onClick={() => abrirAnexo(a.caminho)}
                    className="block text-sm text-primary hover:underline text-left">
                    {a.nome}
                  </button>
                ))}
              </section>
            )}

            {diretriz.exige_ciencia && diretriz.status === 'publicada' && (
              <section className="rounded-md border p-3 flex items-center gap-3">
                {jaCiente ? (
                  <p className="text-sm flex items-center gap-2 text-status-success">
                    <CheckCircle2 className="w-4 h-4" /> Você deu ciência desta versão.
                  </p>
                ) : (
                  <>
                    <p className="text-sm flex-1">Esta diretriz pede que você confirme a leitura.</p>
                    <Button size="sm" onClick={ciente} disabled={darCiencia.isPending}>Li e estou ciente</Button>
                  </>
                )}
              </section>
            )}

            {versoes.length > 1 && (
              <section className="space-y-1">
                <h4 className="text-sm font-semibold flex items-center gap-1.5"><History className="w-4 h-4" />Versões</h4>
                <ul className="space-y-1">
                  {versoes.map((v) => (
                    <li key={v.id}>
                      <button type="button" onClick={() => setVersaoAberta(v.numero)}
                        className="w-full text-left text-[14px] rounded px-2 py-1 hover:bg-muted">
                        <span className="font-medium">Versão {v.numero}</span>
                        <span className="text-muted-foreground"> · {data(v.publicada_em)}{v.autor?.full_name ? ` · ${v.autor.full_name}` : ''}</span>
                        {v.resumo && <span className="block text-muted-foreground">{v.resumo}</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
