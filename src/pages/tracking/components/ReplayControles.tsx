import { useTranslation } from 'react-i18next';
import { REPLAY_SPEEDS } from '../replay-logic';
import { formatClock } from '../tracking-logic';

const btn = 'w-8 h-8 flex items-center justify-center rounded-md text-slate-700 hover:bg-slate-200 cursor-pointer';

interface Props {
  progress: number;
  playing: boolean;
  speed: number;
  /** Instante (ms epoch) que muestra el replay. */
  at: number;
  timezone: string | null;
  stops: number;
  onToggle: () => void;
  onSeek: (value: number) => void;
  onSpeed: (value: number) => void;
  onClose: () => void;
}

/** Barra de reproducción del recorrido: play/pausa, línea de tiempo, velocidad y hora que se está viendo. */
export default function ReplayControles({ progress, playing, speed, at, timezone, stops, onToggle, onSeek, onSpeed, onClose }: Props) {
  const { t } = useTranslation();
  // Dos filas: los botones arriba y la línea de tiempo abajo a todo el ancho, para que no se aplaste en un mapa angosto.
  return (
    <div className="w-full space-y-1 rounded-lg bg-white/95 px-3 py-2 shadow" role="group" aria-label={t('tracking.replayTitle')}>
      <div className="flex items-center gap-2">
        <button type="button" className={btn} onClick={onToggle} aria-label={playing ? t('tracking.simPause') : t('tracking.simPlay')} title={playing ? t('tracking.simPause') : t('tracking.simPlay')}>
          <i className={playing ? 'ri-pause-fill' : 'ri-play-fill'} />
        </button>
        <span className="text-xs font-semibold text-slate-700 tabular-nums">{formatClock(new Date(at).toISOString(), timezone) ?? '--:--'}</span>
        <select
          value={speed}
          onChange={(e) => onSpeed(Number(e.target.value))}
          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-xs"
          aria-label={t('tracking.replaySpeed')}
        >
          {REPLAY_SPEEDS.map((s) => <option key={s} value={s}>{`${s}×`}</option>)}
        </select>
        <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{t('tracking.replayStops', { count: stops })}</span>
        <button type="button" className={btn} onClick={onClose} aria-label={t('tracking.replayExit')} title={t('tracking.replayExit')}>
          <i className="ri-close-line" />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={1000}
        value={Math.round(progress * 1000)}
        onChange={(e) => onSeek(Number(e.target.value) / 1000)}
        className="block w-full accent-teal-600"
        aria-label={t('tracking.replayTimeline')}
      />
    </div>
  );
}
