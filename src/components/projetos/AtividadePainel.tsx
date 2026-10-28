// A tarefa aberta. Nomes do dia a dia e situação em três botões (dono, 2026-10-13: "está muito técnico"):
// A fazer / Fazendo / Pronto no topo, um clique; à esquerda o que é preciso saber (quem faz, até quando,
// detalhes) e o que trava (só depois de…, esperando algo de fora); à direita as atualizações com @menção, o
// histórico (comentários de sistema escritos pelo banco) e os anexos. Quem faz muda a situação; o banco
// marca "Atrasada" sozinho.
import { useState } from 'react';
import { ExternalLink, Pencil, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { rotuloDoSetor } from '@/lib/setores';
import { todayISO, dataHora } from '@/lib/dates';
import { SITUACOES, andamentoDaSituacao, farolDaAtividade, situacaoDaTarefa } from '@/lib/projetos';
import { useAuth } from '@/contexts/AuthContext';
import { extraiMencoes } from '@/lib/chat';
import { useAtividades, useComentarios, usePessoasDaEmpresa, type AtividadeRow } from '@/hooks/useProjetos';
import { SeloDoFarol } from '@/components/projetos/SeloDoFarol';
import { AnexosDoProjeto } from '@/components/projetos/AnexosDoProjeto';
import { cn } from '@/lib/utils';

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

const data = (d: string | null) => (d ? d.split('-').reverse().join('/') : null);

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
  const situacao = situacaoDaTarefa(atividade);
  const farol = farolDaAtividade(atividade, todayISO());

  return (
    <Sheet open={!!atividade} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent className="w-full sm:max-w-4xl overflow-y-auto">
        <SheetHeader className="pr-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-left text-[18px]">{atividade.title}</SheetTitle>
              <SheetDescription className="text-left">
                {faseNome ? `Etapa: ${faseNome}` : 'Sem etapa'} · {rotuloDoSetor(atividade.setor)}
              </SheetDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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

        {/* A situação: três botões, um clique (dono, 2026-10-13). */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {podeAndamento ? (
            <div className="inline-flex rounded-lg border border-border p-0.5" role="radiogroup" aria-label="Situação da tarefa">
              {SITUACOES.map((s) => (
                <button key={s.valor} type="button" role="radio" aria-checked={situacao === s.valor}
                  disabled={andamento.isPending}
                  onClick={() => situacao !== s.valor && andamento.mutate({ id: atividade.id, ...andamentoDaSituacao(s.valor, atividade.percentual) })}
                  className={cn('rounded-md px-3 py-1.5 text-[14px] font-medium transition-colors',
                    situacao === s.valor
                      ? s.valor === 'pronto' ? 'bg-status-success text-primary-foreground' : 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted')}>
                  {s.rotulo}
                </button>
              ))}
            </div>
          ) : <SeloDoFarol farol={farol} />}
          {farol === 'atrasado' && <SeloDoFarol farol="atrasado" texto="Passou do prazo" />}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] text-[14px]">
          <div className="grid gap-4 content-start">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Info rotulo="Quem faz">{atividade.user_id ? nomes[atividade.user_id] ?? '—' : <span className="text-muted-foreground">Ninguém ainda (o gestor do setor distribui)</span>}</Info>
              <Info rotulo="Até quando">
                {data(atividade.termino)
                  ? <span className={farol === 'atrasado' ? 'font-semibold text-destructive' : ''}>{data(atividade.termino)}</span>
                  : <span className="text-muted-foreground">Sem prazo</span>}
              </Info>
              {atividade.inicio && <Info rotulo="Começa em">{data(atividade.inicio)}</Info>}
              {dependeDe && <Info rotulo="Só começa depois de">{dependeDe.title}</Info>}
            </dl>
            {atividade.fator_externo && (
              <div className="rounded-lg border border-status-warning/50 badge-warning px-3 py-2">
                <span className="font-semibold">Esperando algo de fora:</span> {atividade.fator_externo}
              </div>
            )}
            {atividade.description && (
              <div className="grid gap-1">
                <span className="text-[13px] font-semibold text-muted-foreground">Detalhes</span>
                <p className="whitespace-pre-wrap">{atividade.description}</p>
              </div>
            )}
            {atividade.link && (
              <a href={atividade.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline break-all">
                <ExternalLink className="w-4 h-4 shrink-0" />Abrir o arquivo da tarefa
              </a>
            )}
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

function Info({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-[13px] font-semibold text-muted-foreground">{rotulo}</dt>
      <dd>{children}</dd>
    </div>
  );
}
