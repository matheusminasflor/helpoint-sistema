import { useCallback, useRef } from 'react';
import type { Node, Edge } from '@xyflow/react';

interface Snapshot {
  nodes: Node[];
  edges: Edge[];
}

const MAX_HISTORY = 50;

export function useUndoRedo() {
  const history = useRef<Snapshot[]>([]);
  const pointer = useRef(-1);
  const skipNext = useRef(false);

  const saveSnapshot = useCallback((nodes: Node[], edges: Edge[]) => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    // Remove any future states after current pointer
    history.current = history.current.slice(0, pointer.current + 1);
    // Deep clone to avoid reference issues
    history.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(edges)),
    });
    // Trim to max
    if (history.current.length > MAX_HISTORY) {
      history.current = history.current.slice(-MAX_HISTORY);
    }
    pointer.current = history.current.length - 1;
  }, []);

  const undo = useCallback((): Snapshot | null => {
    if (pointer.current <= 0) return null;
    pointer.current -= 1;
    skipNext.current = true;
    return JSON.parse(JSON.stringify(history.current[pointer.current]));
  }, []);

  const redo = useCallback((): Snapshot | null => {
    if (pointer.current >= history.current.length - 1) return null;
    pointer.current += 1;
    skipNext.current = true;
    return JSON.parse(JSON.stringify(history.current[pointer.current]));
  }, []);

  const canUndo = pointer.current > 0;
  const canRedo = pointer.current < history.current.length - 1;

  return { saveSnapshot, undo, redo, canUndo, canRedo };
}
