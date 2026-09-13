import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DndContext, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { FolderKanban, Plus, Pencil, Trash2, Target, UserPlus, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjetoDialog } from '@/components/projetos/ProjetoDialog';
import { TarefaDialog } from '@/components/projetos/TarefaDialog';
import { ParticipantesDialog } from '@/components/projetos/ParticipantesDialog';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useAuth } from '@/contexts/AuthContext';
import {
  useProjeto, useTarefasDoProjeto, useParticipantes, useNomesDasTarefas, useMoverTarefa, useApagarProjeto,
  COLUNAS, STATUS_PROJETO,
  type TarefaRow, type StatusTarefa, type StatusProjeto,
} from '@/hooks/useProjetos';

import { todayISO, diaCurto } from '@/lib/dates';
import { getInitials } from '@/lib/utils';

/**
 * O quadro do projeto (OKR-2). As colunas são os quatro estados que a tarefa
 * já tinha no sistema — arrastar um cartão é mudar o estado dele, e não há um
 * segundo lugar guardando "em que coluna está" para se contradizer com o
 * primeiro.
 */
export default function ProjetoQuadro() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user, role } = useAuth();

  const { data: projeto, isLoading } = useProjeto(id);
  const { data: tarefas = [] } = useTarefasDoProjeto(id);
  const { data: participantes = [] } = useParticipantes(id);
  const { data: nomes = {} } = useNomesDasTarefas(tarefas);
  const mover = useMoverTarefa(id ?? '');
  const apagar = useApagarProjeto();

  const [editando, setEditando] = useState(false);
  const [apagando, setApagando] = useState(false);
  const [gente, setGente] = useState(false);
  const [tarefa, setTarefa] = useState<{ edicao?: TarefaRow; status?: StatusTarefa } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const mandaNoProjeto = !!projeto
    && (projeto.owner_id === user?.id || role === 'owner' || role === 'admin');

  function aoSoltar(event: DragEndEvent) {
    const novoStatus = event.over?.id as StatusTarefa | undefined;
    if (!novoStatus) return;
    const cartao = tarefas.find(t => t.id === event.active.id);
    if (!cartao || cartao.status === novoStatus) return;
    // No fim da coluna de destino. `position` é numérico justamente para o
    // cartão caber entre dois outros sem renumerar a coluna inteira.
    const ultimos = tarefas.filter(t => t.status === novoStatus).map(t => Number(t.position));
    const position = ultimos.length ? Math.max(...ultimos) + 1 : 1;
    mover.mutate({ id: cartao.id, status: novoStatus, position });
  }

  if (isLoading) {
    return <div className="p-6 space-y-3"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>;
  }
  if (!projeto) {
    return (
      <div className="p-6">
        <PageHeader
          icon={FolderKanban}
          title="Projeto não encontrado"
          description="Ou ele não existe mais, ou você não participa dele. Projeto é fechado: peça a quem responde por ele para te incluir."
          onBack={() => navigate(tenantPath('/projetos'))}
        />
      </div>
    );
  }

  const atrasado = !!projeto.due_date && projeto.status === 'active' && projeto.due_date < todayISO();

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={FolderKanban}
        title={projeto.name}
        description={projeto.description ?? undefined}
        onBack={() => navigate(tenantPath('/projetos'))}
        status={<Badge variant={projeto.status === 'active' ? 'default' : 'secondary'} className="text-[10px]">
          {STATUS_PROJETO[projeto.status as StatusProjeto]}
        </Badge>}
        actions={(
          <>
            <Button variant="outline" size="sm" onClick={() => setGente(true)}>
              <UserPlus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {participantes.length} {participantes.length === 1 ? 'pessoa' : 'pessoas'}
            </Button>
            {mandaNoProjeto && (
              <>
                <Button variant="ghost" size="icon" className="h-9 w-9"
                  aria-label="Editar o projeto" onClick={() => setEditando(true)}>
                  <Pencil className="w-4 h-4" aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" className="h-9 w-9"
                  aria-label="Remover o projeto" onClick={() => setApagando(true)}>
                  <Trash2 className="w-4 h-4" aria-hidden="true" />
                </Button>
              </>
            )}
          </>
        )}
      >
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground flex-wrap">
          {projeto.due_date && (
            <span className={`inline-flex items-center gap-1 ${atrasado ? 'text-destructive font-medium' : ''}`}>
              <CalendarDays className="w-3.5 h-3.5" aria-hidden="true" />
              {atrasado ? 'Venceu em ' : 'Prazo: '}{diaCurto(projeto.due_date)}
            </span>
          )}
          {projeto.goal_id && (
            <span className="inline-flex items-center gap-1">
              <Target className="w-3.5 h-3.5" aria-hidden="true" />
              Serve a um objetivo das Metas
            </span>
          )}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 lg:p-6">
        <DndContext sensors={sensors} onDragEnd={aoSoltar}>
          <div className="flex gap-4 h-full min-w-max">
            {COLUNAS.map(col => (
              <Coluna
                key={col.status}
                status={col.status}
                titulo={col.titulo}
                tarefas={tarefas.filter(t => t.status === col.status)}
                nomes={nomes}
                onNova={() => setTarefa({ status: col.status })}
                onAbrir={(t) => setTarefa({ edicao: t })}
              />
            ))}
          </div>
        </DndContext>
      </div>

      <ProjetoDialog open={editando} onOpenChange={setEditando} edicao={projeto} />
      <ParticipantesDialog
        open={gente}
        onOpenChange={setGente}
        projectId={projeto.id}
        podeMexer={mandaNoProjeto}
      />
      <TarefaDialog
        open={tarefa !== null}
        onOpenChange={(v) => !v && setTarefa(null)}
        projectId={projeto.id}
        edicao={tarefa?.edicao}
        statusInicial={tarefa?.status}
        participantes={participantes}
      />

      <AlertDialog open={apagando} onOpenChange={setApagando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{projeto.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              As tarefas que ninguém pegou somem junto com o projeto. As que já têm responsável
              voltam a ser tarefa pessoal de quem as estava tocando, e continuam na lista dessa
              pessoa. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => {
              apagar.mutate(projeto.id, { onSuccess: () => navigate(tenantPath('/projetos')) });
            }}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Coluna({ status, titulo, tarefas, nomes, onNova, onAbrir }: {
  status: StatusTarefa;
  titulo: string;
  tarefas: TarefaRow[];
  nomes: Record<string, string>;
  onNova: () => void;
  onAbrir: (t: TarefaRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div className="flex flex-col w-72 shrink-0 h-full">
      <div className="flex items-baseline justify-between px-1 pb-2">
        <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
        <span className="text-xs text-muted-foreground">{tarefas.length}</span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto space-y-2 rounded-lg p-2 min-h-[120px] transition-colors ${
          isOver ? 'bg-primary/5 ring-1 ring-primary/30' : 'bg-muted/40'
        }`}
      >
        {tarefas.map(t => (
          <Cartao key={t.id} tarefa={t} nomes={nomes} onAbrir={() => onAbrir(t)} />
        ))}
        <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={onNova}>
          <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
          Nova tarefa
        </Button>
      </div>
    </div>
  );
}

function Cartao({ tarefa, nomes, onAbrir }: {
  tarefa: TarefaRow;
  nomes: Record<string, string>;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: tarefa.id });
  // Pelo nome de quem realmente responde pela tarefa, e não pela lista de
  // participantes: quem saiu do projeto, ou chegou junto com um chamado,
  // aparecia como "sem dono" — que é coisa diferente de não ter dono.
  const dono = tarefa.user_id ? nomes[tarefa.user_id] : undefined;
  const atrasada = !!tarefa.due_date
    && tarefa.status !== 'completed'
    && tarefa.due_date.slice(0, 10) < todayISO();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => !isDragging && onAbrir()}
      className="rounded-lg border border-border bg-card p-3 space-y-2 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
      style={{ opacity: isDragging ? 0.4 : 1 }}
    >
      <p className="text-sm leading-tight text-foreground">{tarefa.title}</p>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {tarefa.due_date && (
            <span className={atrasada ? 'text-destructive font-medium' : ''}>
              {diaCurto(tarefa.due_date.slice(0, 10))}
            </span>
          )}
          {tarefa.ticket_id && <span title="Nasceu de um chamado">· de um chamado</span>}
        </div>
        {dono ? (
          <Avatar className="h-5 w-5" title={dono}>
            <AvatarFallback className="text-[10px]">{getInitials(dono)}</AvatarFallback>
          </Avatar>
        ) : (
          <span className="text-[10px] text-muted-foreground">sem dono</span>
        )}
      </div>
    </div>
  );
}

