import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';

// GeoJSON Polygon/MultiPolygon tal como lo guarda el backend en zones.geofence
// (WGS84, coordenadas [lon, lat]). Leaflet trabaja con [lat, lng]: la conversión
// vive solo acá (toLatLngs / toGeoJSONGeometry).
export type GeoJSONGeometry = {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: number[][][] | number[][][][];
};

export interface ZoneShape {
  id: string;
  name: string;
  color: string | null;
  geofence: GeoJSONGeometry | null;
}

// Centros/zoom por país para encuadrar el mapa cuando no hay zonas que mostrar.
// ponytail: solo CR y VE (los dos países con datos hoy); si entra otro país sin
// zonas, cae al default mundial y el usuario reencuadra dibujando.
const COUNTRY_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  'costa rica': { center: [9.75, -84.0], zoom: 8 },
  venezuela: { center: [8.0, -66.0], zoom: 6 },
};
const DEFAULT_VIEW: { center: [number, number]; zoom: number } = { center: [8.5, -75], zoom: 4 };

const DEFAULT_COLOR = '#0ea5e9';

interface ZoneMapProps {
  // Zonas ya existentes a pintar (todas las del país elegido).
  shapes: ZoneShape[];
  // Nombre del país elegido (para encuadrar). Opcional.
  countryName?: string | null;
  // Modo edición: si viene, se habilita dibujar/editar UNA geocerca y cada
  // cambio llama onDraw con el GeoJSON resultante (o null si se borra).
  editable?: boolean;
  // Geometría inicial a editar (al abrir el modal de una zona existente).
  initialGeometry?: GeoJSONGeometry | null;
  editColor?: string | null;
  onDraw?: (geometry: GeoJSONGeometry | null) => void;
  // Resaltar una zona por id (hover desde la lista, opcional).
  highlightId?: string | null;
  className?: string;
}

type Ring = L.LatLngExpression[];

/** GeoJSON geometry [lon,lat] -> anillos Leaflet [lat,lng]. Polygon: [exterior, ...huecos].
 *  MultiPolygon: una lista de polígonos (L.polygon la pinta como varias partes; aplanarla
 *  convertiría la segunda parte en un hueco de la primera). */
function toLatLngs(geom: GeoJSONGeometry): Ring[] | Ring[][] {
  const ring = (r: number[][]): Ring => r.map(([lon, lat]) => [lat, lon] as L.LatLngExpression);
  if (geom.type === 'Polygon') return (geom.coordinates as number[][][]).map(ring);
  return (geom.coordinates as number[][][][]).map((poly) => poly.map(ring));
}

/** Capa Leaflet (polígono dibujado) -> GeoJSON geometry [lon,lat]. */
function toGeoJSONGeometry(layer: L.Layer): GeoJSONGeometry | null {
  const gj = (layer as L.Polygon).toGeoJSON?.();
  if (!gj || gj.type !== 'Feature') return null;
  const geom = gj.geometry;
  if (geom.type !== 'Polygon' && geom.type !== 'MultiPolygon') return null;
  return geom as GeoJSONGeometry;
}

