import { useEffect, useMemo, useState } from 'react';
import { Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import type L from 'leaflet';
import { useRutaOsrm } from '../../hooks/useRutaOsrm';
import type { ViajeDetalle } from '../../types';
import { COLOR_HEX } from '../../tracking-logic';
import { clusterPoints } from './cluster';
import { originIcon, stopIcon } from './icons';

const STOP_RADIUS_PX = 26; // paradas más cerca que esto (o en el mismo punto) se abren en abanico para verlas todas

/**
 * Viaje elegido en el mapa: ruta por calles (OSRM) —tramos ya hechos sólidos, pendientes atenuados— más la sede y
 * las paradas destacadas. Si OSRM no responde, solo se ven sede y paradas (sin líneas rectas).
 */
export default function RutaViaje({ detail }: { detail: ViajeDetalle }) {
  const { tramos, stopIds } = useRutaOsrm(detail);
  const map = useMap();
  const [view, setView] = useState(0); // cambia al mover o hacer zoom: recalcular el abanico
  useEffect(() => {
    const bump = () => setView((v) => v + 1);
    map.on('zoomend moveend', bump);
    return () => { map.off('zoomend moveend', bump); };
  }, [map]);
  // Pedidos de la misma dirección traen las mismas coordenadas: sin esto un marcador tapa a los demás (se ve 1, 4, 5
  // y faltan 2 y 3). Cada grupo encimado se abre en círculo alrededor de su centro, solo para dibujar.
  const placed = useMemo(() => {
    const withCoords = detail.stops.filter((s) => s.lat != null && s.lng != null);
    const points = withCoords.map((s) => {
      const p = map.latLngToContainerPoint([s.lat!, s.lng!]);
      return { id: s.id, x: p.x, y: p.y };
    });
    const at = new Map<string, L.LatLng | [number, number]>();
    for (const c of clusterPoints(points, STOP_RADIUS_PX)) {
      const n = c.ids.length;
      const ring = n === 1 ? 0 : Math.max(STOP_RADIUS_PX, STOP_RADIUS_PX / (2 * Math.sin(Math.PI / n)));
      c.ids.forEach((id, i) => {
        const stop = withCoords.find((s) => s.id === id)!;
        if (n === 1) { at.set(id, [stop.lat!, stop.lng!]); return; }
        const a = (2 * Math.PI * i) / n - Math.PI / 2;
        at.set(id, map.containerPointToLatLng([c.x + ring * Math.cos(a), c.y + ring * Math.sin(a)]));
      });
    }
    return { withCoords, at };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.stops, map, view]);
  const color = COLOR_HEX[detail.color];
  const stateOf = new Map(detail.stops.map((s) => [s.id, s.state]));
  return (
    <>
      {tramos.map((tramo, i) => {
        const to = stopIds[i + 1];
        const done = to != null && stateOf.get(to) !== 'pending';
        return tramo.length > 1 ? (
          <Polyline
            key={`${detail.id}-t${i}`}
            positions={tramo}
            pathOptions={done ? { color, weight: 5, opacity: 0.85 } : { color, weight: 4, opacity: 0.75, dashArray: '2 8', lineCap: 'round' }}
          />
        ) : null;
      })}
      {detail.origin && (
        <Marker position={[detail.origin.lat, detail.origin.lng]} icon={originIcon()}>
          <Tooltip direction="top">{detail.origin.name ?? ''}</Tooltip>
        </Marker>
      )}
      {placed.withCoords.map((s) => (
        <Marker
          key={s.id}
          position={placed.at.get(s.id)!}
          icon={stopIcon(s.sequence, s.state, s.id === detail.next_stop_id)}
          zIndexOffset={s.id === detail.next_stop_id ? 500 : 0}
        >
          <Tooltip direction="top">{`${s.sequence}. ${s.customer_name ?? s.order_number}`}</Tooltip>
        </Marker>
      ))}
    </>
  );
}
