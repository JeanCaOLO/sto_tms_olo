// Dataset eFlow-shaped generado en el cliente (mismas formas que el API simulado
// EXPEDICIONESCABECERA/DETALLE) para poblar el calendario sin backend. Fechas
// relativas al lunes de ESTA semana; coords reales del GAM (Costa Rica) para que
// el mapa de cada viaje se dibuje. Lo consume el MISMO mapper que la data real
// del sim (eflow-sim-store), así que cuando ePrac/el sim entreguen datos, este
// generador deja de usarse sin tocar la UI.
// ponytail: fixture a mano; se borra entero cuando el sim real tenga volumen.

import { addDays, format, startOfWeek } from 'date-fns';
import type { ExpedicionCabecera, ExpedicionDetalle } from './eflow-sim-api';

type Punto = [cliente: string, ciudad: string, lat: number, lng: number];

// RUTA = zona (el mapper usa RUTA como delivery_zone, igual que en el sim real).
const ZONAS: { zona: string; puntos: Punto[] }[] = [
  { zona: 'Zona 1', puntos: [
    ['Automercado Escazú', 'Escazú', 9.9189, -84.1419],
    ['EPA Escazú', 'Escazú', 9.9276, -84.1385],
    ['Pequeño Mundo Santa Ana', 'Santa Ana', 9.9324, -84.1836],
    ['Multiplaza Escazú', 'Escazú', 9.9357, -84.1398],
    ['City Mall Alajuela', 'Alajuela', 10.013, -84.208],
    ['Ferretería Santa Ana', 'Santa Ana', 9.933, -84.187],
  ] },
  { zona: 'Zona 2', puntos: [
    ['Walmart Heredia', 'Heredia', 9.9985, -84.1169],
    ['Maxi Palí Heredia', 'Heredia', 10.0023, -84.114],
    ['Cofersa San Joaquín', 'San Joaquín', 9.9931, -84.1569],
    ['Depósito Santa Bárbara', 'Santa Bárbara', 10.0281, -84.1575],
    ['EPA Heredia', 'Heredia', 9.996, -84.11],
    ['Ferretería Belén', 'Belén', 9.985, -84.185],
  ] },
  { zona: 'Zona 3', puntos: [
    ['EPA Curridabat', 'Curridabat', 9.9178, -84.0333],
    ['Automercado Tres Ríos', 'Tres Ríos', 9.9061, -83.9872],
    ['Ferretería Cartago', 'Cartago', 9.8644, -83.9194],
    ['Maxi Palí Cartago', 'Cartago', 9.856, -83.919],
    ['Depósito Curridabat', 'Curridabat', 9.915, -84.03],
    ['Pequeño Mundo Tres Ríos', 'Tres Ríos', 9.907, -83.988],
  ] },
  { zona: 'Zona 4', puntos: [
    ['Coopemep San Carlos', 'San Carlos', 10.3296, -84.4292],
    ['EPA Ciudad Quesada', 'Ciudad Quesada', 10.324, -84.427],
    ['Ferretería La Fortuna', 'La Fortuna', 10.471, -84.645],
    ['Depósito Zarcero', 'Zarcero', 10.194, -84.392],
  ] },
];

const ARTICULOS: [codigo: string, desc: string, peso: number, vol: number][] = [
  ['ART-100', 'Cemento gris 50kg', 50, 0.04],
  ['ART-210', 'Varilla #3', 4.5, 0.01],
  ['ART-330', 'Pintura látex cubeta', 22, 0.02],
  ['ART-450', 'Lámina zinc 3m', 9, 0.05],
  ['ART-560', 'Tubería PVC 6m', 3, 0.03],
  ['ART-670', 'Bloque concreto', 12, 0.015],
];

// Pedidos por [díaOffset lun..vie][índice de zona]. 0 = la zona no opera ese día.
// Con viajes de ~3 paradas, estos conteos dan 1–3 viajes por zona.
const SEMANA = [
  [5, 0, 3, 0],
  [0, 7, 0, 2],
  [4, 2, 0, 6],
  [3, 0, 5, 0],
  [2, 4, 3, 0],
];

