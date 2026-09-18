import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Send, Trash2, Hash, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMensagens, useEnviarMensagem, useApagarMensagem, useEntrarNoCanal, useParticipantesDoCanal,
  type ChatCanalRow,
} from '@/hooks/useChat';
import { useProfiles } from '@/hooks/useInventory';
import { agrupaPorDia, textoDaMensagem } from '@/lib/chat';
import { dataHora, diaCurto } from '@/lib/dates';

/**
 * A conversa de um canal. Layout inspirado em `ConversaWhatsApp.tsx` — sem
 * importar nada de lá: a janela de 24h, modelo de mensagem e reengajamento
 * são coisa da Meta, não deste chat interno.
 */
export function ConversaCanal({ canal, souAdmin }: {
  canal: ChatCanalRow;
  souAdmin: boolean;
}) {
  const { user } = useAuth();
  const { data: participantes = [] } = useParticipantesDoCanal(canal.id);
  const { data: mensagens = [], isLoading } = useMensagens(canal.id);
  const { profiles } = useProfiles();
  const enviar = useEnviarMensagem(canal.id);
  const apagar = useApagarMensagem(canal.id);
  const entrar = useEntrarNoCanal();
  const [texto, setTexto] = useState('');
  const fim = useRef<HTMLDivElement>(null);

  // Decisão 11 (revista): dono/administrador enxergam que o canal fechado
  // existe (para escolher qual apagar), mas não participam dele só por isso
  // — e não lêem as mensagens. Canal aberto, todo mundo participa.
  const participo = !canal.privado || canal.created_by === user?.id
    || participantes.some((p) => p.user_id === user?.id);

  // Marca "li até aqui" ao abrir o canal — é o que zera a bolinha na L11b.
  // Só quando participa: em canal fechado de que não participa, esta escrita
  // levaria 42501 (a policy de INSERT de `chat_channel_members` não deixa a
  // pessoa se inserir sozinha ali).
  useEffect(() => {
    if (participo) entrar.mutate(canal.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canal.id, participo]);

  useEffect(() => {
    fim.current?.scrollIntoView({ block: 'end' });
  }, [mensagens.length]);

  const nomes = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
  const grupos = agrupaPorDia(mensagens);

  if (!participo) {
    return (
      <div className="flex flex-col h-full">
        <div className="border-b border-border px-4 py-3 flex items-center gap-2 shrink-0">
          <Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-foreground truncate">{canal.nome}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-[12px] text-muted-foreground max-w-xs">
            Canal fechado — você não participa. Só quem participa lê as
            mensagens; dono e administrador podem apagar o canal inteiro.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border px-4 py-3 flex items-center gap-2 shrink-0">
        {canal.privado ? <Lock className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> : <Hash className="w-4 h-4 text-muted-foreground" aria-hidden="true" />}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{canal.nome}</h2>
          {canal.descricao && <p className="text-[11px] text-muted-foreground truncate">{canal.descricao}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
          </>
        ) : grupos.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8">
            Ninguém escreveu neste canal ainda. Comece a conversa.
          </p>
        ) : (
          grupos.map((g) => (
            <div key={g.dia} className="space-y-2">
              <div className="flex justify-center">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {diaCurto(g.dia)}
                </span>
              </div>
              {g.mensagens.map((m) => {
                const minha = m.author_id === user?.id;
                const podeApagar = !m.deleted_at && (minha || souAdmin);
                const nome = nomes.get(m.author_id) ?? '—';
                return (
                  <div key={m.id} className={`flex gap-2 ${minha ? 'justify-end' : 'justify-start'}`}>
                    {!minha && (
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {nome.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`group max-w-[75%] rounded-lg px-3 py-2 ${minha ? 'bg-primary/10 border border-primary/20' : 'bg-muted/60 border border-border'}`}>
                      {!minha && <p className="text-[11px] font-medium text-foreground/80 mb-0.5">{nome}</p>}
                      <p className={`text-[13px] whitespace-pre-wrap break-words ${m.deleted_at ? 'italic text-muted-foreground' : 'text-foreground'}`}>
                        {textoDaMensagem(m)}
                      </p>
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[10px] text-muted-foreground">{dataHora(m.created_at)}</span>
                        {podeApagar && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100"
                                aria-label="Opções da mensagem">
                                <MoreVertical className="w-3 h-3" aria-hidden="true" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="text-destructive" onClick={() => apagar.mutate(m.id)}>
                                <Trash2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                                Apagar
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}
        <div ref={fim} />
      </div>

      <div className="border-t border-border p-3 space-y-2 shrink-0">
        <Textarea
          rows={2}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={`Escrever em #${canal.nome}…`}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && texto.trim()) {
              enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') });
            }
          }}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">Ctrl + Enter envia.</span>
          <Button size="sm" disabled={!texto.trim() || enviar.isPending} onClick={() => enviar.mutate(texto.trim(), { onSuccess: () => setTexto('') })}>
            <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
