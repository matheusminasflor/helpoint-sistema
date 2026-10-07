// A atividade aberta: os campos da planilha, o andamento (o responsável muda o %; o banco acende o farol),
// as atualizações com @menção, os anexos e o histórico (comentários de sistema escritos pelo banco).
import { useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rotuloDoSetor } from '@/lib/setores';
import { diaCurto, todayISO, dataHora } from '@/lib/dates';
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
  dependeDe: AtividadeRow | null;
  faseNome: string | null;
  podePlanejar: boolean;
  podeEditarProjeto: boolean;
  onEditar: () => void;
}

const PASSOS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

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
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-left">{atividade.numero ? `${atividade.numero} · ` : ''}{atividade.title}</SheetTitle>
          <SheetDescription className="text-left">{faseNome ? `Fase: ${faseNome}` : 'Sem fase'} · {rotuloDoSetor(atividade.setor)}</SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-5 text-[14px]">
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

          <dl className="grid grid-cols-2 gap-3">
            <Campo rotulo="Responsável">{atividade.user_id ? nomes[atividade.user_id] ?? '—' : 'Sem responsável'}</Campo>
            <Campo rotulo="Período">{atividade.inicio ? diaCurto(atividade.inicio) : '—'} → {atividade.termino ? diaCurto(atividade.termino) : '—'}</Campo>
            <Campo rotulo="Depende de">{dependeDe ? dependeDe.title : 'Nenhuma'}</Campo>
            <Campo rotulo="Fator externo">{atividade.fator_externo ?? 'Nenhum'}</Campo>
          </dl>
          {atividade.description && <p className="whitespace-pre-wrap text-muted-foreground">{atividade.description}</p>}
          {atividade.link && (
            <a href={atividade.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline break-all">
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />{atividade.link}
            </a>
          )}

          <div className="space-y-1.5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">% concluído</p>
            {podeAndamento ? (
              <Select value={String(atividade.percentual)} onValueChange={(v) => andamento.mutate({ id: atividade.id, percentual: Number(v) })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>{PASSOS.map((p) => <SelectItem key={p} value={String(p)}>{p}%{p === 100 ? ' · finalizar' : ''}</SelectItem>)}</SelectContent>
              </Select>
            ) : (
              <p className="font-mono tabular-nums">{atividade.percentual}%</p>
            )}
          </div>

          <section className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Atualizações e histórico</h3>
            <ul className="space-y-2">
              {comentarios.map((c) => (
                <li key={c.id} className={`border-l-2 pl-3 ${c.sistema ? 'border-border text-muted-foreground' : 'border-primary/40'}`}>
                  <p className="text-[12px] font-semibold">{c.sistema ? 'Histórico' : c.autor} · {dataHora(c.created_at)}</p>
                  <p className="text-[13px] whitespace-pre-wrap">{c.texto}</p>
                </li>
              ))}
              {comentarios.length === 0 && <li className="text-[13px] text-muted-foreground">Nada ainda.</li>}
            </ul>
            <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva uma atualização; use @ para chamar alguém…" aria-label="Nova atualização" />
            <div className="flex flex-wrap gap-2">
              {/* Escolher na lista insere "@Nome Completo " — é o formato que `extraiMencoes` reconhece. */}
              <Select value="" onValueChange={(nome) => setTexto((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@${nome} `)}>
                <SelectTrigger className="h-8 w-48 text-[13px]" aria-label="Chamar alguém"><SelectValue placeholder="@ Chamar alguém" /></SelectTrigger>
                <SelectContent>{pessoas.map((p) => <SelectItem key={p.id} value={p.nome}>{p.nome}</SelectItem>)}</SelectContent>
              </Select>
              <Button size="sm" disabled={!texto.trim() || comentar.isPending}
                onClick={async () => { await comentar.mutateAsync({ texto, mencionados: extraiMencoes(texto, pessoas) }); setTexto(''); }}>
                Enviar atualização
              </Button>
            </div>
            <p className="text-[12px] text-muted-foreground">Quem você chamar recebe um aviso — se já enxerga o projeto (pela equipe ou pelo setor).</p>
          </section>

          <section className="space-y-2">
            <h3 className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Anexos</h3>
            <AnexosDoProjeto projectId={projectId} taskId={atividade.id} podeApagarTodos={podeEditarProjeto} />
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
