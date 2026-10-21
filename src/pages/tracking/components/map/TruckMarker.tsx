import { memo, useMemo } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import { truckIcon } from './icons';

interface Props {
  id: string;
  lat: number;
  lng: number;
  color: string;
  selected: boolean;
  alert: boolean;
  label: string;
  onSelect: (id: string) => void;
}

/** Camión de un viaje. Memoizado: un refresco que no lo cambia no toca su marcador en Leaflet. */
function TruckMarker({ id, lat, lng, color, selected, alert, label, onSelect }: Props) {
  const handlers = useMemo(() => ({ click: () => onSelect(id) }), [id, onSelect]);
  return (
    <Marker position={[lat, lng]} icon={truckIcon(color, selected, alert)} zIndexOffset={selected ? 1000 : 0} eventHandlers={handlers}>
      <Tooltip direction="top">{label}</Tooltip>
    </Marker>
  );
}

export default memo(TruckMarker);
