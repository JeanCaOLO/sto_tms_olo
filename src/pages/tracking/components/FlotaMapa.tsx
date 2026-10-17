import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { Viaje, ViajeDetalle } from '../types';
import { COLOR_HEX, positioned } from '../tracking-logic';
import ReplayLayer from './map/ReplayLayer';
import RutaViaje from './map/RutaViaje';
import TruckMarker from './map/TruckMarker';

interface Props {
  /** Cambia al elegir otro país, modo o KPI: el mapa vuelve a encuadrar la flota visible. */
  fitKey: string;
  viajes: Viaje[];
  selectedId: string | null;
  /** Detalle del viaje elegido (mismo id) o null. */
  detail: ViajeDetalle | null;
  replaying: boolean;
  onSelect: (id: string) => void;
  onReplayClose: () => void;
}

// Costa Rica: vista inicial cuando todavía no hay ningún camión con posición.
const DEFAULT_CENTER: [number, number] = [9.93, -84.08];
const DEFAULT_ZOOM = 8;
// Tiles configurables: el servidor público de OSM no admite carga de producción (usar un proveedor con SLA).
const TILES_URL = import.meta.env.VITE_MAP_TILES_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

/** Encuadra la flota al cargar, al cambiar `fitKey` y al deseleccionar; al elegir un viaje lo enfoca con sus paradas. */
function Vista({ viajes, selectedId, detail, fitKey }: Pick<Props, 'viajes' | 'selectedId' | 'detail' | 'fitKey'>) {
  const map = useMap();
  const fleetFitFor = useRef<string | null>(null);
  const focusedFor = useRef<string | null>(null);

  // Abrir/cerrar el panel cambia el ancho del mapa: Leaflet debe recalcular su tamaño o recorta capas y encuadres.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  useEffect(() => {
    if (selectedId) return;
    focusedFor.current = null;
    if (fleetFitFor.current === fitKey) return;
    const points = positioned(viajes).map((v) => [v.position!.lat, v.position!.lng] as [number, number]);
    if (!points.length) return;
    fleetFitFor.current = fitKey;
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
  }, [map, viajes, selectedId, fitKey]);

  useEffect(() => {
    // Se enfoca una vez por selección y solo cuando ya llegó su detalle (paradas), para encuadrar todo el viaje.
    if (!selectedId || !detail || focusedFor.current === selectedId) return;
    const points: [number, number][] = [];
    if (detail.position) points.push([detail.position.lat, detail.position.lng]);
    if (detail.origin) points.push([detail.origin.lat, detail.origin.lng]);
    detail.stops.forEach((s) => { if (s.lat != null && s.lng != null) points.push([s.lat, s.lng]); });
    if (!points.length) return;
    focusedFor.current = selectedId;
    fleetFitFor.current = null; // al deseleccionar, volver a encuadrar la flota
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
  }, [map, selectedId, detail]);

  return null;
}

/** Mapa de la flota: un camión por viaje (color = señal) y, del viaje elegido, su ruta por calles y paradas. */
export default function FlotaMapa({ fitKey, viajes, selectedId, detail, replaying, onSelect, onReplayClose }: Props) {
  const { t } = useTranslation();
  const trucks = useMemo(() => positioned(viajes), [viajes]);
  const replayOf = replaying && detail ? detail : null;

  return (
    <div className="relative isolate h-full min-h-[320px] rounded-lg overflow-hidden border border-slate-200">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="w-full h-full" scrollWheelZoom>
        <TileLayer url={TILES_URL} attribution="&copy; OpenStreetMap" />
        {detail && !replayOf && <RutaViaje detail={detail} />}
        {trucks.filter((v) => v.id !== replayOf?.id).map((v) => (
          <TruckMarker
            key={v.id}
            id={v.id}
            lat={v.position!.lat}
            lng={v.position!.lng}
            color={COLOR_HEX[v.color]}
            selected={v.id === selectedId}
            alert={v.alerts.length > 0}
            label={`${v.route_number} · ${v.driver_name ?? v.plate ?? ''}`}
            onSelect={onSelect}
          />
        ))}
        {replayOf && <ReplayLayer key={replayOf.id} tripId={replayOf.id} color={COLOR_HEX[replayOf.color]} timezone={replayOf.timezone} onClose={onReplayClose} />}
        <Vista viajes={viajes} selectedId={selectedId} detail={detail} fitKey={fitKey} />
      </MapContainer>

      {!replayOf && (
        <ul className="absolute bottom-3 left-3 z-[1000] bg-white/95 rounded-lg shadow px-3 py-2 text-xs text-slate-700 space-y-1">
          {([
            ['green', 'tracking.legendOnline'],
            ['amber', 'tracking.legendStale'],
            ['gray', 'tracking.legendOffline'],
            ['blue', 'tracking.legendCompleted'],
          ] as const).map(([color, key]) => (
            <li key={color} className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: COLOR_HEX[color] }} />
              {t(key)}
            </li>
          ))}
        </ul>
      )}
      {!trucks.length && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 rounded-lg shadow px-3 py-1.5 text-xs text-slate-600">
          {t('tracking.noPosition')}
        </p>
      )}
    </div>
  );
}
