// A aba "Diretrizes do <setor>" nas Configurações (decisão do dono, 2026-10-04): escrever, publicar,
// arquivar, versões e quem deu ciência. Cada botão aparece só para quem tem a caixinha do perfil, e
// o banco confere a mesma coisa (`pode_no_setor(setor, 'diretrizes', …)`, migration 20261204010000).
import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { Archive, Eye, Paperclip, Pencil, Plus, Send, Trash2, Users, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LeituraDaDiretriz } from '@/components/diretrizes/LeituraDaDiretriz';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMembrosDoSetor } from '@/hooks/useMembrosDoSetor';
import { mensagemDeErro } from '@/lib/supabase-result';
import {
  nomeDasDiretrizes, ROTULO_DA_VISIBILIDADE, ROTULO_DO_STATUS, SETORES_COM_DIRETRIZ,
  type SetorComDiretriz, type VisibilidadeDaDiretriz,
} from '@/config/diretrizes';
import { rotuloDoSetor } from '@/lib/setores';
import {
  abrirAnexo, useAnexarNaDiretriz, useApagarDiretriz, useArquivarDiretriz, useDetalheDaDiretriz, useDiretrizes,
  usePublicarDiretriz, useRemoverAnexoDaDiretriz, useSalvarDiretriz, type Diretriz, type FormularioDeDiretriz,
} from '@/hooks/useDiretrizes';

const VAZIO = (setor: string): FormularioDeDiretriz => ({
  setor, titulo: '', conteudo: '', responsavel_id: null, exige_ciencia: false, visibilidade: 'setor', setores_visiveis: [],
});

