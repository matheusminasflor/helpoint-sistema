import { useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { friendlyAIError } from '@/hooks/useTenantAICredentials';
import { useAuth } from '@/contexts/AuthContext';
import type { Task } from '@/types/database';
import type { KanbanCardItem } from '@/hooks/useAISecretary';
import { unwrap } from '@/lib/supabase-result';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ContextData {
  tickets: {
    ticket_number: number;
    title: string;
    priority: string;
    status: string;
    sla_due_at: string | null;
    category: string | null;
  }[];
  kanban_cards: {
    title: string;
    priority: string;
    due_date: string | null;
    board_name?: string;
    column_name?: string;
  }[];
  tasks: {
    title: string;
    priority: number;
    due_date: string | null;
    status: string;
  }[];
}

interface UseLyraChatOptions {
  tickets: { id: string; ticket_number: number; title: string; priority: string; status: string; sla_due_at: string | null; category: string | null }[];
  kanbanCards: KanbanCardItem[];
  tasks: Task[];
}

export function useLyraChat({ tickets, kanbanCards, tasks }: UseLyraChatOptions) {
  const { profile } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const lastCallRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  const sendMessage = useCallback(async (question: string) => {
    if (!question.trim() || inFlightRef.current) return;

    const now = Date.now();
    if (now - lastCallRef.current < 1000) return;
    lastCallRef.current = now;
    inFlightRef.current = true;

    const userMsg: ChatMessage = { role: 'user', content: question };
    setMessages(prev => [...prev, userMsg]);
    setIsTyping(true);

    try {
      const { session } = unwrap(await supabase.auth.getSession());
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error('Sessão expirada');

      const contextData: ContextData = {
        tickets: tickets.map(t => ({
          ticket_number: t.ticket_number,
          title: t.title,
          priority: t.priority,
          status: t.status,
          sla_due_at: t.sla_due_at,
          category: t.category,
        })),
        kanban_cards: kanbanCards.map(c => ({
          title: c.title,
          priority: c.priority || 'medium',
          due_date: c.due_date,
          board_name: c.board_name,
          column_name: c.column_name,
        })),
        tasks: tasks.map(t => ({
          title: t.title,
          priority: t.priority || 3,
          due_date: t.due_date,
          status: t.status || 'pending',
        })),
      };

      // Include current messages as history (excluding the one we just added)
      const history = [...messages].slice(-10);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-lyra-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            question,
            conversation_history: history,
            context_data: contextData,
            user_name: profile?.full_name || 'Usuário',
          }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Erro desconhecido' }));
        if (res.status === 403 && errData.blocked) {
          const blockMsg = errData.error || 'Acesso bloqueado por violação de segurança.';
          setMessages(prev => [...prev, { role: 'assistant', content: `🔒 ${blockMsg}` }]);
          setIsTyping(false);
          inFlightRef.current = false;
          return;
        }
        throw new Error(errData.error || `Erro ${res.status}`);
      }

      // BYOK: o servidor devolve 200 + JSON quando não há provedor de IA configurado
      if (res.headers.get('content-type')?.includes('application/json')) {
        const payload = await res.json().catch(() => null);
        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: friendlyAIError(payload, 'Não foi possível responder agora.') },
        ]);
        setIsTyping(false);
        inFlightRef.current = false;
        return;
      }

      if (!res.body) throw new Error('Sem resposta');

      // Stream SSE
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              const snapshot = fullContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: snapshot } : m);
                }
                return [...prev, { role: 'assistant', content: snapshot }];
              });
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullContent += content;
              const snapshot = fullContent;
              setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'assistant') {
                  return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: snapshot } : m);
                }
                return [...prev, { role: 'assistant', content: snapshot }];
              });
            }
          } catch { /* ignore */ }
        }
      }

      // If no content was streamed, add empty assistant message
      if (!fullContent) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Desculpe, não consegui processar sua pergunta. Tente novamente.' }]);
      }
    } catch (err) {
      console.error('Lyra chat error:', err);
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: err instanceof Error ? err.message : 'Erro ao processar. Tente novamente.' },
      ]);
    } finally {
      setIsTyping(false);
      inFlightRef.current = false;
    }
  }, [messages, tickets, kanbanCards, tasks, profile]);

  return { messages, isTyping, sendMessage };
}
