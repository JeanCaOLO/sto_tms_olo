import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { CircleMarker, Marker, Polyline, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import { useReplay } from '../../hooks/useReplay';
import { useRecorrido } from '../../hooks/useViajesEnVivo';
import { detectStops, pointAt, validTrail } from '../../replay-logic';
import ReplayControles from '../ReplayControles';
import { truckIcon } from './icons';

interface Props {
  tripId: string;
  color: string;
  timezone: string | null;
  onClose: () => void;
}

/**
 * Reproducción del recorrido real (GPS) de un viaje. Pide el recorrido UNA vez (queda fijo aunque el viaje siga
 * en curso) y su reloj vive aquí: los 20 cuadros/s no vuelven a pintar la página ni el resto del mapa.
 */
export default function ReplayLayer({ tripId, color, timezone, onClose }: Props) {
  const { t } = useTranslation();
  const recorrido = useRecorrido(tripId);
  const clock = useReplay();
  const trail = useMemo(() => validTrail(recorrido?.data?.points ?? []), [recorrido?.data]);
  const stops = useMemo(() => detectStops(trail), [trail]);
  const point = pointAt(trail, clock.progress);
  const controls = useRef<HTMLDivElement>(null);
  const { toggle } = clock;

  // Arranca solo al llegar el recorrido; los clics en la barra no deben arrastrar ni hacer zoom en el mapa.
  useEffect(() => { if (trail.length > 1) toggle(); }, [trail, toggle]);
  useEffect(() => {
    if (controls.current) { L.DomEvent.disableClickPropagation(controls.current); L.DomEvent.disableScrollPropagation(controls.current); }
  });

  const overlay = (children: ReactNode) => (
    <div ref={controls} className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[1000] w-[min(92%,560px)]">{children}</div>
  );

  if (!recorrido || (!recorrido.data && !recorrido.error)) return overlay(<p className="rounded-lg bg-white/95 px-3 py-2 text-xs shadow">{t('tracking.loading')}</p>);
  if (!point) {
    return overlay(
      <p className="flex items-center justify-between gap-2 rounded-lg bg-white/95 px-3 py-2 text-xs shadow">
        {recorrido.error ? t('tracking.replayError') : t('tracking.replayEmpty')}
        <button type="button" onClick={onClose} className="underline cursor-pointer">{t('tracking.replayExit')}</button>
      </p>,
    );
  }
  return (
    <>
      <Polyline positions={trail.map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: '#94a3b8', weight: 3, opacity: 0.6, dashArray: '6 6' }} />
      <Polyline
        positions={[...trail.slice(0, point.index + 1).map((p) => [p.lat, p.lng] as [number, number]), [point.lat, point.lng] as [number, number]]}
        pathOptions={{ color, weight: 4, opacity: 0.9 }}
      />
      {stops.map((s) => (
        <CircleMarker key={s.fromMs} center={[s.lat, s.lng]} radius={8} pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 0.8, weight: 2 }}>
          <Tooltip direction="top">{t('tracking.replayStopTip', { min: Math.round((s.toMs - s.fromMs) / 60000) })}</Tooltip>
        </CircleMarker>
      ))}
      <Marker position={[point.lat, point.lng]} icon={truckIcon(color, true, false)} zIndexOffset={2000} />
      {overlay(
        <ReplayControles
          progress={clock.progress}
          playing={clock.playing}
          speed={clock.speed}
          at={point.at}
          timezone={timezone}
          stops={stops.length}
          onToggle={clock.toggle}
          onSeek={clock.seek}
          onSpeed={clock.setSpeed}
          onClose={onClose}
        />,
      )}
    </>
  );
}
