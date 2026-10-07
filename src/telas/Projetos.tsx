import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, User, CalendarDays, ListChecks, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useProjetos, type Projeto } from '@/hooks/useProjetos';
import { todayISO, diaCurto } from '@/lib/dates';

/**
 * Projetos por setor (docs/especificacao-projetos.md). Aparecem os projetos de que a pessoa participa,
 * os dos setores que ela gere ou referencia, e todos para a Diretoria e o dono da empresa.
 */
export default function Projetos() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { data: projetos = [], isLoading } = useProjetos();
  const novo = () => navigate(tenantPath('/projetos/novo'));
  const abrir = (p: Projeto) => navigate(tenantPath(`/projetos/${p.id}`));

  const emAndamento = projetos.filter((p) => p.status === 'active' || p.status === 'planned');
  const fechados = projetos.filter((p) => p.status === 'done' || p.status === 'cancelled');

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={FolderKanban}
        title="Projetos"
        description="Quem cria escreve o briefing e chama os setores; cada setor planeja a sua parte."
        actions={(
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => navigate(tenantPath('/projetos/minhas'))}>
              <ListChecks className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Minhas tarefas
            </Button>
            <Button onClick={novo}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Novo projeto
            </Button>
          </div>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : projetos.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Nenhum projeto por aqui"
            description="Aparecem os projetos de que você participa e os que chamaram o seu setor. Crie um escrevendo a ideia e marcando os setores."
            actionLabel="Novo projeto"
            actionIcon={Plus}
            onAction={novo}
          />
        ) : (
          <>
            <Secao titulo="Em andamento" projetos={emAndamento} onAbrir={abrir} />
            <Secao titulo="Encerrados" projetos={fechados} onAbrir={abrir} />
          </>
        )}
      </div>
    </div>
  );
}

function Secao({ titulo, projetos, onAbrir }: { titulo: string; projetos: Projeto[]; onAbrir: (p: Projeto) => void }) {
  if (projetos.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo}</h2>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {projetos.map((p) => <ProjetoCard key={p.id} projeto={p} onAbrir={() => onAbrir(p)} />)}
      </div>
    </section>
  );
}

function ProjetoCard({ projeto, onAbrir }: { projeto: Projeto; onAbrir: () => void }) {
  // `todayISO()` e não `toISOString()` (regra 4): à noite, no Brasil, o segundo já é amanhã.
  const venceu = !!projeto.due_date && projeto.status === 'active' && projeto.due_date < todayISO();
  return (
    <button type="button" onClick={onAbrir}
      className="text-left rounded-lg border border-border bg-card p-4 space-y-3 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-foreground leading-tight">{projeto.name}</h3>
        {projeto.atrasadas > 0 ? (
          <span className="badge-danger rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap">
            {projeto.atrasadas} {projeto.atrasadas === 1 ? 'atrasada' : 'atrasadas'}
          </span>
        ) : projeto.total > 0 ? (
          <span className="badge-success rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap">No prazo</span>
        ) : (
          <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[12px] font-semibold whitespace-nowrap">Aguardando planos</span>
        )}
      </div>
      {projeto.description && <p className="text-[13px] text-muted-foreground line-clamp-2">{projeto.description}</p>}
      <div>
        <div className="flex items-center justify-between text-[12px] text-muted-foreground mb-1">
          <span>{projeto.total === 0 ? 'Nenhuma atividade ainda' : `${projeto.total} ${projeto.total === 1 ? 'atividade' : 'atividades'}`}</span>
          <span className="tabular-nums font-semibold text-foreground">{projeto.percentual}%</span>
        </div>
        <Progress value={projeto.percentual} className="h-1.5" />
      </div>
      <div className="flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
        {projeto.responsavel && <span className="inline-flex items-center gap-1"><User className="w-3 h-3" aria-hidden="true" />{projeto.responsavel}</span>}
        <span className="inline-flex items-center gap-1"><Users className="w-3 h-3" aria-hidden="true" />{projeto.equipe} na equipe</span>
        {projeto.due_date && (
          <span className={`inline-flex items-center gap-1 ${venceu ? 'text-destructive font-medium' : ''}`}>
            <CalendarDays className="w-3 h-3" aria-hidden="true" />{venceu ? 'Venceu em ' : 'Entrega '}{diaCurto(projeto.due_date)}
          </span>
        )}
      </div>
    </button>
  );
}
