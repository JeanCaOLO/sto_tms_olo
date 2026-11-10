// Capa de TRACKING y DEVOLUCIONES de la data mock: sobre los MISMOS viajes que usa Liquidaciones, agrega lo que
// Tracking (web + app del chofer) y Devoluciones necesitan para mostrarlos y operarlos. Lo usa `exportar.ts`.
//
// Marcadores que resuelve `cargar.mjs` al cargar (así lo "en vivo" lo es de verdad el día de la demo):
//   "@NOW-<n>m"   → ahora menos n minutos      "@TODAY" → la fecha de hoy
//   "@ROLE:<nombre>" → id del rol en tbl_roles
// Es DATO DE PRUEBA (se borra con cargar.mjs --reset).

import { createHash } from 'node:crypto';
import type { Row } from '../../src/lib/tarifas/data';
import type { TarifasDatabase } from '../../src/lib/tarifas/data/memory/store';

export type Table = { table: string; rows: Row[] };

const ORG = '@ORG';
const MIN = 60_000;
const DAY = 86_400_000;

const ORIGEN: Record<string, { lat: number; lng: number; city: string }> = {
  DCR: { lat: 9.9281, lng: -84.0907, city: 'San José' },
  DVE: { lat: 10.4806, lng: -66.9036, city: 'Caracas' },
};
const VENDEDORES = ['Ana Mora / Luis Rojas', 'Carlos Vega', 'María Solano / Pedro Díaz', 'Sofía Rivas'];
const CIUDADES: Record<string, string[]> = {
  DCR: ['San José', 'Heredia', 'Alajuela', 'Cartago', 'Escazú'],
  DVE: ['Caracas', 'Valencia', 'Maracay', 'Los Teques', 'Guarenas'],
};

const ARTICULOS: [string, string][] = [
  ['7501055', 'Aceite vegetal 1 L'], ['7501100', 'Arroz blanco 1 kg'], ['7502210', 'Detergente líquido 2 L'], ['7503044', 'Galletas surtidas 400 g'],
  ['7504120', 'Leche entera 1 L'], ['7505008', 'Atún en lata 140 g'], ['7506031', 'Café molido 500 g'],
];

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const hash01 = (key: string) => parseInt(createHash('sha1').update(`flujo:${key}`).digest('hex').slice(0, 8), 16) / 0xffffffff;
const sorted = <T extends Row>(rows: T[]) => [...rows].sort((a, b) => Number(a.sequence_number) - Number(b.sequence_number));

export interface Flujo {
  /** Estado del viaje en tbl_routes (el de la app: "En tránsito" para los que están en ruta). */
  routeStatus: (t: Row) => string | undefined;
  routeExtra: (tripId: string) => Row;
  orderExtra: (orderId: string) => Row;
  guideExtra: (guideId: string) => Row;
  storeGeo: (countryId: string) => Row;
  phone: (customerKey: string, countryId: string) => string;
  returnRows: Row[];
  /** Usuarios y alcances: van ANTES de los conductores y las devoluciones (FK). */
  tablasUsuarios: Table[];
  /** Conductor → usuario de la app (para `tbl_drivers.app_user_id`). */
  driverUser: Map<string, string>;
  /** Formularios de devolución y tablas de tracking: van DESPUÉS de las guías y devoluciones. */
  tablasFlujo: Table[];
  /** Artículos de los pedidos (van DESPUÉS de los pedidos, ANTES de las devoluciones). */
  tablaArticulos: Table;
  resumen: string[];
}

