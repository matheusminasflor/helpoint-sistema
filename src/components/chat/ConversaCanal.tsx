import { useEffect, useRef, useState } from 'react';
import { MoreVertical, Send, Trash2, Hash, Lock, Paperclip, Mic, Smile, X } from 'lucide-react';
import { toast } from 'sonner';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AnexoDoChat } from '@/components/chat/AnexoDoChat';
import { comprimirFoto, gravarVoz, LIMITE_DO_ANEXO, transcreveNoNavegador, type Gravacao } from '@/lib/chat-midia';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import {
  useMensagens, useEnviarMensagem, useApagarMensagem, useEntrarNoCanal, useParticipantesDoCanal,
  useRotuloDoCanal, type ChatCanalRow, type AnexoDaMensagem,
} from '@/hooks/useChat';
import { useProfiles } from '@/hooks/useInventory';
import { agrupaPorDia, textoDaMensagem, extraiMencoes } from '@/lib/chat';
import { dataHora, diaCurto } from '@/lib/dates';

// Os do dia a dia de uma conversa de trabalho (dono, 2026-10-15: "colocar emoticons").
const EMOJIS = [
  '😀', '😂', '😊', '😍', '😉', '😎', '🤔', '😅', '😢', '😮', '😡', '🙏', '👍', '👎', '👏', '🙌',
  '💪', '👀', '🎉', '✅', '❌', '⚠️', '❤️', '🔥', '⭐', '📌', '📎', '📦', '☕', '🚚', '💡', '⏰',
];

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
  const rotulo = useRotuloDoCanal(canal);
  const enviar = useEnviarMensagem(canal.id);
  const apagar = useApagarMensagem(canal.id);
  const entrar = useEntrarNoCanal();
  const [texto, setTexto] = useState('');
  // `null` = sem menção em digitação; string = o que foi digitado depois do
  // último `@` antes do cursor, para filtrar a lista de pessoas.
  const [mencaoFiltro, setMencaoFiltro] = useState<string | null>(null);
  const fim = useRef<HTMLDivElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Anexo (até 10 MB; a foto já comprimida) e a gravação de voz em andamento (2026-10-15).
  const [anexo, setAnexo] = useState<File | null>(null);
  const [gravacao, setGravacao] = useState<Gravacao | null>(null);
  const [segundos, setSegundos] = useState(0);
  const arquivoRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!gravacao) return;
    setSegundos(0);
    const t = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [gravacao]);
  // Sair da conversa gravando desliga o microfone. Ref, não dependência: com `[gravacao]` o cleanup rodaria
  // também no "Enviar áudio" (a gravação vira null) e cancelaria o áudio que está sendo entregue.
  const gravacaoRef = useRef<Gravacao | null>(null);
  gravacaoRef.current = gravacao;
  useEffect(() => () => gravacaoRef.current?.cancelar(), []);

  const enviarMensagem = () => {
    const conteudo = texto.trim();
    if (!conteudo && !anexo) return;
    const mencionados = extraiMencoes(conteudo, profiles.map((p) => ({ id: p.id, nome: p.full_name || p.email })));
    enviar.mutate({ conteudo, mencionados, anexo }, { onSuccess: () => { setTexto(''); setAnexo(null); } });
  };

  const escolherArquivo = async (arquivo: File | undefined) => {
    if (arquivoRef.current) arquivoRef.current.value = '';
    if (!arquivo) return;
    const pronto = await comprimirFoto(arquivo);
    if (pronto.size > LIMITE_DO_ANEXO) {
      toast.error('O arquivo passa de 10 MB.');
      return;
    }
    setAnexo(pronto);
  };

  const comecarGravacao = async () => {
    try {
      setGravacao(await gravarVoz());
    } catch {
      toast.error('Não consegui usar o microfone. Libere o acesso no navegador.');
    }
  };

  // Parar envia: o áudio vai como anexo e o que o navegador transcreveu, como o texto.
  const pararGravacao = async () => {
    if (!gravacao) return;
    const atual = gravacao;
    setGravacao(null);
    const { audio, transcricao } = await atual.parar();
    if (audio.size > LIMITE_DO_ANEXO) { toast.error('O áudio passa de 10 MB.'); return; }
    enviar.mutate({ conteudo: transcricao, anexo: audio });
  };

  const cancelarGravacao = () => { gravacao?.cancelar(); setGravacao(null); };

  const porEmoji = (emoji: string) => {
    const el = areaRef.current;
    const ini = el?.selectionStart ?? texto.length;
    const fimSel = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, ini) + emoji + texto.slice(fimSel));
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(ini + emoji.length, ini + emoji.length); });
  };

  // Detecta um `@parcial` sendo digitado bem antes do cursor, não no fim do
  // texto — assim editar no meio de uma mensagem já escrita também funciona.
  const aoDigitar = (valor: string, cursor: number) => {
    setTexto(valor);
    const antesDoCursor = valor.slice(0, cursor);
    const match = antesDoCursor.match(/@([\p{L}\p{N}]*)$/u);
    setMencaoFiltro(match ? match[1] : null);
  };

  const escolherMencao = (pessoa: { id: string; nome: string }) => {
    const el = areaRef.current;
    const cursor = el?.selectionStart ?? texto.length;
    const antes = texto.slice(0, cursor).replace(/@[\p{L}\p{N}]*$/u, `@${pessoa.nome} `);
    const depois = texto.slice(cursor);
    setTexto(antes + depois);
    setMencaoFiltro(null);
    el?.focus();
  };

  const sugestoesMencao = mencaoFiltro === null
    ? []
    : profiles
        .filter((p) => p.id !== user?.id)
        .filter((p) => (p.full_name || p.email).toLowerCase().includes(mencaoFiltro.toLowerCase()))
        .slice(0, 6);

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
          <h2 className="text-sm font-semibold text-foreground truncate">{rotulo}</h2>
        </div>
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <p className="text-[13px] text-muted-foreground max-w-xs">
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
          <h2 className="text-sm font-semibold text-foreground truncate">{rotulo}</h2>
          {canal.descricao && <p className="text-[12px] text-muted-foreground truncate">{canal.descricao}</p>}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {isLoading ? (
          <>
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2 ml-auto" />
          </>
        ) : grupos.length === 0 ? (
          <p className="text-[13px] text-muted-foreground text-center py-8">
            Ninguém escreveu neste canal ainda. Comece a conversa.
          </p>
        ) : (
          grupos.map((g) => (
            <div key={g.dia} className="space-y-2">
              <div className="flex justify-center">
                <span className="text-[12px] uppercase tracking-wide text-muted-foreground bg-muted rounded-full px-2 py-0.5">
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
                        <AvatarFallback className="text-[12px]">
                          {nome.split(' ').filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`group max-w-[75%] rounded-lg px-3 py-2 ${minha ? 'bg-primary/10 border border-primary/20' : 'bg-muted/60 border border-border'}`}>
                      {!minha && <p className="text-[12px] font-medium text-foreground/80 mb-0.5">{nome}</p>}
                      {!m.deleted_at && <AnexoDoChat anexo={m as unknown as AnexoDaMensagem} />}
                      {(m.deleted_at || m.conteudo) && (
                        <p className={`text-[14px] whitespace-pre-wrap break-words ${m.deleted_at ? 'italic text-muted-foreground' : 'text-foreground'}`}>
                          {textoDaMensagem(m)}
                        </p>
                      )}
                      <div className="flex items-center justify-end gap-1 mt-1">
                        <span className="text-[12px] text-muted-foreground">{dataHora(m.created_at)}</span>
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

      <div className="border-t border-border p-3 space-y-2 shrink-0 relative">
        {sugestoesMencao.length > 0 && (
          <ul className="absolute bottom-full left-3 mb-1 w-56 rounded-md border border-border bg-popover shadow-md divide-y divide-border max-h-40 overflow-y-auto z-10">
            {sugestoesMencao.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-1.5 text-[14px] text-foreground hover:bg-muted/60 truncate"
                  onClick={() => escolherMencao({ id: p.id, nome: p.full_name || p.email })}
                >
                  {p.full_name || p.email}
                </button>
              </li>
            ))}
          </ul>
        )}
        {anexo && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-2 py-1 text-[13px]">
            <Paperclip className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{anexo.name}</span>
            <span className="text-muted-foreground shrink-0">({Math.max(1, Math.round(anexo.size / 1024))} KB)</span>
            <Button variant="ghost" size="icon" className="h-6 w-6 ml-auto" aria-label="Tirar o anexo" onClick={() => setAnexo(null)}>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}
        {gravacao ? (
          <div className="flex items-center gap-3 rounded-md border border-status-danger/40 bg-status-danger/5 px-3 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-status-danger animate-pulse" aria-hidden="true" />
            <span className="text-[14px] font-mono">{Math.floor(segundos / 60)}:{String(segundos % 60).padStart(2, '0')}</span>
            <span className="text-[12px] text-muted-foreground truncate">
              {transcreveNoNavegador() ? 'Gravando e transcrevendo…' : 'Gravando… (este navegador não transcreve)'}
            </span>
            <Button variant="ghost" size="sm" className="ml-auto" onClick={cancelarGravacao}>Cancelar</Button>
            <Button size="sm" onClick={pararGravacao}><Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />Enviar áudio</Button>
          </div>
        ) : (
          <Textarea
            ref={areaRef}
            rows={2}
            value={texto}
            onChange={(e) => aoDigitar(e.target.value, e.target.selectionStart ?? e.target.value.length)}
            placeholder={`Escrever em ${canal.tipo === 'direta' ? rotulo : '#' + rotulo}… ("@" para mencionar)`}
            maxLength={4000}
            onKeyDown={(e) => {
              // Enter envia; Shift + Enter quebra a linha (dono, 2026-10-15). Com a lista de menção aberta,
              // o Enter escolhe a primeira pessoa.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (sugestoesMencao.length > 0) {
                  const p = sugestoesMencao[0];
                  escolherMencao({ id: p.id, nome: p.full_name || p.email });
                } else {
                  enviarMensagem();
                }
              }
              if (e.key === 'Escape') setMencaoFiltro(null);
            }}
          />
        )}
        {!gravacao && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Emoticons" title="Emoticons">
                    <Smile className="w-4 h-4" aria-hidden="true" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <div className="grid grid-cols-8 gap-0.5">
                    {EMOJIS.map((emoji) => (
                      <button key={emoji} type="button" className="h-8 w-8 rounded text-[20px] hover:bg-muted" onClick={() => porEmoji(emoji)}>
                        {emoji}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Anexar arquivo" title="Anexar foto ou arquivo (até 10 MB)"
                onClick={() => arquivoRef.current?.click()}>
                <Paperclip className="w-4 h-4" aria-hidden="true" />
              </Button>
              <input ref={arquivoRef} type="file" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0])} />
              {typeof MediaRecorder !== 'undefined' && (
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Gravar áudio" title="Gravar áudio"
                  disabled={enviar.isPending} onClick={comecarGravacao}>
                  <Mic className="w-4 h-4" aria-hidden="true" />
                </Button>
              )}
              <span className="text-[12px] text-muted-foreground hidden sm:inline">Enter envia · Shift + Enter quebra a linha.</span>
            </div>
            <Button size="sm" disabled={(!texto.trim() && !anexo) || enviar.isPending} onClick={enviarMensagem}>
              <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {enviar.isPending ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
