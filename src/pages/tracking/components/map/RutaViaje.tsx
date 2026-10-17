import { Marker, Polyline, Tooltip } from 'react-leaflet';
import { useRutaOsrm } from '../../hooks/useRutaOsrm';
import type { ViajeDetalle } from '../../types';
import { COLOR_HEX } from '../../tracking-logic';
import { originIcon, stopIcon } from './icons';

/**
 * Viaje elegido en el mapa: ruta por calles (OSRM) —tramos ya hechos sólidos, pendientes atenuados— más la sede y
 * las paradas destacadas. Si OSRM no responde, solo se ven sede y paradas (sin líneas rectas).
 */
export default function RutaViaje({ detail }: { detail: ViajeDetalle }) {
  const { tramos, stopIds } = useRutaOsrm(detail);
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
      {detail.stops.filter((s) => s.lat != null && s.lng != null).map((s) => (
        <Marker
          key={s.id}
          position={[s.lat!, s.lng!]}
          icon={stopIcon(s.sequence, s.state, s.id === detail.next_stop_id)}
          zIndexOffset={s.id === detail.next_stop_id ? 500 : 0}
        >
          <Tooltip direction="top">{`${s.sequence}. ${s.customer_name ?? s.order_number}`}</Tooltip>
        </Marker>
      ))}
    </>
  );
}
