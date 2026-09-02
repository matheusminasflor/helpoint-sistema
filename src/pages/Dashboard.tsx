import { useState, useEffect, useCallback } from 'react';
import { DailyCuration } from '@/components/dashboard/DailyCuration';
import { FocusMode } from '@/components/dashboard/FocusMode';
import type { Task } from '@/types/database';

export default function Dashboard() {
  const [focusTask, setFocusTask] = useState<Task | null>(null);
  const [key, setKey] = useState(0);

  const handleEnterFocusMode = (task: Task) => {
    setFocusTask(task);
  };

  const handleExitFocusMode = () => {
    setFocusTask(null);
  };

  const handleCompleteTask = () => {
    setFocusTask(null);
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
        onComplete={handleCompleteTask}
      />
    );
  }

  return (
    <DailyCuration 
      key={key}
      onEnterFocusMode={handleEnterFocusMode} 
    />
  );
}
