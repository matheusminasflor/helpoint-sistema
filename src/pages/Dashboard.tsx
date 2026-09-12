import { useState, useEffect, useCallback } from 'react';
import { DailyCuration } from '@/components/dashboard/DailyCuration';
import { FocusMode } from '@/components/dashboard/FocusMode';
import { TaskDetailDialog } from '@/components/dashboard/TaskDetailDialog';
import type { Task } from '@/types/database';

/**
 * Curadoria do dia. O modo foco só abre por escolha do atendente (botão
 * "Focar" ou "Modo foco" no painel da tarefa); o clique numa tarefa abre o
 * painel dela — o dono concluiu uma tarefa de cobrança achando que era o
 * chamado que a originou (2026-09-12).
 */
export default function Dashboard() {
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [key, setKey] = useState(0);

  const handleEnterFocusMode = (task: Task) => {
    setOpenTask(null);
    setFocusTask(task);
  };

  const handleExitFocusMode = () => {
    setFocusTask(null);
  };

  const refresh = () => {
    setFocusTask(null);
    setOpenTask(null);
    // Force refresh of task list
    setKey(prev => prev + 1);
  };

  // Handle ESC key to exit focus mode
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && focusTask) {
      handleExitFocusMode();
    }
  }, [focusTask]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (focusTask) {
    return (
      <FocusMode
        task={focusTask}
        onExit={handleExitFocusMode}
        onComplete={refresh}
      />
    );
  }

  return (
    <>
      <DailyCuration
        key={key}
        onEnterFocusMode={handleEnterFocusMode}
        onOpenTask={setOpenTask}
      />
      <TaskDetailDialog task={openTask} onOpenChange={(o) => !o && setOpenTask(null)} onFocus={handleEnterFocusMode} onCompleted={refresh} />
    </>
  );
}