export function GestaoDeDiretrizes({ setor }: { setor: SetorComDiretriz }) {
  const { pode } = useConfiguracaoDosSetores();
  const podeEditar = pode(setor, 'diretrizes', 'edit');
  const podePublicar = pode(setor, 'diretrizes', 'publish');
  const podeApagar = pode(setor, 'diretrizes', 'delete');
  const { data: diretrizes = [], isLoading } = useDiretrizes(setor);
  const publicar = usePublicarDiretriz();
  const arquivar = useArquivarDiretriz();
  const apagar = useApagarDiretriz();

  const [editando, setEditando] = useState<Diretriz | 'nova' | null>(null);
  const [publicando, setPublicando] = useState<Diretriz | null>(null);
  const [resumo, setResumo] = useState('');
  const [lendo, setLendo] = useState<Diretriz | null>(null);
  const [ciencias, setCiencias] = useState<Diretriz | null>(null);

  const falhou = (e: unknown) => toast.error(mensagemDeErro(e));

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{nomeDasDiretrizes(setor)}</CardTitle>
          <CardDescription>
            Escreva em rascunho; quem tem "Publicar" publica. Cada publicação vira uma versão, e o setor lê
            sempre a última em "{nomeDasDiretrizes(setor)}", no menu.
          </CardDescription>
        </div>
        {podeEditar && (
          <Button size="sm" onClick={() => setEditando('nova')}><Plus className="w-4 h-4 mr-1" />Nova diretriz</Button>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : diretrizes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma diretriz ainda.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {diretrizes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{d.titulo}</span>
                    <Badge variant={d.status === 'publicada' ? 'default' : 'secondary'}>{ROTULO_DO_STATUS[d.status]}</Badge>
                    {d.exige_ciencia && <Badge variant="outline">Pede ciência</Badge>}
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    {ROTULO_DA_VISIBILIDADE[d.visibilidade]}
                    {d.visibilidade === 'setores' && d.setores_visiveis.length > 0
                      ? ` (${d.setores_visiveis.map((s) => rotuloDoSetor(s)).join(', ')})` : ''}
                    {d.versao_atual > 0 ? ` · versão ${d.versao_atual}` : ' · nunca publicada'}
                    {d.responsavel?.full_name ? ` · ${d.responsavel.full_name}` : ''}
                  </p>
                </div>
                {d.versao_atual > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setLendo(d)}><Eye className="w-4 h-4 mr-1" />Ver publicada</Button>
                )}
                {d.exige_ciencia && d.versao_atual > 0 && (
                  <Button variant="ghost" size="sm" onClick={() => setCiencias(d)}><Users className="w-4 h-4 mr-1" />Ciência</Button>
                )}
                {podeEditar && (
                  <Button variant="ghost" size="sm" onClick={() => setEditando(d)}><Pencil className="w-4 h-4 mr-1" />Editar</Button>
                )}
                {podePublicar && (
                  <Button variant="outline" size="sm" onClick={() => { setResumo(''); setPublicando(d); }}>
                    <Send className="w-4 h-4 mr-1" />{d.versao_atual > 0 ? 'Publicar nova versão' : 'Publicar'}
                  </Button>
                )}
                {podePublicar && d.status === 'publicada' && (
                  <Button variant="ghost" size="sm" disabled={arquivar.isPending}
                    onClick={() => arquivar.mutate(d.id, { onSuccess: () => toast.success('Diretriz arquivada.'), onError: falhou })}>
                    <Archive className="w-4 h-4 mr-1" />Arquivar
                  </Button>
                )}
                {podeApagar && d.status === 'rascunho' && d.versao_atual === 0 && (
                  <Button variant="ghost" size="sm" className="text-destructive" disabled={apagar.isPending}
                    onClick={() => apagar.mutate(d.id, { onSuccess: () => toast.success('Rascunho excluído.'), onError: falhou })}>
                    <Trash2 className="w-4 h-4 mr-1" />Excluir
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {editando && (
        <EditorDeDiretriz setor={setor} diretriz={editando === 'nova' ? null : editando} onClose={() => setEditando(null)} />
      )}

      <Dialog open={!!publicando} onOpenChange={(o) => !o && setPublicando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar "{publicando?.titulo}"</DialogTitle>
            <DialogDescription>
              O texto atual vira a versão {(publicando?.versao_atual ?? 0) + 1} e passa a ser o que o setor lê.
              {publicando?.exige_ciencia ? ' Como pede ciência, todos terão de confirmar a leitura de novo.' : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="resumo-da-versao">O que mudou (opcional)</Label>
            <Input id="resumo-da-versao" value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Ex.: prazo de troca de senha passou para 60 dias" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPublicando(null)}>Cancelar</Button>
            <Button disabled={publicar.isPending} onClick={() => publicando && publicar.mutate(
              { id: publicando.id, resumo },
              { onSuccess: (n) => { toast.success(`Publicada a versão ${n}.`); setPublicando(null); }, onError: falhou },
            )}>Publicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <LeituraDaDiretriz diretriz={lendo} onClose={() => setLendo(null)} />
      {ciencias && <QuemDeuCiencia diretriz={ciencias} onClose={() => setCiencias(null)} />}
    </Card>
  );
}

function EditorDeDiretriz({ setor, diretriz, onClose }: { setor: SetorComDiretriz; diretriz: Diretriz | null; onClose: () => void }) {
  const [f, setF] = useState<FormularioDeDiretriz>(() => diretriz ? {
    setor, titulo: diretriz.titulo, conteudo: diretriz.conteudo, responsavel_id: diretriz.responsavel_id,
    exige_ciencia: diretriz.exige_ciencia, visibilidade: diretriz.visibilidade, setores_visiveis: diretriz.setores_visiveis,
  } : VAZIO(setor));
  const [id, setId] = useState<string | undefined>(diretriz?.id);
  const salvar = useSalvarDiretriz();
  const anexar = useAnexarNaDiretriz();
  const remover = useRemoverAnexoDaDiretriz();
  const { data: detalhe } = useDetalheDaDiretriz(id ?? null);
  const { data: membros = [] } = useMembrosDoSetor(setor);
  const outros = SETORES_COM_DIRETRIZ.filter((s) => s.setor !== setor);

  const mudar = <K extends keyof FormularioDeDiretriz>(k: K, v: FormularioDeDiretriz[K]) => setF((x) => ({ ...x, [k]: v }));
  const gravar = (fechar: boolean) => salvar.mutate({ ...f, id }, {
    onSuccess: (novoId) => {
      setId(novoId);
      toast.success(diretriz?.versao_atual ? 'Salvo. Publique uma nova versão para o setor ver a mudança.' : 'Rascunho salvo.');
      if (fechar) onClose();
    },
    onError: (e) => toast.error(mensagemDeErro(e)),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{diretriz ? 'Editar diretriz' : 'Nova diretriz'}</DialogTitle>
          <DialogDescription>
            {diretriz?.versao_atual
              ? `Publicada na versão ${diretriz.versao_atual}. O que você mudar aqui só chega ao setor quando alguém publicar a nova versão.`
              : 'Fica em rascunho até alguém com "Publicar" publicar.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="dir-titulo">Título</Label>
            <Input id="dir-titulo" value={f.titulo} onChange={(e) => mudar('titulo', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="dir-conteudo">Conteúdo</Label>
            <Textarea id="dir-conteudo" rows={12} value={f.conteudo} onChange={(e) => mudar('conteudo', e.target.value)} />
            <p className="text-[13px] text-muted-foreground">Dá para usar **negrito**, *itálico*, ## título e listas com "- ".</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="dir-responsavel">Responsável</Label>
              <select id="dir-responsavel" value={f.responsavel_id ?? ''} onChange={(e) => mudar('responsavel_id', e.target.value || null)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                <option value="">Sem responsável</option>
                {membros.map((m) => <option key={m.id} value={m.id}>{m.full_name || m.email}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="dir-visibilidade">Quem lê</Label>
              <select id="dir-visibilidade" value={f.visibilidade} onChange={(e) => mudar('visibilidade', e.target.value as VisibilidadeDaDiretriz)}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
                {(Object.keys(ROTULO_DA_VISIBILIDADE) as VisibilidadeDaDiretriz[]).map((v) => (
                  <option key={v} value={v}>{ROTULO_DA_VISIBILIDADE[v]}</option>
                ))}
              </select>
            </div>
          </div>
          {f.visibilidade === 'setores' && (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Setores que também leem</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {outros.map((s) => (
                  <label key={s.setor} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={f.setores_visiveis.includes(s.setor)}
                      onCheckedChange={(v) => mudar('setores_visiveis', v
                        ? [...f.setores_visiveis, s.setor] : f.setores_visiveis.filter((x) => x !== s.setor))} />
                    {rotuloDoSetor(s.setor)}
                  </label>
                ))}
              </div>
              <p className="text-[13px] text-muted-foreground">A Diretoria lê todas as diretrizes, sempre.</p>
            </fieldset>
          )}
          <div className="flex items-center gap-2">
            <Switch id="dir-ciencia" checked={f.exige_ciencia} onCheckedChange={(v) => mudar('exige_ciencia', v)} />
            <Label htmlFor="dir-ciencia">Pedir "Li e estou ciente" a quem lê</Label>
          </div>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold flex items-center gap-1.5"><Paperclip className="w-4 h-4" />Anexos</h4>
            {!id ? (
              <p className="text-[13px] text-muted-foreground">Salve o rascunho para anexar arquivos.</p>
            ) : (
              <>
                {(detalhe?.anexos ?? []).map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-sm">
                    <button type="button" className="text-primary hover:underline text-left flex-1" onClick={() => abrirAnexo(a.caminho)}>{a.nome}</button>
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
                    if (arquivo) anexar.mutate({ diretrizId: id, arquivo }, { onError: (err) => toast.error(mensagemDeErro(err)) });
                  }} />
              </>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
          {!id && <Button variant="outline" disabled={salvar.isPending || !f.titulo.trim()} onClick={() => gravar(false)}>Salvar e anexar arquivos</Button>}
          <Button disabled={salvar.isPending || !f.titulo.trim()} onClick={() => gravar(true)}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Quem já deu ciência da versão atual e quem do setor ainda falta. */
function QuemDeuCiencia({ diretriz, onClose }: { diretriz: Diretriz; onClose: () => void }) {
  const { data: detalhe } = useDetalheDaDiretriz(diretriz.id);
  const { data: membros = [] } = useMembrosDoSetor(diretriz.setor);
  const daVersao = (detalhe?.ciencias ?? []).filter((c) => c.versao === diretriz.versao_atual);
  const deram = new Set(daVersao.map((c) => c.user_id));
  const faltam = membros.filter((m) => !deram.has(m.id));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ciência — {diretriz.titulo}</DialogTitle>
          <DialogDescription>Versão {diretriz.versao_atual}.</DialogDescription>
        </DialogHeader>
        <section className="space-y-1">
          <h4 className="text-sm font-semibold">Deram ciência ({daVersao.length})</h4>
          {daVersao.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém ainda.</p> : daVersao.map((c) => (
            <p key={c.id} className="text-sm">{c.pessoa?.full_name ?? 'Colaborador'} <span className="text-muted-foreground">· {format(new Date(c.ciente_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</span></p>
          ))}
        </section>
        <section className="space-y-1">
          <h4 className="text-sm font-semibold">Faltam, no setor ({faltam.length})</h4>
          {faltam.length === 0 ? <p className="text-sm text-muted-foreground">Ninguém.</p> : faltam.map((m) => (
            <p key={m.id} className="text-sm">{m.full_name || m.email}</p>
          ))}
        </section>
      </DialogContent>
    </Dialog>
  );
}