function cab(id: string, fecha: string, zona: string, p: Punto): ExpedicionCabecera {
  return {
    IDEXPEDICION: id, IDCOMPANIA: '0109', IDALMACEN: '0001', IDSUCURSAL: '0001',
    TPEXES: 'DISP', TPEXSI: 'DISP', PRIORIDAD: null, BAJADA: null,
    IDCLIENTE: null, NOMBRECLIENTE: p[0], RUTA: zona, FECHAENTREGA: fecha,
    FECHACIERRE: null, NUMEROVIAJEWMH: null, DIRECCIONENTREGA: `${p[1]}, Costa Rica`,
    LATITUD: String(p[2]), LONGITUD: String(p[3]),
  };
}

function lineas(id: string, sal: number, compania = '0109'): ExpedicionDetalle[] {
  const cuantas = 1 + (sal % 3); // 1..3 líneas por pedido
  return Array.from({ length: cuantas }, (_, k) => {
    const a = ARTICULOS[(sal + k) % ARTICULOS.length];
    const cant = 2 + ((sal + k) % 6) * 3;
    return {
      IDEXPEDICION: id, IDCOMPANIA: compania, IDALMACEN: '0001', IDSUCURSAL: '0001',
      IDLINEA: k + 1, IDARTICULO: a[0], DESCRIPCION: a[1], CANTIDAD: cant,
      PESO: +(a[2] * cant).toFixed(2), VOLUMEN: +(a[3] * cant).toFixed(3),
      GUIAFISCAL: null, TPEXES: 'DISP', TPEXSI: 'DISP', PRIORIDAD: null,
    };
  });
}

// EPA (IDCOMPANIA 0029): IPRAC parte el pedido de cada tienda en DOS expediciones
// con sufijo guion — -0 FALLA (prioridad 1, urgente) y -1 REGULAR (prioridad 2).
// Prioridad UNIFORME por expedición; camión exclusivo → cluster propio "EPA".
const EPA_TIENDAS: Punto[] = [
  ['EPA Tienda Zapote', 'Zapote', 9.9126, -84.0589],
  ['EPA Tienda Alajuela', 'Alajuela', 10.0162, -84.2116],
  ['EPA Tienda Cartago', 'Cartago', 9.8644, -83.9194],
];

function epaCab(base: string, suf: 0 | 1, fecha: string, p: Punto): ExpedicionCabecera {
  return {
    IDEXPEDICION: `${base}-${suf}`, IDCOMPANIA: '0029', IDALMACEN: '0001', IDSUCURSAL: '0001',
    TPEXES: 'DISP', TPEXSI: 'DISP', PRIORIDAD: suf === 0 ? 1 : 2, BAJADA: null,
    IDCLIENTE: null, NOMBRECLIENTE: p[0], RUTA: 'EPA', FECHAENTREGA: fecha,
    FECHACIERRE: null, NUMEROVIAJEWMH: null, DIRECCIONENTREGA: `${p[1]}, Costa Rica`,
    LATITUD: String(p[2]), LONGITUD: String(p[3]),
  };
}

export function seedEflowSim(): { cabecera: ExpedicionCabecera[]; detalle: ExpedicionDetalle[] } {
  const lunes = startOfWeek(new Date(), { weekStartsOn: 1 });
  const cabecera: ExpedicionCabecera[] = [];
  const detalle: ExpedicionDetalle[] = [];
  let seq = 0;
  SEMANA.forEach((fila, dia) => {
    const fecha = format(addDays(lunes, dia), 'yyyy-MM-dd');
    fila.forEach((cuantos, zi) => {
      const z = ZONAS[zi];
      for (let i = 0; i < cuantos; i++) {
        const id = `EXP-${String(1000 + seq++).padStart(5, '0')}`;
        cabecera.push(cab(id, fecha, z.zona, z.puntos[i % z.puntos.length]));
        detalle.push(...lineas(id, seq));
      }
    });
  });
  EPA_TIENDAS.forEach((p, i) => {
    const fecha = format(addDays(lunes, i % 5), 'yyyy-MM-dd');
    const base = `EXP-EPA-${String(500 + i).padStart(3, '0')}`;
    for (const suf of [0, 1] as const) {
      cabecera.push(epaCab(base, suf, fecha, p));
      detalle.push(...lineas(`${base}-${suf}`, suf + i + 1, '0029'));
    }
  });
  return { cabecera, detalle };
}
