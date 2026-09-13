import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, Target, User, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProjetoDialog } from '@/components/projetos/ProjetoDialog';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useProjetos, STATUS_PROJETO, type Projeto, type StatusProjeto } from '@/hooks/useProjetos';
import { todayISO, diaCurto } from '@/lib/dates';


/**
 * Projetos (OKR-2). O projeto é fechado: esta lista mostra os que a pessoa
 * participa — mais todos, para dono e administrador da empresa.
 */
export default function Projetos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: projetos = [], isLoading } = useProjetos();
  const [novo, setNovo] = useState(false);

  const emAndamento = projetos.filter(p => p.status === 'active' || p.status === 'planned');
  const fechados = projetos.filter(p => p.status === 'done' || p.status === 'cancelled');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={FolderKanban}
        title="Projetos"
        description="O trabalho que tem começo, meio e fim — e o quadro de quem está tocando."
        actions={(
          <Button onClick={() => setNovo(true)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Novo projeto
          </Button>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-36 w-full" />
            <Skeleton className="h-36 w-full" />
          </div>
        ) : projetos.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto por aqui"
            description="Projeto é fechado: aparecem os que você participa. Crie um, ou peça a quem responde por um projeto existente para te incluir."
            actionLabel="Novo projeto"
            actionIcon={Plus}
            onAction={() => setNovo(true)}
          />
        ) : (
          <>
            <Secao
              titulo="Em andamento"
              projetos={emAndamento}
              onAbrir={(p) => navigate(tenantPath(`/projetos/${p.id}`))}
            />
            {fechados.length > 0 && (
              <Secao
                titulo="Encerrados"
                projetos={fechados}
                onAbrir={(p) => navigate(tenantPath(`/projetos/${p.id}`))}
              />
            )}
          </>
        )}
      </div>

      <ProjetoDialog open={novo} onOpenChange={setNovo} />
    </div>
  );
}

function Secao({ titulo, projetos, onAbrir }: {
  titulo: string;
  projetos: Projeto[];
  onAbrir: (p: Projeto) => void;
}) {
  if (projetos.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {titulo}
      </h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projetos.map(p => <ProjetoCard key={p.id} projeto={p} onAbrir={() => onAbrir(p)} />)}
      </div>
    </section>
  );
}

function ProjetoCard({ projeto, onAbrir }: { projeto: Projeto; onAbrir: () => void }) {
  const pct = projeto.total === 0 ? 0 : (projeto.feitas / projeto.total) * 100;
  // `todayISO()` e não `toISOString()`: à noite, no Brasil, o segundo já é
  // amanhã, e projeto no prazo apareceria vencido. É a regra 4 das cinco.
  const atrasado = !!projeto.due_date
    && projeto.status === 'active'
    && projeto.due_date < todayISO();

  return (
    <button
      type="button"
      onClick={onAbrir}
      className="text-left rounded-lg border border-border bg-card p-4 space-y-3 hover:border-primary/50 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-foreground leading-tight">{projeto.name}</h3>
        <Badge variant={projeto.status === 'active' ? 'default' : 'secondary'} className="text-[10px] shrink-0">
          {STATUS_PROJETO[projeto.status as StatusProjeto]}
        </Badge>
      </div>

      {projeto.description && (
        <p className="text-[12px] text-muted-foreground line-clamp-2">{projeto.description}</p>
      )}

      {projeto.objetivo && (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Target className="w-3 h-3 shrink-0" aria-hidden="true" />
          <span className="truncate">{projeto.objetivo}</span>
        </p>
      )}

      <div>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
          <span>
            {projeto.total === 0
              ? 'Nenhuma tarefa ainda'
              : `${projeto.feitas} de ${projeto.total} ${projeto.total === 1 ? 'tarefa' : 'tarefas'}`}
          </span>
          {projeto.total > 0 && <span className="tabular-nums">{Math.round(pct)}%</span>}
        </div>
        <Progress value={pct} className="h-1.5" />
      </div>

      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
        {projeto.responsavel && (
          <span className="inline-flex items-center gap-1">
            <User className="w-3 h-3" aria-hidden="true" />
            {projeto.responsavel}
          </span>
        )}
        {projeto.due_date && (
          <span className={`inline-flex items-center gap-1 ${atrasado ? 'text-destructive font-medium' : ''}`}>
            <CalendarDays className="w-3 h-3" aria-hidden="true" />
            {atrasado ? 'Venceu em ' : 'Até '}
            {diaCurto(projeto.due_date)}
          </span>
        )}
      </div>
    </button>
  );
}