export default function ZoneMap({
  shapes,
  countryName,
  editable = false,
  initialGeometry = null,
  editColor,
  onDraw,
  highlightId = null,
  className = 'h-[480px] w-full rounded-lg',
}: ZoneMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const shapesLayerRef = useRef<L.LayerGroup | null>(null);
  const editLayerRef = useRef<L.FeatureGroup | null>(null);
  const onDrawRef = useRef(onDraw);
  onDrawRef.current = onDraw;
  const editColorRef = useRef(editColor);
  editColorRef.current = editColor;

  // Monta el mapa una sola vez.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || mapRef.current) return;
    const map = L.map(el, { center: DEFAULT_VIEW.center, zoom: DEFAULT_VIEW.zoom });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);
    shapesLayerRef.current = L.layerGroup().addTo(map);
    editLayerRef.current = L.featureGroup().addTo(map);
    mapRef.current = map;

    // Dentro de un modal/contenedor con scroll, el contenedor aún no tiene su
    // tamaño final al montar: Leaflet calcula mal y los tiles se dibujan fuera
    // de lugar (franja azul). invalidateSize al estabilizar + ResizeObserver lo
    // corrige. ponytail: el rAF cubre el primer layout; el observer, los cambios.
    const fix = () => map.invalidateSize();
    const raf = requestAnimationFrame(fix);
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fix) : null;
    ro?.observe(el);

    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Encuadra al cambiar de país (si no hay zonas con cerca, usa el view del país).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const withFence = shapes.filter((s) => s.geofence);
    if (withFence.length > 0) {
      const bounds = L.latLngBounds([]);
      withFence.forEach((s) => bounds.extend(L.polygon(toLatLngs(s.geofence!)).getBounds()));
      if (bounds.isValid()) { map.fitBounds(bounds, { padding: [30, 30] }); return; }
    }
    const view = (countryName && COUNTRY_VIEW[countryName.trim().toLowerCase()]) || DEFAULT_VIEW;
    map.setView(view.center, view.zoom);
  }, [countryName, shapes]);

  // Pinta las zonas existentes.
  useEffect(() => {
    const group = shapesLayerRef.current;
    if (!group) return;
    group.clearLayers();
    for (const s of shapes) {
      if (!s.geofence) continue;
      const color = s.color || DEFAULT_COLOR;
      const highlighted = highlightId === s.id;
      const poly = L.polygon(toLatLngs(s.geofence), {
        color,
        weight: highlighted ? 4 : 2,
        fillColor: color,
        fillOpacity: highlighted ? 0.35 : 0.15,
      });
      poly.bindTooltip(s.name, { sticky: true });
      group.addLayer(poly);
    }
  }, [shapes, highlightId]);

  // Modo edición: geoman para dibujar/editar UNA geocerca.
  useEffect(() => {
    const map = mapRef.current;
    const editGroup = editLayerRef.current;
    if (!map || !editGroup) return;

    editGroup.clearLayers();

    if (!editable) {
      map.pm?.removeControls();
      return;
    }

    const color = editColor || DEFAULT_COLOR;  // el color luego cambia sin reconstruir (efecto de abajo)

    // Pinta la geometría inicial como capa editable.
    if (initialGeometry) {
      const poly = L.polygon(toLatLngs(initialGeometry), { color, fillColor: color, fillOpacity: 0.2 });
      editGroup.addLayer(poly);
      const b = poly.getBounds();
      if (b.isValid()) map.fitBounds(b, { padding: [30, 30] });
    }

    map.pm.addControls({
      position: 'topright',
      drawMarker: false,
      drawCircle: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
    });
    map.pm.setGlobalOptions({ layerGroup: editGroup });

    // Solo UNA geocerca por zona: al crear una nueva, borra la anterior.
    const emit = () => {
      const layers = editGroup.getLayers();
      const last = layers[layers.length - 1];
      onDrawRef.current?.(last ? toGeoJSONGeometry(last) : null);
    };
    const onCreate = (e: { layer: L.Layer }) => {
      editGroup.getLayers().forEach((l) => { if (l !== e.layer) editGroup.removeLayer(l); });
      const current = editColorRef.current || DEFAULT_COLOR;
      (e.layer as L.Polygon).setStyle?.({ color: current, fillColor: current, fillOpacity: 0.2 });
      e.layer.on('pm:edit', emit);
      emit();
    };
    const onRemove = () => emit();

    map.on('pm:create', onCreate);
    map.on('pm:remove', onRemove);
    editGroup.getLayers().forEach((l) => l.on('pm:edit', emit));

    return () => {
      map.off('pm:create', onCreate);
      map.off('pm:remove', onRemove);
      map.pm?.removeControls();
    };
    // initialGeometry solo importa al (re)abrir en modo edición. editColor NO va aquí:
    // reconstruir borraría lo que el usuario ya dibujó y volvería a la forma inicial.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, initialGeometry]);

  // Cambiar el color mientras se edita solo repinta la geocerca que esté dibujada.
  useEffect(() => {
    const color = editColor || DEFAULT_COLOR;
    editLayerRef.current?.getLayers().forEach((l) => (l as L.Polygon).setStyle?.({ color, fillColor: color }));
  }, [editColor]);

  return <div ref={containerRef} className={className} />;
}
