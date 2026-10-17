import { useEffect, useMemo, useState } from 'react';
import { Marker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { useTranslation } from 'react-i18next';
import type { Viaje } from '../../types';
import { COLOR_HEX } from '../../tracking-logic';
import { clusterPoints } from './cluster';
import { clusterIcon } from './icons';
import TruckMarker from './TruckMarker';

const RADIUS_PX = 36; // ~ el ancho de un ícono de camión: más cerca se encimarían
const NO_CLUSTER_ZOOM = 16; // de cerca siempre se ven los camiones sueltos

interface Props {
  trucks: Viaje[];
  selectedId: string | null;
  /** Viaje en replay: su camión en vivo no se dibuja. */
  hiddenId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Camiones de la flota. Los que en pantalla se encimarían se agrupan en una burbuja con el número (roja si
 * alguno tiene alerta); clic en la burbuja acerca el mapa hasta separarlos. El elegido nunca se agrupa.
 */
export default function FlotaCamiones({ trucks, selectedId, hiddenId, onSelect }: Props) {
  const { t } = useTranslation();
  const map = useMap();
  const [view, setView] = useState(0); // cambia al mover o hacer zoom: recalcular grupos
  useEffect(() => {
    const bump = () => setView((v) => v + 1);
    map.on('zoomend moveend', bump);
    return () => { map.off('zoomend moveend', bump); };
  }, [map]);

  const visible = useMemo(() => trucks.filter((v) => v.id !== hiddenId), [trucks, hiddenId]);
  const byId = useMemo(() => new Map(visible.map((v) => [v.id, v])), [visible]);
  const clusters = useMemo(() => {
    const free = visible.filter((v) => v.id !== selectedId);
    if (map.getZoom() >= NO_CLUSTER_ZOOM) return free.map((v) => ({ ids: [v.id] }));
    const points = free.map((v) => {
      const p = map.latLngToContainerPoint([v.position!.lat, v.position!.lng]);
      return { id: v.id, x: p.x, y: p.y };
    });
    return clusterPoints(points, RADIUS_PX);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, selectedId, map, view]);

  const single = (v: Viaje) => (
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
  );

  const selected = selectedId ? byId.get(selectedId) : undefined;
  return (
    <>
      {clusters.map((c) => {
        const members = c.ids.map((id) => byId.get(id)!).filter(Boolean);
        if (members.length === 1) return single(members[0]);
        const bounds = L.latLngBounds(members.map((v) => [v.position!.lat, v.position!.lng] as [number, number]));
        const alert = members.some((v) => v.alerts.length > 0);
        return (
          <Marker
            key={`grupo-${c.ids.join('-')}`}
            position={bounds.getCenter()}
            icon={clusterIcon(members.length, alert)}
            eventHandlers={{ click: () => map.fitBounds(bounds.pad(0.3), { maxZoom: NO_CLUSTER_ZOOM }) }}
          >
            <Tooltip direction="top">{t('tracking.clusterTip', { count: members.length })}</Tooltip>
          </Marker>
        );
      })}
      {selected && single(selected)}
    </>
  );
}