export function construirFlujo(
  final: TarifasDatabase,
  ctx: { uuidOf: (k: string) => string; now: number },
): Flujo {
  const { uuidOf, now } = ctx;
  const codeOf = new Map(final.countries.map((c) => [String(c.id), String(c.code)]));
  const guidesOf = new Map<string, Row[]>();
  for (const o of final.tripOrders) guidesOf.set(String(o.route_id), [...(guidesOf.get(String(o.route_id)) ?? []), o]);
  for (const [k, v] of guidesOf) guidesOf.set(k, sorted(v));
  const tripById = new Map(final.trips.map((t) => [String(t.id), t]));
  const returnsOf = new Map<string, Row[]>();
  for (const r of final.tripReturns) returnsOf.set(String(r.route_id), [...(returnsOf.get(String(r.route_id)) ?? []), r]);

  const enRuta = final.trips.filter((t) => t.status === 'in_progress');
  const rastreados = [...new Map([...enRuta, ...[...returnsOf.keys()].map((id) => tripById.get(id)!)].map((t) => [String(t.id), t])).values()]
    .sort((a, b) => String(a.route_number).localeCompare(String(b.route_number)));
  const esEnRuta = (t: Row) => t.status === 'in_progress';

  // ── Cronología de cada viaje: parada i llega a los 60·(i+1) min de salir ──
  const START_MIN_AGO = new Map<string, number>(); // en ruta: hace cuántos minutos salió
  for (const t of enRuta) {
    const hechas = sorted(guidesOf.get(String(t.id)) ?? []).filter((g) => g.delivery_status !== 'pending').length;
    START_MIN_AGO.set(String(t.id), 60 * hechas + 44);
  }
  const startMs = (t: Row) => (t.actual_start_time ? new Date(String(t.actual_start_time)).getTime() : new Date(`${String(t.route_date)}T13:00:00Z`).getTime());
  /** Instante `offset` minutos después de la salida (marcador "@NOW-" si el viaje está en ruta). */
  const at = (t: Row, offset: number): string => {
    const ago = START_MIN_AGO.get(String(t.id));
    if (ago !== undefined) return `@NOW-${Math.max(1, ago - Math.round(offset))}m`;
    return new Date(startMs(t) + offset * MIN).toISOString();
  };

  // ── Geografía: sede con coordenadas y paradas repartidas alrededor ──
  const originOf = (t: Row) => ORIGEN[codeOf.get(String(t.country_id)) ?? 'DCR'];
  const stopGeo = (t: Row, g: Row) => {
    const o = originOf(t);
    const ang = hash01(`ang:${t.id}`) * Math.PI * 2 + Number(g.sequence_number) * 0.4;
    const rad = 0.025 + 0.009 * Number(g.sequence_number);
    return { lat: r6(o.lat + rad * Math.cos(ang) + (hash01(`la:${g.id}`) - 0.5) * 0.004), lng: r6(o.lng + rad * Math.sin(ang) + (hash01(`ln:${g.id}`) - 0.5) * 0.004) };
  };
  const orderExtra = new Map<string, Row>();
  const guideExtra = new Map<string, Row>();
  const factura = new Map<string, string>();
  for (const r of final.tripReturns) if (r.invoice_number) factura.set(String(r.order_id), String(r.invoice_number));
  const recolectaGuides = new Set(final.tripReturns.filter((r) => r.return_type === 'recolecta').map((r) => String(r.dispatch_guide_id)));
  for (const t of final.trips) {
    const code = codeOf.get(String(t.country_id)) ?? 'DCR';
    for (const g of guidesOf.get(String(t.id)) ?? []) {
      const p = stopGeo(t, g);
      const ciudades = CIUDADES[code];
      orderExtra.set(String(g.order_id), {
        invoice_number: factura.get(String(g.order_id)) ?? `FAC-${10000 + Math.floor(hash01(`inv:${g.order_id}`) * 89999)}`,
        delivery_address: `${String(g.customer_name)}, calle ${Math.floor(hash01(`c:${g.id}`) * 60) + 1}, casa ${Math.floor(hash01(`n:${g.id}`) * 90) + 1}`,
        delivery_city: ciudades[Math.floor(hash01(`ci:${g.id}`) * ciudades.length)],
        delivery_latitude: p.lat, delivery_longitude: p.lng,
      });
      const hecha = g.delivery_status !== 'pending';
      const seq = Number(g.sequence_number);
      guideExtra.set(String(g.id), {
        stop_type: recolectaGuides.has(String(g.id)) ? 'collection' : 'delivery',
        planned_arrival_time: at(t, 60 * seq - 5),
        ...(hecha ? { actual_arrival_time: at(t, 60 * seq), actual_departure_time: at(t, 60 * seq + 8) } : {}),
      });
    }
  }

  // ── Artículos del pedido de cada parada de los viajes rastreados ──
  // Es lo que la app del chofer ofrece al registrar una devolución (GET /paradas/{id}/articulos): incluye el producto que
  // devuelve cada devolución mock, con cantidad suficiente.
  const orderItems: Row[] = [];
  for (const t of rastreados) {
    for (const g of guidesOf.get(String(t.id)) ?? []) {
      const start = Math.floor(hash01(`it:${g.order_id}`) * ARTICULOS.length);
      const lineas = new Map<string, { code: string; name: string; qty: number }>();
      for (let i = 0; i < 3; i++) {
        const [code, name] = ARTICULOS[(start + i) % ARTICULOS.length];
        lineas.set(code, { code, name, qty: 4 + Math.floor(hash01(`q:${g.order_id}:${i}`) * 20) });
      }
      for (const r of returnsOf.get(String(t.id)) ?? []) {
        if (r.order_id !== g.order_id) continue;
        const cur = lineas.get(String(r.product_code));
        const need = Number(r.quantity) + 2;
        if (cur) cur.qty = Math.max(cur.qty, need);
        else lineas.set(String(r.product_code), { code: String(r.product_code), name: String(r.product_name), qty: need });
      }
      [...lineas.values()].forEach((l, i) => orderItems.push({
        id: uuidOf(`item:${g.order_id}:${l.code}`), order_id: g.order_id, line_number: i + 1, product_code: l.code, product_name: l.name,
        quantity: l.qty, created_at: new Date(now - 40 * DAY).toISOString(),
      }));
    }
  }

  // ── Devoluciones (las mismas que ve el motor de liquidación) ──
  const receptor = uuidOf('appuser:devoluciones');
  const returnRows: Row[] = final.tripReturns.map((r) => {
    const t = tripById.get(String(r.route_id))!;
    const vivo = esEnRuta(t);
    const when = vivo ? '@NOW-90m' : new Date(now - 15 * DAY).toISOString();
    return {
      id: r.id, organization_id: ORG, dispatch_guide_id: r.dispatch_guide_id, order_id: r.order_id, return_number: r.return_number,
      return_type: r.return_type, return_date: when, reason: r.reason, product_code: r.product_code, product_name: r.product_name,
      quantity: r.quantity, status: r.status, received_at: r.received_at ?? null, received_by: r.received_by === 'RECEPTOR' ? receptor : null,
      received_quantity: r.received_quantity ?? null, received_condition: r.received_condition ?? null,
      photo_url: null, notes: r.notes ?? 'DATO MOCK', created_at: when, updated_at: when,
    };
  });

  // ── Usuarios de prueba (la contraseña la pone cargar.mjs desde MOCK_USER_PASSWORD; nunca va en el JSON) ──
  const users: Row[] = [];
  const scopes: Row[] = [];
  const driverUser = new Map<string, string>();
  const emails: string[] = [];
  const addUser = (key: string, email: string, name: string, role: string, countries: string[]) => {
    const id = uuidOf(`appuser:${key}`);
    users.push({ id, auth_user_id: uuidOf(`auth:${key}`), email, full_name: name, role_id: `@ROLE:${role}`, organization_id: ORG, is_active: true });
    countries.forEach((c, i) => scopes.push({ id: uuidOf(`scope:${key}:${i}`), app_user_id: id, role_id: `@ROLE:${role}`, country_id: c }));
    emails.push(`${role}: ${email}`);
    return id;
  };
  enRuta.forEach((t, i) => {
    const driver = final.drivers.find((d) => d.id === t.driver_id);
    if (!driver) return;
    driverUser.set(String(driver.id), addUser(`chofer:${driver.id}`, `chofer.mock-${i + 1}@demo.tms.local`, String(driver.full_name), 'Chofer', [String(t.country_id)]));
  });
  addUser('devoluciones', 'devoluciones.mock@demo.tms.local', 'Receptor de devoluciones MOCK', 'Devoluciones', final.countries.map((c) => String(c.id)));

  // ── Formularios de devolución (uno por viaje con devoluciones ya recibidas) ──
  const forms: Row[] = [];
  const items: Row[] = [];
  const sections: Row[] = [];
  let nForm = 0;
  for (const t of rastreados) {
    const recibidas = (returnsOf.get(String(t.id)) ?? []).filter((r) => r.status === 'received');
    if (!recibidas.length) continue;
    const formId = uuidOf(`form:${t.id}`);
    const fecha = String(recibidas[0].received_at ?? new Date(now).toISOString());
    forms.push({
      id: formId, organization_id: ORG, route_id: t.id, form_number: `DEV-2026-10-${9001 + nForm++}`, physical_receipt_number: `RR-${7000 + nForm}`,
      branch: 'Bodega Central MOCK', return_kind: 'devolucion', merchandise_for: recibidas.some((r) => r.received_condition === 'Dañado') ? 'Destrucción' : 'Reingreso a inventario',
      observations: 'DATO MOCK: mercadería recibida y contada en bodega.', transport: `${String(t.carrier_name)} - ${String(t.driver_name)}`,
      guide_number: `MOCK-${String(guidesOf.get(String(t.id))?.[0]?.guide_number ?? '')}`, comments: null, received_by_name: 'Receptor de devoluciones MOCK',
      received_date: fecha.slice(0, 10), created_by: receptor, created_at: fecha, updated_at: fecha,
    });
    const guias = new Map<string, Row>();
    recibidas.forEach((r) => {
      items.push({ form_id: formId, return_id: r.id, created_at: fecha });
      const g = (guidesOf.get(String(t.id)) ?? []).find((x) => x.id === r.dispatch_guide_id);
      if (g) guias.set(String(g.id), g);
    });
    [...guias.values()].forEach((g, i) => sections.push({
      id: uuidOf(`formsec:${formId}:${g.id}`), form_id: formId, dispatch_guide_id: g.id, sort_order: i + 1, invoice_number: orderExtra.get(String(g.order_id))?.invoice_number,
      customer_code: `MOCK-${String(g.customer_code)}`, customer_name: String(g.customer_name), phone: null, address: orderExtra.get(String(g.order_id))?.delivery_address,
      route_label: String(t.route_number), sellers: VENDEDORES[i % VENDEDORES.length], created_at: fecha, updated_at: fecha,
    }));
  }

  // ── Tracking: recorrido, visitas, eventos, última posición y presencia ──
  const positions: Row[] = [];
  const lasts: Row[] = [];
  const presence: Row[] = [];
  const events: Row[] = [];
  const visits: Row[] = [];
  const ev = (t: Row, guide: Row | null, type: string, status: string, when: string, lat: number, lng: number, notes: string | null, key: string) => events.push({
    id: uuidOf(`ev:${key}`), organization_id: ORG, route_id: t.id, dispatch_guide_id: guide?.id ?? null, event_type: type, event_status: status, event_time: when,
    latitude: lat, longitude: lng, notes, created_at: when, client_id: uuidOf(`evc:${key}`),
  });
  for (const t of rastreados) {
    const o = originOf(t);
    const guides = guidesOf.get(String(t.id)) ?? [];
    const hechas = guides.filter((g) => g.delivery_status !== 'pending');
    const vivo = esEnRuta(t);
    const battery = 55 + Math.floor(hash01(`bat:${t.id}`) * 40);
    let n = 0;
    const pos = (offset: number, lat: number, lng: number, speed: number, prev: { lat: number; lng: number }) => {
      const heading = ((Math.atan2(lng - prev.lng, lat - prev.lat) * 180) / Math.PI + 360) % 360;
      const when = at(t, offset);
      positions.push({
        organization_id: ORG, route_id: t.id, vehicle_id: t.vehicle_id ?? null, driver_id: t.driver_id ?? null, device_id: `mock-device-${String(t.route_number)}`,
        client_id: uuidOf(`pos:${t.id}:${n++}`), latitude: r6(lat), longitude: r6(lng), accuracy_m: 8, speed_mps: speed, heading_deg: Math.round(heading * 10) / 10,
        battery_pct: battery, is_mock: false, recorded_at: when, received_at: when,
      });
      return when;
    };
    ev(t, null, 'route_started', 'info', at(t, 0), o.lat, o.lng, null, `${t.id}:start`);
    let prev = { lat: o.lat, lng: o.lng };
    pos(0, o.lat, o.lng, 0, prev);
    hechas.forEach((g, i) => {
      const a = stopGeo(t, g);
      const salida = i === 0 ? 0 : 60 * i + 8;
      const llegada = 60 * (i + 1);
      for (const f of [0.25, 0.5, 0.75]) pos(salida + (llegada - salida) * f, prev.lat + (a.lat - prev.lat) * f, prev.lng + (a.lng - prev.lng) * f, 9.5, prev);
      pos(llegada, a.lat, a.lng, 0, prev);
      pos(llegada + 8, a.lat, a.lng, 0, prev);
      visits.push({
        id: uuidOf(`visit:${g.id}`), organization_id: ORG, route_id: t.id, guide_id: g.id, arrived_at: at(t, llegada), departed_at: at(t, llegada + 8), dwell_seconds: 480,
        arrival_distance_m: 20 + Math.floor(hash01(`d:${g.id}`) * 90), completed_at: g.delivery_status === 'delivered' ? at(t, llegada + 6) : null, created_at: at(t, llegada),
      });
      ev(t, g, g.delivery_status === 'delivered' ? 'delivery_completed' : 'delivery_failed', g.delivery_status === 'delivered' ? 'success' : 'warning', at(t, llegada + 6), a.lat, a.lng,
        g.delivery_status === 'delivered' ? null : 'No había quién recibiera en el punto de entrega.', `${g.id}:done`);
      for (const r of (returnsOf.get(String(t.id)) ?? []).filter((x) => x.dispatch_guide_id === g.id)) {
        ev(t, g, 'return', 'warning', at(t, llegada + 7), a.lat, a.lng, `Devolución: ${String(r.quantity)} x ${String(r.product_name)} (${String(r.reason)})`, `${r.id}:ret`);
      }
      prev = a;
    });
    if (vivo) {
      // Camino hacia la siguiente parada (a 2/3 del trayecto): la posición "en vivo" que ve el mapa.
      const next = guides.find((g) => g.delivery_status === 'pending');
      const k = hechas.length;
      const b = next ? stopGeo(t, next) : prev;
      const salida = k === 0 ? 0 : 60 * k + 8;
      const llegada = 60 * (k + 1);
      for (const f of [0.25, 0.5]) pos(salida + (llegada - salida) * f, prev.lat + (b.lat - prev.lat) * f, prev.lng + (b.lng - prev.lng) * f, 9.5, prev);
      const f = 0.66;
      const lat = prev.lat + (b.lat - prev.lat) * f;
      const lng = prev.lng + (b.lng - prev.lng) * f;
      const offset = salida + (llegada - salida) * f;
      pos(offset, lat, lng, 8.3, prev);
      const when = at(t, offset);
      lasts.push({
        route_id: t.id, organization_id: ORG, latitude: r6(lat), longitude: r6(lng), speed_mps: 8.3,
        heading_deg: Math.round((((Math.atan2(b.lng - prev.lng, b.lat - prev.lat) * 180) / Math.PI + 360) % 360) * 10) / 10, battery_pct: battery, recorded_at: when, updated_at: when,
      });
      if (t.driver_id) presence.push({ driver_id: t.driver_id, organization_id: ORG, status: 'online', last_event: 'position', last_seen_at: when, device_id: `mock-device-${String(t.route_number)}`, battery_pct: battery, updated_at: when });
    } else {
      ev(t, null, 'route_completed', 'success', at(t, 60 * hechas.length + 20), prev.lat, prev.lng, null, `${t.id}:end`);
    }
  }

  const rutaTabla = (table: string, rows: Row[]): Table => ({ table, rows });
  return {
    routeStatus: (t) => (esEnRuta(t) ? 'En tránsito' : undefined),
    routeExtra: (id) => {
      const t = tripById.get(id)!;
      const ago = START_MIN_AGO.get(id);
      if (ago !== undefined) return { route_date: '@TODAY', actual_start_time: `@NOW-${ago}m`, actual_end_time: null };
      if (!rastreados.includes(t) && t.actual_start_time) return {};
      return {};
    },
    orderExtra: (id) => orderExtra.get(id) ?? {},
    guideExtra: (id) => guideExtra.get(id) ?? {},
    storeGeo: (countryId) => {
      const o = ORIGEN[codeOf.get(countryId) ?? 'DCR'];
      return { latitude: o.lat, longitude: o.lng, city: o.city };
    },
    phone: (key, countryId) => {
      const h = Math.floor(hash01(`ph:${key}`) * 9_000_000) + 1_000_000;
      return codeOf.get(countryId) === 'DCR' ? `+506 2${String(h).slice(0, 3)}-${String(h).slice(3, 7)}` : `+58 241-${String(h).slice(0, 7)}`;
    },
    returnRows, tablaArticulos: rutaTabla('tbl_order_items', orderItems), tablasUsuarios: [rutaTabla('tbl_app_users', users), rutaTabla('tbl_user_scopes', scopes)], driverUser,
    tablasFlujo: [
      rutaTabla('tbl_return_forms', forms), rutaTabla('tbl_return_form_items', items), rutaTabla('tbl_return_form_sections', sections),
      rutaTabla('tbl_tracking_positions', positions), rutaTabla('tbl_tracking_last_positions', lasts), rutaTabla('tbl_driver_presence', presence),
      rutaTabla('tbl_tracking_events', events), rutaTabla('tbl_tracking_stop_visits', visits),
    ],
    resumen: [`viajes en ruta: ${enRuta.length}`, `artículos de pedido: ${orderItems.length}`, `viajes con recorrido (rastreados): ${rastreados.length}`, ...emails],
  };
}
