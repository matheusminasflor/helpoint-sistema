// Minhas tarefas de projeto: o que está comigo em todos os projetos, e — para quem gere um setor — as
// atividades do setor ainda sem responsável. As mesmas linhas aparecem na Home ("Comece por"), porque
// atividade de projeto é uma linha de `tasks` com prazo (docs/plano-projetos.md, decisão 1).
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { SeloDoFarol } from '@/components/projetos/SeloDoFarol';
import { useTenantPath } from '@/hooks/useTenantPath';
import { useAuth } from '@/contexts/AuthContext';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useMinhasAtividades, useProntoNaLista, type MinhaAtividade } from '@/hooks/useProjetos';
import { SETORES, rotuloDoSetor } from '@/lib/setores';
import { diaCurto, todayISO } from '@/lib/dates';
import { andamentoDaSituacao, farolDaAtividade, situacaoDaTarefa } from '@/lib/projetos';
import { mensagemDeErro } from '@/lib/supabase-result';
import { cn } from '@/lib/utils';

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
  const pronto = useProntoNaLista();
  // As marcadas nesta visita: ficam azuis e riscadas até sair da tela (o To-Do da DashStack).
  const [feitas, setFeitas] = useState<ReadonlySet<string>>(new Set());
  const hoje = todayISO();
  const ordenadas = [...atividades].sort((a, b) => (a.termino ?? '9999').localeCompare(b.termino ?? '9999'));
  const minhas = ordenadas.filter((a) => a.user_id === user?.id);
  const semDono = ordenadas.filter((a) => !a.user_id);
  // Abre a própria tarefa no projeto (dono, 2026-10-29), não o quadro inteiro para procurar.
  const abrir = (a: MinhaAtividade) => navigate(tenantPath(`/projetos/${a.project_id}?tarefa=${a.id}`));

  const marcar = (id: string, feita: boolean) =>
    setFeitas((s) => { const n = new Set(s); if (feita) n.add(id); else n.delete(id); return n; });
  const falhou = (e: unknown) => toast.error(mensagemDeErro(e));
  // Desfazer volta para a situação de antes (A fazer ou Fazendo, com o mesmo %), a mesma conta do painel.
  const desfazer = (a: MinhaAtividade) =>
    pronto.mutate({ id: a.id, ...andamentoDaSituacao(situacaoDaTarefa(a), a.percentual) }, {
      onSuccess: () => marcar(a.id, false), onError: falhou,
    });
  const concluir = (a: MinhaAtividade) => {
    if (feitas.has(a.id)) return desfazer(a);
    marcar(a.id, true);
    pronto.mutate({ id: a.id, ...andamentoDaSituacao('pronto', a.percentual) }, {
      onSuccess: () => toast.success(`"${a.title}" marcada como pronta.`, { action: { label: 'Desfazer', onClick: () => desfazer(a) } }),
      onError: (e) => { marcar(a.id, false); falhou(e); },
    });
  };

  return (
    <div className="flex flex-col h-full">
      <PageHeader icon={ListChecks} title="Minhas tarefas de projeto" description="O que está com você em todos os projetos, do prazo mais curto ao mais longo. Marque a caixinha quando terminar."
        onBack={() => navigate(tenantPath('/projetos'))} />
      <div className="flex-1 overflow-y-auto px-4 lg:px-8 pb-6 space-y-8">
        {isLoading ? <Skeleton className="h-40 w-full" /> : minhas.length + semDono.length === 0 ? (
          <EmptyState icon={ListChecks} title="Nada pendente" description="Nenhuma atividade de projeto em aberto com você." />
        ) : (
          <>
            <Lista titulo="Comigo" linhas={minhas} hoje={hoje} onAbrir={abrir} feitas={feitas} onConcluir={concluir} ocupado={pronto.isPending} />
            {/* Sem caixinha: primeiro o gestor escolhe quem faz. */}
            <Lista titulo="Do meu setor, sem responsável" linhas={semDono} hoje={hoje} onAbrir={abrir} feitas={feitas} />
          </>
        )}
      </div>
    </div>
  );
}

function Lista({ titulo, linhas, hoje, onAbrir, feitas, onConcluir, ocupado }: {
  titulo: string; linhas: MinhaAtividade[]; hoje: string; onAbrir: (a: MinhaAtividade) => void;
  feitas: ReadonlySet<string>; onConcluir?: (a: MinhaAtividade) => void; ocupado?: boolean;
}) {
  if (linhas.length === 0) return null;
  return (
    <section className="space-y-3">
      <h2 className="text-[18px] font-bold">{titulo} <span className="text-muted-foreground font-semibold">· {linhas.length}</span></h2>
      {/* A linha do desenho aprovado (tela 7): a atividade, o projeto e o fator externo embaixo; à direita o
          prazo ("venceu 05/10" em vermelho, "24/11 → 28/11", "sem data") e o farol. Cada tarefa num cartão
          próprio, com a caixinha à esquerda, como o To-Do da DashStack (2026-10-29): marcada, a linha fica azul. */}
      <div className="space-y-3.5">
        {linhas.map((a) => {
          const feita = feitas.has(a.id);
          const farol = feita ? 'finalizado' : farolDaAtividade(a, hoje);
          return (
            <div key={a.id}
              className={cn('panel flex items-center gap-4 px-5 py-4 text-[14px] transition-colors',
                feita ? 'bg-primary text-primary-foreground' : 'hover:ring-2 hover:ring-primary/30')}>
              {onConcluir && (
                <button type="button" role="checkbox" aria-checked={feita} disabled={ocupado}
                  aria-label={feita ? `Desfazer: ${a.title} volta para como estava` : `Marcar ${a.title} como pronta`}
                  onClick={() => onConcluir(a)}
                  className={cn('h-6 w-6 shrink-0 rounded-[5px] border-2 flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
                    feita ? 'bg-card border-card' : 'border-input bg-card hover:border-primary')}>
                  {feita && <Check className="h-4 w-4 text-primary" strokeWidth={3} aria-hidden="true" />}
                </button>
              )}
              <button type="button" onClick={() => onAbrir(a)}
                className="grid min-w-0 flex-1 gap-2 text-left md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center md:gap-4">
                <span className="min-w-0">
                  <b className={cn('block truncate', feita && 'line-through decoration-2')}>{a.title}</b>
                  <span className={cn('block truncate text-[13px]', feita ? 'text-primary-foreground/85' : 'text-muted-foreground')}>
                    {a.projeto} · {rotuloDoSetor(a.setor)}{a.fator_externo && a.status !== 'completed' ? ` · esperando: ${a.fator_externo}` : ''}
                  </span>
                </span>
                <span className={cn('font-semibold text-[13px] tabular-nums',
                  feita ? 'text-primary-foreground/85' : farol === 'atrasado' ? 'text-destructive' : 'text-muted-foreground')}>
                  {farol === 'atrasado' && a.termino ? `venceu ${diaCurto(a.termino)}`
                    : a.inicio && a.termino ? `${diaCurto(a.inicio)} → ${diaCurto(a.termino)}`
                    : a.termino ? `até ${diaCurto(a.termino)}` : 'sem data'}
                </span>
                <span><SeloDoFarol farol={farol} /></span>
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
