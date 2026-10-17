// Íconos Leaflet cacheados: un divIcon por combinación, para no recrearlos (ni llamar setIcon) en cada refresco.
import L from 'leaflet';
import type { StopState } from '../../types';
import { STOP_COLOR_HEX } from '../../tracking-logic';

const cache = new Map<string, L.DivIcon>();

function cached(key: string, build: () => L.DivIcon): L.DivIcon {
  let icon = cache.get(key);
  if (!icon) { icon = build(); cache.set(key, icon); }
  return icon;
}

export function truckIcon(color: string, selected: boolean, alert: boolean): L.DivIcon {
  return cached(`truck|${color}|${selected}|${alert}`, () => {
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
  });
}

/** Parada destacada: grande, con ✓ (entregada), ✕ (fallida) o su número; la próxima lleva un anillo que pulsa. */
export function stopIcon(sequence: number, state: StopState, next: boolean): L.DivIcon {
  return cached(`stop|${sequence}|${state}|${next}`, () => {
    const color = STOP_COLOR_HEX[state];
    const inner = state === 'delivered' ? '<i class="ri-check-line"></i>' : state === 'failed' ? '<i class="ri-close-line"></i>' : String(sequence);
    const ring = next ? `<span class="animate-ping" style="position:absolute;inset:-6px;border-radius:9999px;border:3px solid #0d9488;opacity:.6"></span>` : '';
    return L.divIcon({
      className: '',
      html: `<div style="position:relative;width:30px;height:30px;">${ring}<div style="position:relative;width:30px;height:30px;border-radius:9999px;
        background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;
        border:3px solid ${next ? '#0d9488' : '#fff'};box-shadow:0 1px 4px rgba(0,0,0,.45);">${inner}</div></div>`,
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });
  });
}

export function originIcon(): L.DivIcon {
  return cached('origin', () => L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:8px;background:#0f172a;color:#fff;display:flex;align-items:center;
      justify-content:center;font-size:16px;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45);"><i class="ri-building-2-fill"></i></div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  }));
}

/** Burbuja de un grupo de camiones: el número; borde rojo si alguno tiene alerta. */
export function clusterIcon(count: number, alert: boolean): L.DivIcon {
  const label = count > 99 ? '99+' : String(count);
  return cached(`cluster|${label}|${alert}`, () => L.divIcon({
    className: '',
    html: `<div style="width:40px;height:40px;border-radius:9999px;background:#0f766e;color:#fff;display:flex;
      align-items:center;justify-content:center;font-size:14px;font-weight:700;border:3px solid ${alert ? '#dc2626' : '#fff'};
      box-shadow:0 0 0 4px rgba(15,118,110,.25),0 1px 4px rgba(0,0,0,.45);">${label}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  }));
}
