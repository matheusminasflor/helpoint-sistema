// A atividade aberta, no desenho aprovado (tela 6): os campos da planilha em caixas à esquerda — com o
// fator externo em destaque e o % numa barra — e, à direita, as atualizações com @menção, o histórico
// (comentários de sistema escritos pelo banco) e os anexos. O responsável muda o %; o banco acende o farol.
import { useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO, dataHora } from '@/lib/dates';
import { farolDaAtividade } from '@/lib/projetos';
import { useAuth } from '@/contexts/AuthContext';
import { extraiMencoes } from '@/lib/chat';
import { useAtividades, useComentarios, usePessoasDaEmpresa, type AtividadeRow } from '@/hooks/useProjetos';
import { SeloDoFarol } from '@/components/projetos/SeloDoFarol';
import { AnexosDoProjeto } from '@/components/projetos/AnexosDoProjeto';

interface Props {
  atividade: (AtividadeRow & { numero?: string }) | null;
  onFechar: () => void;
  nomes: Record<string, string>;
  dependeDe: (AtividadeRow & { numero?: string }) | null;
  faseNome: string | null;
  podePlanejar: boolean;
  podeEditarProjeto: boolean;
  onEditar: () => void;
}

const PASSOS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export function AtividadePainel({ atividade, onFechar, nomes, dependeDe, faseNome, podePlanejar, podeEditarProjeto, onEditar }: Props) {
  const { user } = useAuth();
  const projectId = atividade?.project_id ?? '';
  const { andamento, apagar } = useAtividades(projectId);
  const { lista, comentar } = useComentarios(atividade?.id);
  const { data: pessoas = [] } = usePessoasDaEmpresa();
  const [texto, setTexto] = useState('');
  if (!atividade) return null;
  const responsavel = atividade.user_id === user?.id;
  const podeAndamento = podePlanejar || responsavel;
  const comentarios = lista.data ?? [];

  return (
    <Sheet open={!!atividade} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-left text-[18px]">{atividade.numero ? `${atividade.numero} · ` : ''}{atividade.title}</SheetTitle>
              <SheetDescription className="text-left">{faseNome ? `Fase › ${faseNome}` : 'Sem fase'}</SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <SeloDoFarol farol={farolDaAtividade(atividade, todayISO())} />
              {podePlanejar && (
                <Button size="sm" variant="outline" onClick={onEditar}><Pencil className="w-3.5 h-3.5 mr-1.5" />Editar</Button>
              )}
              {podePlanejar && (
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => { await apagar.mutateAsync(atividade.id); onFechar(); }}>
                  <Trash2 className="w-3.5 h-3.5 mr-1.5" />Apagar
                </Button>
              )}
            </div>
          </div>
        </SheetHeader>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] text-[14px]">
          <div className="grid gap-3.5 content-start">
            <Campo rotulo="Atividade">{atividade.description || atividade.title}</Campo>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Setor responsável">{rotuloDoSetor(atividade.setor)}</Campo>
              <Campo rotulo="Pessoa responsável">{atividade.user_id ? nomes[atividade.user_id] ?? '—' : 'Sem responsável (o gestor do setor distribui)'}</Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Início" mono>{data(atividade.inicio)}</Campo>
              <Campo rotulo="Término" mono>{data(atividade.termino)}</Campo>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Depende de">{dependeDe ? `${dependeDe.numero ? `${dependeDe.numero} · ` : ''}${dependeDe.title}` : '— (não depende de outra)'}</Campo>
              <div className="grid gap-1">
                <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">% concluído</span>
                <div className="rounded-lg border border-border px-2.5 py-2 grid gap-1.5">
                  <Progress value={atividade.percentual} className="h-1.5" />
                  {podeAndamento ? (
                    <Select value={String(atividade.percentual)} onValueChange={(v) => andamento.mutate({ id: atividade.id, percentual: Number(v) })}>
                      <SelectTrigger className="h-7 w-32 text-[13px]" aria-label="% concluído"><SelectValue /></SelectTrigger>
                      <SelectContent>{PASSOS.map((p) => <SelectItem key={p} value={String(p)}>{p}%{p === 100 ? ' · finalizar' : ''}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : (
                    <span className="font-mono text-[13px] tabular-nums">{atividade.percentual}%</span>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-1">
              <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Fator externo</span>
              {atividade.fator_externo ? (
                <div className="rounded-lg border border-status-warning/50 badge-warning px-2.5 py-2">⚑ {atividade.fator_externo}</div>
              ) : (
                <div className="rounded-lg border border-border px-2.5 py-2 text-muted-foreground">Nenhum</div>
              )}
            </div>
            <Campo rotulo="Link de acesso">
              {atividade.link ? (
                <a href={atividade.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />{atividade.link}
                </a>
              ) : <span className="text-muted-foreground">—</span>}
            </Campo>
          </div>

          <aside className="rounded-xl border border-border p-4 grid gap-3 content-start">
            <h3 className="text-[14px] font-bold">Atualizações</h3>
            <ul className="grid gap-2.5">
              {comentarios.map((c) => (
                <li key={c.id} className={`border-l-[3px] pl-2.5 ${c.sistema ? 'border-border text-muted-foreground' : 'border-primary/50'}`}>
                  <p className="text-[12px] font-bold">{c.sistema ? 'Sistema' : c.autor} · {dataHora(c.created_at)}</p>
                  <p className="text-[13px] whitespace-pre-wrap">{c.texto}</p>
                </li>
              ))}
              {comentarios.length === 0 && <li className="text-[13px] text-muted-foreground">Nada ainda.</li>}
            </ul>
            <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma atualização, use @ para chamar alguém…" aria-label="Nova atualização" />
            <div className="flex flex-wrap gap-2">
              {/* Escolher na lista insere "@Nome Completo " — é o formato que `extraiMencoes` reconhece. */}
              <Select value="" onValueChange={(nome) => setTexto((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${nome} `)}>
                <SelectTrigger className="h-8 w-40 text-[13px]" aria-label="Chamar alguém"><SelectValue placeholder="@ Chamar alguém" /></SelectTrigger>
                <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" disabled={!texto.trim() || comentar.isPending}
                onClick={async () => { await comentar.mutateAsync({ texto, mencionados: extraiMencoes(texto, pessoas) }); setTexto(''); }}>
                Enviar
              </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">Quem você chamar recebe um aviso, se estiver na equipe do projeto.</p>
            <h3 className="text-[14px] font-bold pt-1">Anexos</h3>
            <AnexosDoProjeto projectId={projectId} taskId={atividade.id} podeApagarTodos={podeEditarProjeto} />
          </aside>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Campo({ rotulo, mono, children }: { rotulo: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">{rotulo}</span>
      <div className={`rounded-lg border border-border px-2.5 py-2 whitespace-pre-wrap ${mono ? 'font-mono tabular-nums' : ''}`}>{children}</div>
    </div>
  );
}
