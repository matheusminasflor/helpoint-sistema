import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus, ListChecks } from 'lucide-react';
import { SeloDoFarol, AvataresDaEquipe } from '@/components/projetos/SeloDoFarol';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useProjetos, type Projeto } from '@/hooks/useProjetos';
import { todayISO } from '@/lib/dates';

/**
 * Projetos por setor (docs/especificacao-projetos.md). Aparecem os projetos de que a pessoa participa e,
 * para a Diretoria, todos (2026-10-09: só a equipe + Diretoria).
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
        description="Os projetos de que você participa. A Diretoria vê todos."
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
            description="Aparecem os projetos de que você participa. Crie um escrevendo a ideia e chamando os setores."
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
  // O cartão do desenho aprovado (2026-10-07): selo, briefing, barra, "18% · fase 2 de 6", entrega, a equipe
  // em avatares e o dono. Em andamento sem atraso é "No prazo", como no desenho.
  const selo = projeto.selo.tom === 'em_andamento' ? { texto: 'No prazo', tom: 'finalizado' as const } : projeto.selo;
  return (
    <button type="button" onClick={onAbrir}
      className="text-left rounded-xl border border-border bg-card p-4 grid gap-2.5 hover:border-primary/50 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-[15px] font-bold text-foreground leading-tight">{projeto.name}</h3>
        <SeloDoFarol farol={selo.tom} texto={selo.texto} />
      </div>
      {projeto.description && <p className="text-[13px] text-muted-foreground line-clamp-2">{projeto.description}</p>}
      <Progress value={projeto.percentual} className="h-1.5" />
      <div className="flex items-center justify-between gap-2 text-[13px] text-muted-foreground">
        <span>
          <b className="font-mono tabular-nums text-foreground">{projeto.percentual}%</b>
          {projeto.fase ? ` · fase ${projeto.fase.numero} de ${projeto.fase.total}` : projeto.total === 0 ? ' · aguardando os setores' : ''}
        </span>
        {projeto.due_date && (
          <span className={venceu ? 'text-destructive font-medium' : ''}>
            {venceu ? 'Venceu ' : 'Entrega '}<b className="font-mono tabular-nums text-foreground">{projeto.due_date.split('-').reverse().join('/')}</b>
          </span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        <AvataresDaEquipe nomes={projeto.nomesDaEquipe} />
        {projeto.responsavel && <span className="text-[13px] text-muted-foreground">Dono: {projeto.responsavel.split(' ')[0]}</span>}
      </div>
    </button>
  );
}
