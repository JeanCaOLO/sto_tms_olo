import { useCallback, useEffect, useRef, useState } from 'react';
import { REPLAY_BASE_MS } from '../replay-logic';

const TICK_MS = 50;

/** Reloj del replay: avanza `progress` (0 a 1) a `speed`× sobre REPLAY_BASE_MS y se detiene al llegar al final. */
export function useReplay() {
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const speedRef = useRef(speed);
  speedRef.current = speed;

  useEffect(() => {
    if (!playing) return undefined;
    const timer = setInterval(() => {
      setProgress((p) => Math.min(1, p + (TICK_MS * speedRef.current) / REPLAY_BASE_MS));
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    if (progress >= 1 && playing) setPlaying(false);
  }, [progress, playing]);

  const toggle = useCallback(() => {
    setProgress((p) => (p >= 1 ? 0 : p));
    setPlaying((v) => !v);
  }, []);
  const seek = useCallback((value: number) => { setProgress(Math.min(1, Math.max(0, value))); }, []);
  const reset = useCallback(() => { setPlaying(false); setProgress(0); }, []);

  return { progress, playing, speed, setSpeed, toggle, seek, reset };
}
