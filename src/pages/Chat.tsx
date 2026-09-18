import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Plus, Hash, Lock, MoreVertical, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/layout/PageHeader';
import { NovoCanalDialog } from '@/components/chat/NovoCanalDialog';
import { ConversarComDialog } from '@/components/chat/ConversarComDialog';
import { ConversaCanal } from '@/components/chat/ConversaCanal';
import {
  useCanais, useApagarCanal, useNaoLidas, useRotuloDoCanal, type ChatCanalRow,
} from '@/hooks/useChat';
import { useAuth } from '@/contexts/AuthContext';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { useIsMobile } from '@/hooks/use-mobile';
import { useTenantPath } from '@/hooks/useTenantPath';

/**
 * Chat interno (L11a/L11b): canais por setor e conversa direta. O corredor,
 * não o arquivo — nada daqui comenta em chamado (§2 do plano). No celular,
 * lista OU conversa, nunca as duas (decisão 10).
 */
export default function Chat() {
  const { id } = useParams();
  const navigate = useNavigate();
  const tenantPath = useTenantPath();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { isOwnerOrAdmin } = useVisibleModules();
  const { data: canais = [], isLoading } = useCanais();
  const { data: naoLidas = [] } = useNaoLidas();
  const apagarCanal = useApagarCanal();
  const [novoCanal, setNovoCanal] = useState(false);
  const [conversarCom, setConversarCom] = useState(false);

  const canalAtivo = canais.find((c) => c.id === id) ?? null;
  const mostrarLista = !isMobile || !id;
  const mostrarConversa = !isMobile || !!id;
  const naoLidasPorCanal = new Map(naoLidas.map((n) => [n.channel_id, n.qtd]));

  const canaisDeSetor = canais.filter((c) => c.tipo !== 'direta');
  const conversasDiretas = canais.filter((c) => c.tipo === 'direta');

  const irPara = (channelId: string) => navigate(tenantPath(`/chat/${channelId}`));

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={MessageSquare}
        title="Chat"
        description="Conversa da equipe, por canal. O que decide algo sobre um chamado volta para o chamado."
        actions={(
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setConversarCom(true)}>
              <UserPlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Conversar com…
            </Button>
            <Button onClick={() => setNovoCanal(true)}>
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Novo canal
            </Button>
          </div>
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
              <>
                {canaisDeSetor.length > 0 && (
                  <>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Canais</p>
                    <ul className="py-1">
                      {canaisDeSetor.map((c) => (
                        <ItemDaLista
                          key={c.id}
                          canal={c}
                          ativo={c.id === id}
                          naoLidas={naoLidasPorCanal.get(c.id) ?? 0}
                          podeApagar={c.created_by === user?.id || isOwnerOrAdmin}
                          onAbrir={() => irPara(c.id)}
                          onApagar={() => apagarCanal.mutate(c.id, { onSuccess: () => { if (c.id === id) navigate(tenantPath('/chat')); } })}
                        />
                      ))}
                    </ul>
                  </>
                )}
                {conversasDiretas.length > 0 && (
                  <>
                    <p className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Conversas</p>
                    <ul className="py-1">
                      {conversasDiretas.map((c) => (
                        <ItemDaLista
                          key={c.id}
                          canal={c}
                          ativo={c.id === id}
                          naoLidas={naoLidasPorCanal.get(c.id) ?? 0}
                          podeApagar={isOwnerOrAdmin}
                          onAbrir={() => irPara(c.id)}
                          onApagar={() => apagarCanal.mutate(c.id, { onSuccess: () => { if (c.id === id) navigate(tenantPath('/chat')); } })}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </>
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
      <ConversarComDialog open={conversarCom} onOpenChange={setConversarCom} />
    </div>
  );
}

/**
 * Uma linha da lista — canal de setor ou conversa direta. Separado em
 * componente próprio porque o rótulo de uma conversa direta depende de
 * quem está do outro lado (`useRotuloDoCanal`), e isso é uma consulta por
 * linha — nada que se calcule uma vez só para a lista inteira.
 */
function ItemDaLista({ canal, ativo, naoLidas, podeApagar, onAbrir, onApagar }: {
  canal: ChatCanalRow;
  ativo: boolean;
  naoLidas: number;
  podeApagar: boolean;
  onAbrir: () => void;
  onApagar: () => void;
}) {
  const rotulo = useRotuloDoCanal(canal);
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted/60 ${
          ativo ? 'bg-muted font-medium' : 'text-foreground'
        }`}
      >
        {canal.privado
          ? <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          : <Hash className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />}
        <span className="truncate flex-1">{rotulo}</span>
        {naoLidas > 0 && (
          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
            {naoLidas > 9 ? '9+' : naoLidas}
          </span>
        )}
        {podeApagar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                aria-label={`Opções de ${rotulo}`}
                className="p-1 rounded hover:bg-muted-foreground/10"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="w-3.5 h-3.5" aria-hidden="true" />
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem className="text-destructive" onClick={onApagar}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                {canal.tipo === 'direta' ? 'Apagar conversa' : 'Apagar canal'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </button>
    </li>
  );
}
