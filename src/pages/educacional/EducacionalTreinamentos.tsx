import { useState } from 'react';
import { GraduationCap, Plus, Clock, Users, CalendarPlus, Pencil, MapPin, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/layout/PageHeader';
import { TreinamentoDialog } from '@/components/educacional/TreinamentoDialog';
import { TurmaDialog } from '@/components/educacional/TurmaDialog';
import { ParticipantesDialog } from '@/components/educacional/ParticipantesDialog';
import {
  useTreinamentos, useTurmas, PUBLICOS, type Treinamento, type Turma,
} from '@/hooks/useTreinamentos';
import { dataHora } from '@/lib/dates';

/**
 * Educacional — treinamentos (L3b).
 *
 * O treinamento é o assunto; a turma é quando ele acontece; a presença se marca
 * por turma. O aluno externo é o cliente do SAC, que já tem cadastro — não há
 * lista de aluno à parte.
 */
export default function EducacionalTreinamentos() {
  const { data: treinamentos = [], isLoading } = useTreinamentos();
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<Treinamento | null>(null);

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={GraduationCap}
        title="Treinamentos"
        description="O que a empresa ensina — para a equipe e para o cliente — e quem já fez."
        actions={(
          <Button onClick={() => setNovo(true)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Novo treinamento
          </Button>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </>
        ) : treinamentos.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Nenhum treinamento cadastrado"
            description="Cadastre o assunto uma vez — 'Aplicação de coloração', 'Integração de novo distribuidor' — e depois abra uma turma para cada vez que ele acontecer."
            actionLabel="Novo treinamento"
            actionIcon={Plus}
            onAction={() => setNovo(true)}
          />
        ) : (
          treinamentos.map(t => (
            <CartaoTreinamento key={t.id} treinamento={t} onEditar={() => setEditando(t)} />
          ))
        )}
      </div>

      {novo && <TreinamentoDialog open onOpenChange={(v) => { if (!v) setNovo(false); }} />}
      {editando && (
        <TreinamentoDialog
          open
          onOpenChange={(v) => { if (!v) setEditando(null); }}
          existente={editando}
        />
      )}
    </div>
  );
}

function CartaoTreinamento({ treinamento, onEditar }: { treinamento: Treinamento; onEditar: () => void }) {
  const { data: turmas = [], isLoading } = useTurmas(treinamento.id);
  const [novaTurma, setNovaTurma] = useState(false);
  const [editandoTurma, setEditandoTurma] = useState<Turma | null>(null);
  const [participantesDe, setParticipantesDe] = useState<Turma | null>(null);

  const publico = PUBLICOS.find(p => p.valor === treinamento.audience)?.rotulo ?? treinamento.audience;

  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-foreground">{treinamento.title}</h3>
            <Badge variant="secondary" className="text-[10px]">{publico}</Badge>
            {treinamento.hours != null && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <Clock className="w-3 h-3" aria-hidden="true" />
                {treinamento.hours}h
              </span>
            )}
          </div>
          {treinamento.description && (
            <p className="text-[12px] text-muted-foreground mt-1">{treinamento.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEditar} aria-label={`Editar ${treinamento.title}`}>
            <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNovaTurma(true)}>
            <CalendarPlus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Nova turma
          </Button>
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : turmas.length === 0 ? (
        <p className="text-[12px] text-muted-foreground">
          Nenhuma turma marcada. Abra uma para poder inscrever gente.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {turmas.map(turma => (
            <li key={turma.id} className="px-3 py-2 flex items-center gap-2 flex-wrap">
              <div className="flex-1 min-w-[12rem]">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[13px] text-foreground">{dataHora(turma.starts_at)}</span>
                  {turma.status !== 'agendada' && (
                    <Badge
                      variant={turma.status === 'cancelada' ? 'destructive' : 'default'}
                      className="text-[10px]"
                    >
                      {turma.status === 'cancelada' ? 'cancelada' : 'realizada'}
                    </Badge>
                  )}
                  {turma.capacity != null && (
                    <span className="text-[11px] text-muted-foreground">{turma.capacity} vagas</span>
                  )}
                </div>
                {turma.location && (
                  <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                    {turma.modality === 'online'
                      ? <Video className="w-3 h-3" aria-hidden="true" />
                      : <MapPin className="w-3 h-3" aria-hidden="true" />}
                    {turma.location}
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setParticipantesDe(turma)}>
                <Users className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                Participantes
              </Button>
              <Button
                variant="ghost" size="sm"
                onClick={() => setEditandoTurma(turma)}
                aria-label="Editar turma"
              >
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {novaTurma && (
        <TurmaDialog
          open
          onOpenChange={(v) => { if (!v) setNovaTurma(false); }}
          treinamentoId={treinamento.id}
        />
      )}
      {editandoTurma && (
        <TurmaDialog
          open
          onOpenChange={(v) => { if (!v) setEditandoTurma(null); }}
          treinamentoId={treinamento.id}
          existente={editandoTurma}
        />
      )}
      {participantesDe && (
        <ParticipantesDialog
          open
          onOpenChange={(v) => { if (!v) setParticipantesDe(null); }}
          turma={participantesDe}
          audience={treinamento.audience}
        />
      )}
    </div>
  );
}
