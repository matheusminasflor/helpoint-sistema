import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Sparkles, BrainCircuit, Mic } from 'lucide-react';
import { LyraAvatar } from '@/components/ai/LyraAvatar';
import { useAssistantName } from '@/hooks/useAssistantName';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { VoiceRecorderBar } from '@/components/ui/VoiceRecorderBar';
import { cn } from '@/lib/utils';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';
import type { ChatMessage } from '@/hooks/useLyraChat';

interface TILyraPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  onSend: (msg: string) => void;
  ticketCount?: number;
  slaCompliance?: number;
  expiringLicenses?: number;
}

const SUGGESTIONS = [
  'Indicadores da semana',
  'SLA por técnico',
  'Licenças expirando',
  'Resumo do inventário',
];

export function TILyraPanel({ messages, isTyping, onSend, ticketCount, slaCompliance, expiringLicenses }: TILyraPanelProps) {
  const assistantName = useAssistantName();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleVoiceTranscript = useCallback((text: string) => {
    onSend(text);
  }, [onSend]);

  const {
    recorderState, isRecording, interimText, duration, audioUrl, audioLevels,
    isSupported, isSending, startRecording, stopRecording, sendRecording, cancelRecording,
  } = useVoiceRecorder(handleVoiceTranscript);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSend = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div className="bg-card  flex flex-col h-[calc(100vh-220px)] sticky top-28 overflow-hidden">
      {/* Header */}
      <div className="bg-primary p-4 flex items-center gap-3">
        <LyraAvatar size="md" />
        <div>
          <h3 className="text-sm font-semibold text-primary-foreground">IA {assistantName}</h3>
          <span className="text-[10px] text-primary-foreground/80 uppercase tracking-widest font-medium">Assistant Premium</span>
        </div>
        <BrainCircuit aria-hidden="true" className="h-4 w-4 text-primary-foreground/80 ml-auto" />
      </div>

      {/* Briefing */}
      {messages.length === 0 && (
        <div className="px-4 py-3 border-b border-border/50 bg-background/50">
          <p className="text-[11px] text-muted-foreground font-medium mb-2">Situação operacional agora</p>
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center">
              <div className="text-lg font-bold text-orange-600">{ticketCount ?? '—'}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Chamados</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-blue-600">{slaCompliance != null ? `${slaCompliance}%` : '—'}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">SLA</div>
            </div>
            <div className="text-center">
              <div className={cn("text-lg font-bold", (expiringLicenses ?? 0) > 0 ? "text-red-600" : "text-green-600")}>{expiringLicenses ?? '—'}</div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Lic. Exp.</div>
            </div>
          </div>
        </div>
      )}

      {/* Chat */}
      <ScrollArea className="flex-1 min-h-0">
        <div ref={scrollRef} className="p-4 space-y-3">
          {messages.length === 0 && (
            <div className="text-center py-6">
              <Sparkles className="h-8 w-8 text-indigo-300 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Pergunte sobre indicadores, SLA, tendências ou qualquer dado operacional.</p>
            </div>
          )}
          {messages.map((msg, i) => (
            <div key={i} className={cn("flex gap-2", msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              {msg.role === 'assistant' && <LyraAvatar size="sm" className="mt-1 shrink-0" />}
              <div className={cn(
                "rounded-xl px-3 py-2 text-xs leading-relaxed max-w-[85%]",
                msg.role === 'user'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-surface-1 text-foreground'
              )}>
                <span className="whitespace-pre-wrap">{msg.content}</span>
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex gap-2 items-start">
              <LyraAvatar size="sm" animated className="mt-1 shrink-0" />
              <div className="bg-surface-1 rounded-xl px-3 py-2">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Suggestions */}
      {messages.length === 0 && (
        <div className="px-3 pb-2 flex flex-wrap gap-1.5">
          {SUGGESTIONS.map(s => (
            <button
              key={s}
              onClick={() => onSend(s)}
              className="text-[10px] px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition-colors font-medium border border-indigo-100"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border/50">
        {recorderState !== 'idle' ? (
          <VoiceRecorderBar
            recorderState={recorderState}
            duration={duration}
            interimText={interimText}
            audioUrl={audioUrl}
            audioLevels={audioLevels}
            isSending={isSending}
            onStop={stopRecording}
            onSend={sendRecording}
            onCancel={cancelRecording}
          />
        ) : (
          <div className="flex items-center gap-2 bg-background rounded-xl px-3 py-1.5 ring-1 ring-border/60 focus-within:ring-primary/50 transition-all">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={`Pergunte à ${assistantName}...`}
              aria-label={`Pergunte à ${assistantName}`}
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {isSupported && (
              <Button
                size="icon"
                variant="ghost"
                onClick={startRecording}
                disabled={isTyping}
                aria-label="Gravar mensagem de voz"
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Mic className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              aria-label={`Enviar mensagem para a ${assistantName}`}
              className="h-8 w-8 text-primary hover:text-primary/80 hover:bg-primary/10"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
