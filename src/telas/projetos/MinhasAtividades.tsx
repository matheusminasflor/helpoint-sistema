// Minhas tarefas de projeto: o que está comigo em todos os projetos, e — para quem gere um setor — as
// atividades do setor ainda sem responsável. As mesmas linhas aparecem na Home ("Comece por"), porque
// atividade de projeto é uma linha de `tasks` com prazo (docs/plano-projetos.md, decisão 1).
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SeloDoFarol } from '@/components/projetos/SeloDoFarol';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMinhasAtividades, type MinhaAtividade } from '@/hooks/useProjetos';
import { SETORES, rotuloDoSetor } from '@/lib/setores';
import { diaCurto, todayISO } from '@/lib/dates';
import { farolDaAtividade } from '@/lib/projetos';

export default function MinhasAtividades() {
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const { user } = useAuth();
  const { pode, isLoading: carregandoPerfil } = useConfiguracaoDosSetores();
  // Gestor do setor = a caixinha "Transferir" do perfil — a mesma pergunta de `gestor_do_setor` no banco.
  const setoresQueGiro = useMemo(
    () => SETORES.map((s) => s.value).filter((s) => pode(s, 'tickets', 'transfer')),
    [pode],
  );
  const { data: atividades = [], isLoading } = useMinhasAtividades(carregandoPerfil ? [] : setoresQueGiro);
  const hoje = todayISO();
  const ordenadas = [...atividades].sort((a, b) => (a.termino ?? '9999').localeCompare(b.termino ?? '9999'));
  const minhas = ordenadas.filter((a) => a.user_id === user?.id);
  const semDono = ordenadas.filter((a) => !a.user_id);
  const abrir = (a: MinhaAtividade) => navigate(tenantPath(`/projetos/${a.project_id}`));

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={ListChecks} title="Minhas tarefas de projeto" description="O que está com você em todos os projetos, do prazo mais curto ao mais longo."
        onBack={() => navigate(tenantPath('/projetos'))} />
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-6">
        {isLoading ? <Skeleton className="h-40 w-full" /> : minhas.length + semDono.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nada pendente" description="Nenhuma atividade de projeto em aberto com você." />
        ) : (
          <>
            <Lista titulo="Comigo" linhas={minhas} hoje={hoje} onAbrir={abrir} />
            <Lista titulo="Do meu setor, sem responsável" linhas={semDono} hoje={hoje} onAbrir={abrir} />
          </>
        )}
      </div>
    </div>
  );
}

function Lista({ titulo, linhas, hoje, onAbrir }: { titulo: string; linhas: MinhaAtividade[]; hoje: string; onAbrir: (a: MinhaAtividade) => void }) {
  if (linhas.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">{titulo} · {linhas.length}</h2>
      {/* A linha do desenho aprovado (tela 7): a atividade, o projeto e o fator externo embaixo; à direita o
          prazo ("venceu 05/10" em vermelho, "24/11 → 28/11", "sem data") e o farol. */}
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        {linhas.map((a) => {
          const farol = farolDaAtividade(a, hoje);
          return (
            <button key={a.id} type="button" onClick={() => onAbrir(a)}
              className="grid w-full gap-2 px-4 py-3 text-left text-[14px] hover:bg-primary/5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
              <span className="min-w-0">
                <b className="block truncate">{a.title}</b>
                <span className="block truncate text-[13px] text-muted-foreground">
                  {a.projeto} · {rotuloDoSetor(a.setor)} · {a.percentual}%{a.fator_externo && a.status !== 'completed' ? ` · ⚑ ${a.fator_externo}` : ''}
                </span>
              </span>
              <span className={`font-mono text-[13px] tabular-nums ${farol === 'atrasado' ? 'text-destructive' : ''}`}>
                {farol === 'atrasado' && a.termino ? `venceu ${diaCurto(a.termino)}`
                  : a.inicio && a.termino ? `${diaCurto(a.inicio)} → ${diaCurto(a.termino)}`
                  : a.termino ? `até ${diaCurto(a.termino)}` : 'sem data'}
              </span>
              <span><SeloDoFarol farol={farol} /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
