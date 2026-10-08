// State for line exclusions and order marks.

import { useState, useCallback } from 'react';

export function useExclusionsState() {
  const [excludedSeqs, setExcludedSeqs] = useState<Set<number>>(new Set());

  const toggleExcluded = useCallback((seq: number) => {
    setExcludedSeqs((prev) => {
      const next = new Set(prev);
      if (next.has(seq)) next.delete(seq);
      else next.add(seq);
      return next;
    });
  }, []);

  const resetExcluded = useCallback(() => {
    setExcludedSeqs(new Set());
  }, []);

  return {
    excludedSeqs,
    setExcludedSeqs,
    toggleExcluded,
    resetExcluded,
  };
}
