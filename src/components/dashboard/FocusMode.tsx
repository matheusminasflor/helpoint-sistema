import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  Pause,
  Sparkles
} from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { expectRows } from '@/lib/supabase-result';
import type { Task } from '@/types/database';
import { useAssistantName } from '@/hooks/useAssistantName';

interface FocusModeProps {
  task: Task;
  onExit: () => void;
  onComplete: () => void;
}

export function FocusMode({ task, onExit, onComplete }: FocusModeProps) {
  const assistantName = useAssistantName();
  const [isCompleting, setIsCompleting] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer effect - corrected from useState to useEffect
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // ESC key handler
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onExit();
  }, [onExit]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleComplete = async () => {
    setIsCompleting(true);
    try {
      // Regra 2: a escrita prova que gravou (zero linhas = policy não casou, e isso não é erro).
      expectRows(await supabase
        .from('tasks')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', task.id)
        .select('id'), 'a conclusão da tarefa');
      toast.success('Tarefa concluída.');
      onComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setIsCompleting(false);
    }
  };

  const getPriorityLabel = (priority: number) => {
    switch (priority) {
      case 1: return 'CRÍTICA';
      case 2: return 'ALTA';
      case 3: return 'MÉDIA';
      case 4: return 'BAIXA';
      default: return 'NORMAL';
    }
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'bg-priority-critical text-white';
      case 2: return 'bg-priority-high text-white';
      case 3: return 'bg-priority-medium text-black';
      case 4: return 'bg-priority-low text-white';
      default: return 'bg-priority-none text-white';
    }
  };

  return (
    <div className="focus-mode-overlay" role="dialog" aria-modal="true" aria-label="Modo Foco">
      {/* Exit Button */}
      <button
        type="button"
        onClick={onExit}
        aria-label="Sair do Modo Foco"
        className="absolute top-6 right-6 p-3 min-h-[44px] min-w-[44px] text-muted-foreground hover:text-foreground-bright transition-colors border border-border hover:border-primary"
      >
        <X className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
      </button>

      {/* Timer - Technical Style */}
      <div className="absolute top-6 left-6 border border-border bg-surface-1 px-4 py-2">
        <div className="flex items-center gap-3">
          <Clock className="w-4 h-4 text-primary" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-mono text-lg text-foreground-bright tracking-wider" role="timer" aria-live="off">{formatTime(elapsedTime)}</span>
        </div>
        <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">Tempo decorrido</span>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl w-full mx-4">
        {/* Priority Badge */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className={`px-4 py-1.5 text-xs font-mono font-bold uppercase tracking-widest ${getPriorityColor(task.priority)}`}>
            {getPriorityLabel(task.priority)}
          </span>
          {task.is_ai_suggested && (
            <span className="px-4 py-1.5 text-xs font-mono uppercase tracking-widest bg-primary text-primary-foreground flex items-center gap-2">
              <Sparkles className="w-3 h-3" aria-hidden="true" />
              Sugerido pela {assistantName}
            </span>
          )}
        </div>

        {/* Task Title */}
        <h1 className="text-3xl font-semibold text-center mb-4 text-foreground-bright">
          {task.title}
        </h1>

        {/* Task Description */}
        {task.description && (
          <p className="text-center text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
            {task.description}
          </p>
        )}

        {/* Task ID - Technical Style */}
        <div className="text-center mb-12 border-t border-b border-border py-3">
          <span className="font-mono text-[11px] text-muted-foreground uppercase tracking-widest">
            TAREFA: {task.id.slice(0, 8).toUpperCase()}
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            onClick={handleComplete}
            disabled={isCompleting}
            className="min-w-[240px] gap-2 h-14 text-sm font-mono uppercase tracking-wider bg-accent hover:bg-accent/90 text-accent-foreground"
          >
            <CheckCircle2 className="w-5 h-5" strokeWidth={1.5} aria-hidden="true" />
            {isCompleting ? 'Salvando...' : 'Concluir tarefa'}
          </Button>

          <Button
            variant="outline"
            size="lg"
            onClick={onExit}
            className="min-w-[180px] gap-2 h-12 font-mono uppercase tracking-wider"
          >
            <Pause className="w-4 h-4" strokeWidth={1.5} aria-hidden="true" />
            Pausar e sair
          </Button>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="mt-12 text-center">
          <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">
            Pressione <kbd className="px-2 py-1 bg-surface-2 border border-border font-mono text-[11px] mx-1">ESC</kbd> para sair do Modo Foco
          </p>
        </div>
      </div>

</div>
  );
}
