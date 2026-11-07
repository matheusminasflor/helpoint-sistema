// Meu trabalho › Reuniões (dono, 2026-11-07): as reuniões de que a pessoa participa, cada uma com a sua história. É
// consulta, não conversa: por isso saiu do Chat, que fica só com o aviso da pauta nova.
import { useNavigate, useParams } from 'react-router-dom';
import { Video } from 'lucide-react';
import { CanalDeReuniao } from '@/components/chat/CanalDeReuniao';
import { PageHeader } from '@/components/layout/PageHeader';
import { ErroDeCarga } from '@/components/ui/ErroDeCarga';
import { Skeleton } from '@/components/ui/skeleton';
import { useCanais, useContadoresAoVivo, useNaoLidas } from '@/hooks/useChat';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSeriesDeReuniao } from '@/hooks/useReunioes';
import { useTenantPath } from '@/hooks/useTenantPath';

export default function Reunioes() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const isMobile = useIsMobile();
  const { data: series = [], isLoading, isError, refetch } = useSeriesDeReuniao();
  const { data: canais = [] } = useCanais();
  const { data: naoLidas = [] } = useNaoLidas();
  useContadoresAoVivo();
  const novas = new Map(naoLidas.map((n) => [n.channel_id, n.qtd]));
  const ativa = series.find((s) => s.id === id) ?? null;
  const mostrarLista = !isMobile || !id;
  const mostrarCanal = !isMobile || !!id;

  return (
    <div className="flex flex-col h-[calc(100dvh-70px-56px-env(safe-area-inset-bottom))] min-[861px]:h-[calc(100dvh-70px)]">
      {!(isMobile && id) && (
        <PageHeader icon={Video} title="Reuniões" description="As reuniões de que você participa: pauta, transcrição, presença e o andamento semana a semana." />
      )}
      <div className="flex-1 flex overflow-hidden min-h-0 min-[861px]:gap-6 min-[861px]:px-4 lg:px-8 min-[861px]:pb-6">
        {mostrarLista && (
          <div className={`${isMobile ? 'w-full' : 'w-80 panel py-3'} flex flex-col overflow-y-auto`}>
            {isError ? <div className="p-3"><ErroDeCarga mensagem="Não consegui ler as reuniões." onTentar={() => void refetch()} /></div>
              : isLoading ? <div className="p-3 space-y-2"><Skeleton className="h-9 w-full" /><Skeleton className="h-9 w-full" /></div>
                : series.length === 0 ? <p className="p-5 text-[14px] text-muted-foreground">Quando você participar de uma reunião do Google, ela aparece aqui.</p>
                  : [false, true].map((avulsas) => {
                    const grupo = series.filter((s) => s.avulsa === avulsas);
                    if (grupo.length === 0) return null;
                    return (
                      <div key={String(avulsas)}>
                        <p className="px-5 pt-3 pb-2 text-[16px] font-bold text-foreground">{avulsas ? 'Avulsas' : 'Repetidas'}</p>
                        <ul className="py-1 px-3 space-y-1">
                          {grupo.map((s) => {
                            const qtd = novas.get(s.canal_id) ?? 0;
                            return (
                              <li key={s.id}>
                                <button type="button" onClick={() => navigate(tenantPath(`/reunioes/${s.id}`))} aria-current={s.id === ativa?.id}
                                  className={`w-full min-h-11 rounded-md px-3 py-2 text-left text-[14px] flex items-center justify-between gap-2 hover:bg-muted ${s.id === ativa?.id ? 'bg-muted font-semibold' : ''}`}>
                                  <span className="min-w-0 break-words">{s.titulo}</span>
                                  {qtd > 0 && <span className="shrink-0 rounded-full bg-primary px-1.5 text-[12px] text-primary-foreground">{qtd}</span>}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })}
          </div>
        )}
        {mostrarCanal && (
          <div className="flex-1 flex flex-col overflow-hidden min-[861px]:panel">
            {ativa ? (
              <CanalDeReuniao key={ativa.id} serie={ativa} canal={canais.find((c) => c.id === ativa.canal_id) ?? null} onVoltar={() => navigate(tenantPath('/reunioes'))} />
            ) : id ? (
              <p className="flex-1 flex items-center justify-center p-8 text-center text-[13px] text-muted-foreground">Esta reunião não existe mais, ou você não tem acesso a ela.</p>
            ) : !isMobile && series.length > 0 ? (
              <p className="flex-1 flex items-center justify-center p-8 text-center text-[13px] text-muted-foreground">Escolha uma reunião à esquerda.</p>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
