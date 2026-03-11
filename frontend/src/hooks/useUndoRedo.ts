"use client";

import { useState, useCallback, useRef } from "react";

const MAX_HISTORY = 50;

interface UndoRedoState<T> {
  state: T;
  set: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo<T>(initialState: T): UndoRedoState<T> {
  const [present, setPresent] = useState<T>(initialState);
  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  // Force re-render when refs change
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const set = useCallback(
    (newState: T) => {
      pastRef.current = [...pastRef.current, present].slice(-MAX_HISTORY);
      futureRef.current = [];
      setPresent(newState);
      bump();
    },
    [present, bump],
  );

  const undo = useCallback(() => {
    const past = pastRef.current;
    if (past.length === 0) return;

    const previous = past[past.length - 1];
    pastRef.current = past.slice(0, -1);
    futureRef.current = [present, ...futureRef.current];
    setPresent(previous);
    bump();
  }, [present, bump]);

  const redo = useCallback(() => {
    const future = futureRef.current;
    if (future.length === 0) return;

    const next = future[0];
    futureRef.current = future.slice(1);
    pastRef.current = [...pastRef.current, present];
    setPresent(next);
    bump();
  }, [present, bump]);

  return {
    state: present,
    set,
    undo,
    redo,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
  };
}
