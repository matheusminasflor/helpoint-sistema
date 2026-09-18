import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Plus, Hash, Lock, MoreVertical, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/layout/PageHeader';
import { NovoCanalDialog } from '@/components/chat/NovoCanalDialog';
import { ConversaCanal } from '@/components/chat/ConversaCanal';
import { useCanais, useApagarCanal } from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Chat interno (L11a): canais por setor. O corredor, não o arquivo — nada
 * daqui comenta em chamado (§2 do plano). No celular, lista OU conversa,
 * nunca as duas (decisão 10).
 */
export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: canais = [], isLoading } = useCanais();
  const apagarCanal = useApagarCanal();
  const [novoCanal, setNovoCanal] = useState(false);

  const canalAtivo = canais.find((c) => c.id === id) ?? null;
  const mostrarLista = !isMobile || !id;
  const mostrarConversa = !isMobile || !!id;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={MessageSquare}
        title="Chat"
        description="Conversa da equipe, por canal. O que decide algo sobre um chamado volta para o chamado."
        actions={(
          <Button onClick={() => setNovoCanal(true)}>
            <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            Novo canal
          </Button>
        )}
      />

      <div className="flex-1 flex overflow-hidden">
        {mostrarLista && (
          <div className={`${isMobile ? 'w-full' : 'w-64 border-r border-border'} flex flex-col overflow-y-auto`}>
            {isLoading ? (
              <div className="p-3 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            ) : canais.length === 0 ? (
              <EmptyState
                icon={MessageSquare}
                title="Nenhum canal ainda"
                description="Crie o primeiro canal para a equipe conversar."
                actionLabel="Novo canal"
                actionIcon={Plus}
                onAction={() => setNovoCanal(true)}
              />
            ) : (
              <ul className="py-1">
                {canais.map((c) => {
                  const podeApagar = c.created_by === user?.id || isOwnerOrAdmin;
                  return (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => navigate(tenantPath(`/chat/${c.id}`))}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 ${
                          c.id === id ? 'bg-muted font-medium' : 'text-foreground'
                        }`}
                      >
                        {c.privado
                          ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                          : <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />}
                        <span className="truncate flex-1">{c.nome}</span>
                        {podeApagar && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <span
                                role="button"
                                aria-label={`Opções do canal ${c.nome}`}
                                className="p-1 rounded hover:bg-muted-foreground/10"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
                              </span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => {
                                  apagarCanal.mutate(c.id, {
                                    onSuccess: () => {
                                      if (c.id === id) navigate(tenantPath('/chat'));
                                    },
                                  });
                                }}
                              >
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                                Apagar canal
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {mostrarConversa && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {canalAtivo ? (
              <ConversaCanal canal={canalAtivo} souAdmin={isOwnerOrAdmin} />
            ) : id ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-[12px] text-muted-foreground">
                  Este canal não existe mais, ou você não tem acesso a ele.
                </p>
              </div>
            ) : !isMobile && canais.length > 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-[12px] text-muted-foreground">Escolha um canal à esquerda.</p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      <NovoCanalDialog open={novoCanal} onOpenChange={setNovoCanal} />
    </div>
  );
}
