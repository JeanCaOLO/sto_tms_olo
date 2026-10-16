import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useTranslation } from 'react-i18next';
import type { Viaje, ViajeDetalle } from '../types';
import { COLOR_HEX, STOP_COLOR_HEX, positioned } from '../tracking-logic';

interface Props {
  viajes: Viaje[];
  selectedId: string | null;
  detail: ViajeDetalle | null;
  onSelect: (id: string) => void;
}

// Costa Rica: vista inicial cuando todavía no hay ningún camión con posición.
const DEFAULT_CENTER: [number, number] = [9.93, -84.08];
const DEFAULT_ZOOM = 8;

const truckIcon = (color: string, selected: boolean, alert: boolean) => {
  const size = selected ? 38 : 30;
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};color:#fff;
      position:relative;display:flex;align-items:center;justify-content:center;font-size:${selected ? 20 : 16}px;
      border:3px solid #fff;box-shadow:0 0 0 ${selected ? 3 : 0}px ${color},0 1px 4px rgba(0,0,0,.45);">
      <i class="ri-truck-fill"></i>${alert ? '<span style="position:absolute;top:-3px;right:-3px;width:12px;height:12px;border-radius:9999px;background:#dc2626;border:2px solid #fff;"></span>' : ''}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const stopIcon = (n: number, color: string) =>
  L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:9999px;background:${color};color:#fff;
      display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;
      border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4);">${n}</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });

/** Encuadra todos los camiones una sola vez y, al elegir un viaje, lo enfoca con sus paradas. */
function Vista({ viajes, selectedId, detail }: Pick<Props, 'viajes' | 'selectedId' | 'detail'>) {
  const map = useMap();
  const fittedAll = useRef(false);
  const focusedFor = useRef<string | null>(null);

  useEffect(() => {
    if (selectedId || fittedAll.current) return;
    const points = positioned(viajes).map((v) => [v.position!.lat, v.position!.lng] as [number, number]);
    if (points.length) {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
      fittedAll.current = true;
    }
  }, [map, viajes, selectedId]);

  useEffect(() => {
    if (!selectedId) { focusedFor.current = null; return; }
    const shown = detail && detail.id === selectedId ? detail : null;
    const selected = viajes.find((v) => v.id === selectedId);
    // Se enfoca una vez por selección y solo cuando ya llegó el detalle (paradas), para encuadrar todo el viaje.
    if (focusedFor.current === selectedId || !shown) return;
    const points: [number, number][] = [];
    if (selected?.position) points.push([selected.position.lat, selected.position.lng]);
    shown?.stops.forEach((s) => { if (s.lat != null && s.lng != null) points.push([s.lat, s.lng]); });
    if (!points.length) return;
    focusedFor.current = selectedId;
    map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 14 });
  }, [map, selectedId, viajes, detail]);

  return null;
}

/** Mapa de la flota: un camión por viaje con posición (color = estado/señal) y, del viaje elegido, rastro y paradas. */
export default function FlotaMapa({ viajes, selectedId, detail, onSelect }: Props) {
  const { t } = useTranslation();
  const trucks = useMemo(() => positioned(viajes), [viajes]);
  const shown = detail && detail.id === selectedId ? detail : null;

  return (
    <div className="relative isolate h-full min-h-[320px] rounded-lg overflow-hidden border border-slate-200">
      <MapContainer center={DEFAULT_CENTER} zoom={DEFAULT_ZOOM} className="w-full h-full" scrollWheelZoom>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {shown && shown.trail.length > 1 && (
          <Polyline
            positions={shown.trail.map((p) => [p.lat, p.lng] as [number, number])}
            pathOptions={{ color: COLOR_HEX[shown.color], weight: 3, opacity: 0.7 }}
          />
        )}
        {shown?.stops.filter((s) => s.lat != null && s.lng != null).map((s) => (
          <Marker key={s.id} position={[s.lat!, s.lng!]} icon={stopIcon(s.sequence, STOP_COLOR_HEX[s.state])}>
            <Tooltip direction="top">{s.customer_name ?? s.order_number}</Tooltip>
          </Marker>
        ))}
        {trucks.map((v) => (
          <Marker
            key={v.id}
            position={[v.position!.lat, v.position!.lng]}
            icon={truckIcon(COLOR_HEX[v.color], v.id === selectedId, v.alerts.length > 0)}
            zIndexOffset={v.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(v.id) }}
          >
            <Tooltip direction="top">{`${v.route_number} · ${v.driver_name ?? v.plate ?? ''}`}</Tooltip>
          </Marker>
        ))}
        <Vista viajes={viajes} selectedId={selectedId} detail={detail} />
      </MapContainer>

      <ul className="absolute bottom-3 left-3 z-[500] bg-white/95 rounded-lg shadow px-3 py-2 text-xs text-slate-700 space-y-1">
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
      {!trucks.length && (
        <p className="absolute top-3 left-1/2 -translate-x-1/2 z-[500] bg-white/95 rounded-lg shadow px-3 py-1.5 text-xs text-slate-600">
          {t('tracking.noPosition')}
        </p>
      )}
    </div>
  );
}
