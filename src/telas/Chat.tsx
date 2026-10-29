import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
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
  useCanais, useApagarCanal, useNaoLidas, useRotuloDoCanal, useUltimasMensagens, type ChatCanalRow, type UltimaMensagem,
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
  const { data: ultimas } = useUltimasMensagens();
  const apagarCanal = useApagarCanal();
  const [novoCanal, setNovoCanal] = useState(false);
  const [conversarCom, setConversarCom] = useState(false);

  const canalAtivo = canais.find((c) => c.id === id) ?? null;
  const mostrarLista = !isMobile || !id;
  const mostrarConversa = !isMobile || !!id;
  const naoLidasPorCanal = new Map(naoLidas.map((n) => [n.channel_id, n.qtd]));

  // Quem falou por último fica em cima, como no WhatsApp (dono, 2026-10-28); sem mensagem, pelo nome.
  const recentes = (a: ChatCanalRow, b: ChatCanalRow) =>
    (ultimas?.get(b.id)?.created_at ?? '').localeCompare(ultimas?.get(a.id)?.created_at ?? '') || a.nome.localeCompare(b.nome);
  const canaisDeSetor = canais.filter((c) => c.tipo !== 'direta').sort(recentes);
  const conversasDiretas = canais.filter((c) => c.tipo === 'direta').sort(recentes);

  const irPara = (channelId: string) => navigate(tenantPath(`/chat/${channelId}`));

  return (
    // Rodada 3 (etapa D, Occam): altura da tela de verdade (o h-full não segurava e a caixa de mensagem não ficava
    // presa embaixo); no celular, dentro da conversa, o cabeçalho da tela sai — a conversa tem o dela.
    <div className="flex flex-col h-[calc(100dvh-70px-56px-env(safe-area-inset-bottom))] min-[861px]:h-[calc(100dvh-70px)]">
      {!(isMobile && id) && <PageHeader
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
      />}

      <div className="flex-1 flex overflow-hidden min-h-0 min-[861px]:gap-6 min-[861px]:px-4 lg:px-8 min-[861px]:pb-6">
        {mostrarLista && (
          <div className={`${isMobile ? 'w-full' : 'w-72 panel py-3'} flex flex-col overflow-y-auto`}>
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
                    <p className="px-5 pt-3 pb-2 text-[16px] font-bold text-foreground">Canais</p>
                    <ul className="py-1">
                      {canaisDeSetor.map((c) => (
                        <ItemDaLista
                          key={c.id}
                          canal={c}
                          ativo={c.id === id}
                          naoLidas={naoLidasPorCanal.get(c.id) ?? 0}
                          ultima={ultimas?.get(c.id)}
                          souEu={ultimas?.get(c.id)?.author_id === user?.id}
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
                    <p className="px-5 pt-4 pb-2 text-[16px] font-bold text-foreground">Conversas</p>
                    <ul className="py-1">
                      {conversasDiretas.map((c) => (
                        <ItemDaLista
                          key={c.id}
                          canal={c}
                          ativo={c.id === id}
                          naoLidas={naoLidasPorCanal.get(c.id) ?? 0}
                          ultima={ultimas?.get(c.id)}
                          souEu={ultimas?.get(c.id)?.author_id === user?.id}
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
          <div className="flex-1 flex flex-col overflow-hidden min-[861px]:panel">
            {canalAtivo ? (
              <ConversaCanal canal={canalAtivo} souAdmin={isOwnerOrAdmin} />
            ) : id ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-[13px] text-muted-foreground">
                  Este canal não existe mais, ou você não tem acesso a ele.
                </p>
              </div>
            ) : !isMobile && canais.length > 0 ? (
              <div className="flex-1 flex items-center justify-center p-8 text-center">
                <p className="text-[13px] text-muted-foreground">Escolha um canal à esquerda.</p>
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

/** "14:32" hoje, "ontem", "seg" na semana, "26/10" antes — como a lista do WhatsApp. */
function quandoFoi(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const dias = Math.floor((new Date(hoje.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (dias <= 0) return format(d, 'HH:mm');
  if (dias === 1) return 'ontem';
  if (dias < 7) return format(d, 'EEE', { locale: ptBR });
  return format(d, 'dd/MM');
}

const iniciais = (nome: string) => nome.split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

/**
 * Uma linha da lista — canal de setor ou conversa direta. Separado em
 * componente próprio porque o rótulo de uma conversa direta depende de
 * quem está do outro lado (`useRotuloDoCanal`), e isso é uma consulta por
 * linha — nada que se calcule uma vez só para a lista inteira.
 * Desde 2026-10-28 é a linha do WhatsApp: as iniciais (ou # do canal), o nome e a hora, e embaixo a última mensagem e
 * quantas faltam ler.
 */
function ItemDaLista({ canal, ativo, naoLidas, ultima, souEu, podeApagar, onAbrir, onApagar }: {
  canal: ChatCanalRow;
  ativo: boolean;
  naoLidas: number;
  ultima?: UltimaMensagem;
  souEu: boolean;
  podeApagar: boolean;
  onAbrir: () => void;
  onApagar: () => void;
}) {
  const rotulo = useRotuloDoCanal(canal);
  const previa = !ultima ? 'Sem mensagens ainda'
    : ultima.deleted_at ? 'Mensagem apagada'
    : `${souEu ? 'Você: ' : ''}${ultima.conteudo?.trim() || 'Anexo'}`;
  return (
    <li>
      <button
        type="button"
        onClick={onAbrir}
        className={cn('w-[calc(100%-1rem)] mx-2 flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-muted/60',
          ativo && 'bg-primary/10')}
      >
        <span className={cn('w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-[13px] font-extrabold',
          canal.tipo === 'direta' ? 'kpi-icone-azul' : 'kpi-icone-lilas')} aria-hidden="true">
          {canal.tipo === 'direta' ? iniciais(rotulo) : canal.privado ? <Lock className="w-4 h-4" /> : <Hash className="w-4 h-4" />}
        </span>
        <span className="flex-1 min-w-0">
          <span className="flex items-baseline gap-2">
            <span className={cn('truncate flex-1 text-[14px]', ativo ? 'text-primary font-extrabold' : 'font-bold text-foreground')}>{rotulo}</span>
            {ultima && (
              <span className={cn('shrink-0 text-[12px]', naoLidas > 0 ? 'text-primary font-bold' : 'text-muted-foreground font-semibold')}>
                {quandoFoi(ultima.created_at)}
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 mt-0.5">
            <span className={cn('truncate flex-1 text-[13px]', naoLidas > 0 ? 'text-foreground font-semibold' : 'text-muted-foreground')}>{previa}</span>
            {naoLidas > 0 && (
              <span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center">
                {naoLidas > 99 ? '99+' : naoLidas}
              </span>
            )}
          </span>
        </span>
        {podeApagar && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <span
                role="button"
                aria-label={`Opções de ${rotulo}`}
                className="p-1 rounded hover:bg-muted-foreground/10 shrink-0"
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
