// Descripciones del tarifador: menú, pestañas y vistas.

import type { HintMap } from '../../../components/base/hintKey';

export const NAVEGACION: HintMap = {
  'Liquidaciones': 'Calcula y emite lo que se le paga a cada transportista por sus viajes.',
  'Costos Flota': 'Costos y condiciones de cobro de la flota propia y de la externa.',
  'Reglas Tarifa': 'Reglas, tarifarios y auditoría que usa el cálculo de las liquidaciones.',
  'Flota Propia': 'Compañías con camiones propios: su estructura de costos es la base de lo que se liquida.',
  'Flota Externa': 'Transportistas terceros: se les paga por reglas y tarifarios, sin costos internos.',
  'Por Liquidar': 'Viajes terminados que todavía no tienen liquidación.',
  'Historial': 'Liquidaciones ya emitidas, con su desglose.',
  'Listos': 'Viajes completados con todos sus pedidos entregados: ya se pueden liquidar.',
  'Incompletos': 'Viajes sin completar o con pedidos sin entregar: solo para revisar.',
  'Todos': 'Todos los viajes que no tienen una liquidación vigente.',
  'Vista simple': 'Muestra solo lo necesario para liquidar: datos del viaje, variables y total.',
  'Vista extendida': 'Agrega pedidos, desglose línea por línea, notas y estado.',
  'Reglas': 'Fórmulas que suman o restan al total de una liquidación.',
  'Tarifarios': 'Tablas de precios por ruta, camión u otras claves.',
  'Alerta Margen': 'Avisa cuando el pago es alto frente al valor de la mercancía transportada.',
  'Probador Motor': 'Prueba un viaje de ejemplo y mira el desglose sin emitir nada.',
  'Bitácora': 'Registro de quién cambió qué, y cuándo.',
};
