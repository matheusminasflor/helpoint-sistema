import { useRef, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useMyModules } from '@/hooks/useUserModules';
import type { Task } from '@/types/database';
import { useAssistantName } from '@/hooks/useAssistantName';
import { unwrap } from '@/lib/supabase-result';

interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  priority: string;
  status: string;
  sla_due_at: string | null;
  category: string | null;
  created_at: string;
}

export interface KanbanCardItem {
  id: string;
  title: string;
  priority: string | null;
  due_date: string | null;
  completed_at: string | null;
  board_id: string;
  column_id: string;
  board_name?: string;
  column_name?: string;
}

interface UseAISecretaryResult {
  summary: string;
  isLoading: boolean;
  error: string | null;
  generateSummary: (tasks: Task[]) => Promise<void>;
  tickets: Ticket[];
  ticketsLoading: boolean;
  kanbanCards: KanbanCardItem[];
  kanbanCardsLoading: boolean;
}

export function useAISecretary(): UseAISecretaryResult {
  const { user, profile } = useAuth();
  const assistantName = useAssistantName();
  const { data: userModules } = useMyModules();
  const [summary, setSummary] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  // Kanban removed — kept empty for backwards-compat with consumers
  const kanbanCards: KanbanCardItem[] = [];
  const kanbanCardsLoading = false;

  const lastCallAtRef = useRef<number>(0);
  const inFlightRef = useRef<boolean>(false);

  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const fetchUserTickets = useCallback(async (): Promise<Ticket[]> => {
    if (!user) return [];
    
    setTicketsLoading(true);
    try {
      const { data, error: ticketError } = await supabase
        .from('tickets')
        .select('id, ticket_number, title, priority, status, sla_due_at, category, created_at')
        .or(`requester_id.eq.${user.id},assigned_to.eq.${user.id}`)
        .not('status', 'in', '("resolved","closed","cancelled")')
        .order('priority', { ascending: true })
        .order('sla_due_at', { ascending: true, nullsFirst: false })
        .limit(20);

      if (ticketError) {
        console.error('Error fetching tickets:', ticketError);
        return [];
      }

      // Deduplicate by ticket_number (user can be both requester and assigned_to)
      const unique = new Map<number, Ticket>();
      ((data || []) as Ticket[]).forEach(t => {
        if (!unique.has(t.ticket_number)) unique.set(t.ticket_number, t);
      });
      const ticketList = Array.from(unique.values());
      setTickets(ticketList);
      return ticketList;
    } catch (err) {
      console.error('Error fetching tickets:', err);
      return [];
    } finally {
      setTicketsLoading(false);
    }
  }, [user]);

  // Kanban removed
  const fetchUserKanbanCards = useCallback(async (): Promise<KanbanCardItem[]> => [], []);

  const generateSummary = useCallback(async (tasks: Task[]) => {
    if (!user) {
      setError('Usuário não autenticado');
      return;
    }

    const now = Date.now();
    if (inFlightRef.current || now - lastCallAtRef.current < 800) {
      return;
    }
    lastCallAtRef.current = now;
    inFlightRef.current = true;

    setIsLoading(true);
    setError(null);
    setSummary('');

    try {
      // Fetch tickets in parallel (kanban removed)
      const [userTickets] = await Promise.all([
        fetchUserTickets(),
      ]);
      const userKanbanCards: KanbanCardItem[] = [];
      const todayRoutines: any[] = [];

      const requestBody = {
        user_name: profile?.full_name || 'Usuário',
        current_hour: new Date().getHours(),
        tasks: tasks.map(t => ({
          title: t.title,
          priority: t.priority || 3,
          due_date: t.due_date,
          status: t.status || 'pending',
          is_ai_suggested: t.is_ai_suggested || false,
        })),
        tickets: userTickets,
        kanban_cards: userKanbanCards.map(c => ({
          title: c.title,
          priority: c.priority || 'medium',
          due_date: c.due_date,
          board_name: c.board_name,
          column_name: c.column_name,
        })),
        user_modules: userModules || [],
        routines: todayRoutines.map((r: any) => ({
          title: r.title,
          scheduled_time: r.scheduled_time,
          priority_rank: r.priority_rank,
        })),
      };

      const callAISecretary = async () => {
        const { session } = unwrap(await supabase.auth.getSession());
        const accessToken = session?.access_token;
        
        if (!accessToken) {
          throw new Error('Sessão expirada. Por favor, faça login novamente.');
        }

        const res = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-secretary`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify(requestBody),
          }
        );
        return res;
      };

      let response = await callAISecretary();

      if (!response.ok && response.status === 429) {
        const retryAfterHeader = response.headers.get('retry-after');
        await response.text();
        const retryMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 5000;
        await sleep(Number.isFinite(retryMs) && retryMs >= 1000 ? retryMs : 5000);
        response = await callAISecretary();
      }

      if (!response.ok) {
        if (response.status === 429) {
          await response.text();
          throw new Error('Muitas requisições. Aguarde um momento e tente novamente.');
        }
        if (response.status === 402) {
          await response.text();
          throw new Error('Créditos de IA esgotados. Entre em contato com o administrador.');
        }
        await response.text();
        throw new Error('Erro ao gerar resumo com IA');
      }

      if (!response.body) {
        throw new Error('Resposta sem corpo');
      }

      // Stream the response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullSummary = '';

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
              fullSummary += content;
              setSummary(fullSummary);
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
              fullSummary += content;
              setSummary(fullSummary);
            }
          } catch { /* ignore */ }
        }
      }

    } catch (err) {
      console.error('AI Secretary error:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar resumo');
      setSummary(generateFallbackSummary(tasks, profile?.full_name, assistantName));
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  }, [user, profile, userModules, fetchUserTickets, fetchUserKanbanCards]);

  return {
    summary,
    isLoading,
    error,
    generateSummary,
    tickets,
    ticketsLoading,
    kanbanCards,
    kanbanCardsLoading,
  };
}

function generateFallbackSummary(tasks: Task[], userName?: string | null, assistantName: string = 'Lyra'): string {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const name = userName?.split(' ')[0] || 'Usuário';
  
  const pending = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const overdue = pending.filter(t => {
    if (!t.due_date) return false;
    return new Date(t.due_date) < new Date();
  });
  const highPriority = pending.filter(t => (t.priority || 3) <= 2);

  let summary = `${greeting}, ${name}! Aqui é a ${assistantName}. `;

  if (pending.length === 0) {
    summary += 'Você não tem tarefas pendentes. Aproveite para revisar suas metas ou ajudar um colega.';
  } else if (overdue.length > 0) {
    summary += `Atenção: ${overdue.length} tarefa(s) atrasada(s). Recomendo começar por "${overdue[0].title}".`;
  } else if (highPriority.length > 0) {
    summary += `${highPriority.length} tarefa(s) de alta prioridade. Sugiro focar em "${highPriority[0].title}" primeiro.`;
  } else {
    summary += `${pending.length} tarefa(s) pendente(s). Comece pelo mais importante.`;
  }

  return summary;
}

// Hook for AI text refinement
export function useAIRefine() {
  const [isRefining, setIsRefining] = useState(false);

  const refineText = useCallback(async (
    text: string,
    context: 'ticket_title' | 'ticket_description' | 'comment' | 'resolution' | 'checklist_description'
  ): Promise<string> => {
    if (!text.trim()) return text;

    setIsRefining(true);
    try {
      const { session } = unwrap(await supabase.auth.getSession());
      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error('Sessão expirada');
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-refine`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ text, context }),
        }
      );

      if (!response.ok) {
        throw new Error('Erro ao refinar texto');
      }

      const data = await response.json();
      return data.refined || text;
    } catch (err) {
      console.error('AI Refine error:', err);
      return text;
    } finally {
      setIsRefining(false);
    }
  }, []);

  return { refineText, isRefining };
}
