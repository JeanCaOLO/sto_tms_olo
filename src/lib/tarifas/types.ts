// Tipos de dominio + AST del lenguaje de reglas del motor de tarifación.
// Puerto literal de vista-tarifas-fase1/src/kernel/types.ts (prototipo fuente real, no
// documentación reconstruida). Este archivo no importa React, localStorage, fetch, ni usa
// Date.now()/new Date() implícito.

export type Money = string; // "400.00", "-12.5" — NUNCA number de JS

export type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'UP' | 'DOWN';

export interface Country {
  id: string;
  iso2: string;
  name: string;
  /**
   * MONEDA ÚNICA del país. Todo importe del módulo —lo que dicta una regla, lo que dice un
   * tarifario, lo que cuesta operar, el total y el margen— está escrito en ella.
   *
   * Hubo una segunda moneda "de consolidación" y se eliminó: obligaba a que cada importe declarara
   * en cuál de las dos estaba escrito, y ese campo era invisible en varias pantallas. La peor
   * consecuencia estaba en las reglas ad-hoc de una liquidación, que asumían la de referencia sin
   * decirlo: en Venezuela alguien tecleaba 50 y se cargaban 2.000.
   */
  localCurrency: string; // p.ej. 'CRC'
  roundingDecimals: number;
  roundingMode: RoundingMode;
  /** Horas a partir de las cuales un viaje cuenta como "más de un día". */
  overnightThresholdHours: number;
  /**
   * Si el país admite emitir una liquidación con total negativo. Por defecto NO: un total negativo
   * significa que el transportista le debe plata a la empresa, que casi siempre es un error de
   * carga y no una intención.
   */
  allowNegativeTotal?: boolean;
}

// Cascada geográfica ZoneGroup → Zone → Location: evita declarar una tarifa por cada
// combinación de localidades (matriz N×N literal). Reglas y lookups se declaran a nivel de Zone
// (o ZoneGroup), y cada Location resuelve a su Zone en el contexto derivado del viaje.
export interface ZoneGroup {
  id: string;
  countryId: string;
  code: string;
  name: string;
  /** Códigos de las zonas del catálogo que agrupa. */
  zoneCodes?: string[];
}

/** Zona del catálogo del TMS (`zones`). El grupo lo resuelve el liquidador desde `ZoneGroup.zoneCodes`. */
export interface Zone {
  id: string;
  countryId: string;
  zoneGroupId: string | null;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  countryId: string;
  zoneId: string;
  code: string;
  name: string;
}

/**
 * Qué zona tarifaria le corresponde a un punto del TMS.
 *
 * Existe porque el TMS y el tarifador tienen geografías distintas: el TMS conoce tiendas y tipos de
 * ruta; el tarifador conoce ZONAS. Sin este puente, una liquidación real no puede resolver su zona
 * y las reglas condicionadas por zona nunca aplican — que es exactamente lo que pasaba: el origen y
 * el destino caían siempre en la zona comodín.
 *
 * El mapeo es del TARIFADOR: no agrega columnas a las tablas del TMS, solo las referencia por id.
 */
export interface ZoneMapping {
  id: string;
  countryId: string;
  /** Qué entidad del TMS se está ubicando. */
  sourceType: 'STORE' | 'ROUTE_TYPE';
  /** Id de esa entidad en el TMS. */
  sourceId: string;
  zoneId: string;
}

// Maestros de referencia (flota, terceros).
export interface TruckType {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Carrier {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Customer {
  id: string;
  countryId: string;
  code: string;
  name: string;
}

export interface Driver {
  id: string;
  countryId: string;
  code: string;
  name: string;
  /** null = conductor de flota propia; si no, transportista al que pertenece. */
  carrierId: string | null;
}

/** De dónde sale el valor de una variable personalizada al liquidar un viaje. */
export type CustomVarOrigin =
  /** Valor fijo configurado en la compañía. Se usa igual en todos sus viajes. */
  | 'CONSTANT'
  /** Dato que se carga en cada liquidación; `defaultValue` es solo el valor inicial. */
  | 'PER_TRIP';

export interface PartyVariable {
  id: string;
  partyId: string;
  /** Siempre con prefijo `custom:`. */
  key: CustomVarKey;
  label: string;
  kind: 'NUMBER' | 'TEXT';
  origin: CustomVarOrigin;
  defaultValue: string | null;
  unit: string | null;
  active: boolean;
}

export type ServiceType = 'STANDARD' | 'EXPRESS' | 'DEDICATED';
export type FleetType = 'OWN' | 'OUTSOURCED';

/**
 * El viaje tal como lo ve el motor.
 *
 * Trae SOLO lo que el viaje de guía de despacho conoce como dato (ver `tripContext.ts`): distancia,
 * paradas, peso, duración, vehículo, flota, zona destino. Todo lo demás —peajes, recolectas, bultos,
 * atrasos, incidencias o lo que cada compañía necesite— es una variable personalizada (`custom:*`)
 * que se carga al liquidar y llega en `customVars`. Antes eran campos fijos de este tipo; se
 * retiraron (2026-10-02, ROADMAP §8) porque ningún viaje real los trae.
 */
export interface TripContext {
  countryId: string;
  /**
   * Perfil de cálculo con el que se liquida este viaje (`settlementParty`). Es lo que decide QUÉ
   * reglas aplican además de las del país, y contra qué tarifa de outsourcing se costea. Nulo = el
   * transportista no tiene perfil: se liquida solo con las reglas del país.
   * Distinto de `carrierId`, que es el transportista del TMS y solo sirve como variable de regla.
   */
  partyId: string | null;
  quotedAt: string; // ISO 8601 — nunca Date.now() implícito
  /** Vacío = el viaje no informa origen (los viajes de guía de despacho solo traen destino). */
  originLocationId: string;
  destLocationId: string;
  km: number;
  clientCount: number;
  weightKg: number;
  truckTypeId: string;
  serviceType: ServiceType;
  fleetType: FleetType;
  carrierId: string | null;
  driverId: string | null;
  customerId: string | null;
  durationHours: number;
  /** Capacidad del camión del viaje (`vehicles.capacity_*`): m³ y toneladas. 0 = no informada. */
  truckVolumeM3: number;
  truckWeightTons: number;
  /**
   * Valores de las variables personalizadas cargadas para ESTE viaje (las de origen PER_TRIP).
   * Las de origen CONSTANT no hace falta repetirlas acá: el motor toma su valor de la declaración.
   */
  customVars?: Record<string, VarValue>;
}

// Calculadas por el resolver a partir de TripContext + parametría del país — nunca se ingresan a
// mano. originZone/destZone/*ZoneGroup usan el CÓDIGO de zona (no el id interno), igual que el
// resto del vocabulario de predicados.
export interface DerivedVars {
  originZone: string;
  destZone: string;
  originZoneGroup: string;
  destZoneGroup: string;
  overnightNights: number;
  weekday: number; // 0 (domingo) .. 6 (sábado)
}

// Variables que trae el sistema. Sigue siendo un vocabulario CERRADO: si una regla nombrara una
// clave que no está acá, no compila.
export type BuiltinVarKey =
  | 'countryId' | 'km' | 'clientCount' | 'weightKg'
  | 'truckTypeId' | 'serviceType' | 'fleetType' | 'carrierId' | 'customerId'
  | 'durationHours' | 'truckVolumeM3' | 'truckWeightTons'
  | 'originZone' | 'destZone' | 'originZoneGroup' | 'destZoneGroup'
  | 'overnightNights' | 'weekday';

/**
 * Variable declarada por una compañía. El prefijo `custom:` no es decorativo: separa el vocabulario
 * del sistema —que el compilador verifica— del que cada compañía agrega en caliente, y hace
 * imposible que una variable personalizada pise a una del sistema.
 */
export type CustomVarKey = `custom:${string}`;

export type VarKey = BuiltinVarKey | CustomVarKey;

export type VarValue = string | number;

/** Todas las del sistema siempre presentes; las personalizadas, las que la compañía haya declarado. */
export type VarBag = Record<BuiltinVarKey, VarValue> & Record<CustomVarKey, VarValue>;

// Subconjunto de VarKey usable como "unidad" en PER_UNIT/TIERED — multiplicar un rate por un
// serviceType no tiene sentido, así que el compilador rechaza ese uso.
export type BuiltinNumericVarKey =
  | 'km' | 'clientCount' | 'weightKg' | 'durationHours'
  | 'truckVolumeM3' | 'truckWeightTons' | 'overnightNights' | 'weekday';

// Una variable personalizada numérica también sirve como unidad; que lo sea de verdad se valida al
// guardar la regla (`kind: 'NUMBER'`), porque el compilador no puede saberlo.
export type NumericVarKey = BuiltinNumericVarKey | CustomVarKey;

export type ComparisonOp = 'EQ' | 'NEQ' | 'GT' | 'GTE' | 'LT' | 'LTE';

export type Pred =
  | { p: ComparisonOp; left: VarKey; right: string | number }
  | { p: 'IN'; left: VarKey; values: (string | number)[] }
  | { p: 'BETWEEN'; left: VarKey; from: number; to: number }
  | { p: 'AND' | 'OR'; args: Pred[] }
  | { p: 'NOT'; arg: Pred }
  | { p: 'ALWAYS' };

// Los operadores del constructor visual de condiciones: las seis comparaciones más IN y BETWEEN.
// El motor los ejecuta desde siempre (ver Pred); antes de la Fase 9 solo se alcanzaban por JSON.
export type ConditionRowOperator = ComparisonOp | 'IN' | 'BETWEEN';

/** Una fila del constructor visual de condiciones. */
export interface ConditionRowForm {
  left: VarKey;
  op: ConditionRowOperator;
  /** Envuelve la fila en NOT ("no se cumple que..."). */
  negate: boolean;
  /** Para las seis comparaciones. */
  right: string;
  /** Para IN: valores separados por coma. */
  values: string;
  /** Para BETWEEN. */
  from: string;
  to: string;
}

export type ConditionMode = 'always' | 'rows' | 'advanced';

/**
 * La condición tal como se armó en el formulario visual. El motor NO ejecuta esto: ejecuta el `Pred`
 * compilado a partir de acá. Se guarda para poder REABRIR la regla en el formulario simple en vez de
 * mandar a nadie a editar JSON — mismo motivo por el que existe `RuleBuilderForm` del lado del
 * cálculo, y el mismo defecto (A1) que tenía forzar JSON en la segunda edición.
 */
export interface ConditionBuilderForm {
  mode: ConditionMode;
  /** Cómo se combinan las filas entre sí, cuando hay más de una. Sin efecto con una sola fila. */
  combinator: 'AND' | 'OR';
  rows: ConditionRowForm[];
}

// Todo porcentaje declara su base de forma explícita — un "+8%" sin base es la causa #1 de
// discrepancias irreproducibles en motores de tarifas.
export type BaseRef =
  | { of: 'STAGE_SUBTOTAL'; stage: Stage }
  | { of: 'RUNNING_SUBTOTAL' }
  | { of: 'RULE'; ruleCode: string };

export type Expr =
  | { op: 'FIXED'; amount: Money }
  | { op: 'PER_UNIT'; unit: NumericVarKey; rate: Money }
  | { op: 'PER_KM'; rate: Money }
  | { op: 'PERCENT'; pct: string; base: BaseRef }
  /**
   * Escalones. `mode` decide QUÉ significa el `amount` de cada tramo — y la diferencia es plata:
   * con la tabla "hasta 100 km: 2 · 101-300: 1,50 · +300: 1,20" y un viaje de 250 km,
   *   FLAT        -> 1,50        (el tramo fija un importe)
   *   RATE        -> 375         (250 × 1,50: el tramo fija la tarifa de TODAS las unidades)
   *   PROGRESSIVE -> 425         (100×2 + 150×1,50: cada tramo cobra solo lo suyo)
   * Ausente = 'FLAT', que es como se interpretaban los escalones antes de que existiera el campo.
   */
  | { op: 'TIERED'; unit: NumericVarKey; mode?: TierMode; tiers: Tier[] }
  // "Cada N unidades completas, sumar X": 25 peajes con blockSize 10 dan 2 bloques. Con TIERED
  // había que enumerar un escalón por cada tramo posible, que no escala.
  | { op: 'PER_BLOCK'; unit: NumericVarKey; blockSize: number; amount: Money }
  // Busca en una tabla de tarifas por su código. Gana la fila MÁS ESPECÍFICA (la que menos
  // comodines usa); si ninguna coincide, se evalúa `fallback`. `column` elige cuál de las columnas
  // de valor de la fila se usa (sin ella, el valor principal). Si la fila no trae ese valor, también
  // se evalúa `fallback`, y se avisa.
  | { op: 'LOOKUP_TABLE'; table: string; column?: string; fallback: Expr }
  | { op: 'MIN' | 'MAX'; args: Expr[] }
  | { op: 'CLAMP'; value: Expr; min?: Money; max?: Money }
  | { op: 'IF'; cond: Pred; then: Expr; else: Expr };

/** Cómo se interpreta el importe de cada escalón. Ver el operador TIERED. */
export type TierMode =
  /** El tramo fija un IMPORTE fijo. */
  | 'FLAT'
  /** El tramo fija una TARIFA POR UNIDAD, aplicada a todas las unidades. */
  | 'RATE'
  /** Cada tramo cobra su tarifa solo por las unidades que caen dentro de él (marginal). */
  | 'PROGRESSIVE';

export interface Tier {
  /** Límite superior INCLUSIVO del tramo. `null` = de acá en adelante; debe ser el último. */
  upTo: number | null;
  /** Importe fijo o tarifa por unidad, según el `mode` de la expresión. */
  amount: Money;
}

export type Stage = 'BASE' | 'VARIABLE' | 'MODIFIER' | 'SURCHARGE' | 'ADJUSTMENT' | 'TAX';
export const STAGE_ORDER: readonly Stage[] = ['BASE', 'VARIABLE', 'MODIFIER', 'SURCHARGE', 'ADJUSTMENT', 'TAX'];

export type Stacking = 'SUM' | 'MAX' | 'EXCLUSIVE';

/**
 * De quién es la regla. Las de país son la base compartida; las de compañía se suman a ellas y, si
 * repiten el `code` de una de país, la REEMPLAZAN para esa compañía. Ese único mecanismo cubre los
 * tres casos: heredar, agregar y sobrescribir — incluida la reactivación para una compañía de una
 * regla de país que está desactivada.
 */
export type RuleScope = 'COUNTRY' | 'PARTY';

/**
 * Si la regla sube o baja el total. El importe de la regla se guarda SIEMPRE en positivo y el signo
 * lo pone esto: así "peajes × 20 que disminuye" y "peajes × -20" no son dos formas de escribir lo
 * mismo, que es la causa habitual de reglas que se contradicen sin que nadie lo note.
 */
export type RuleEffect = 'INCREASE' | 'DECREASE';

/** Los operadores del formulario visual, en el idioma del usuario. */
export type BuilderOperator =
  /** Monto fijo, sin variable. */
  | 'FIXED'
  /** variable × valor — "por cada peaje, 20". */
  | 'TIMES'
  /** variable ÷ bloque — "cada 10 peajes, 15". Solo cuenta bloques completos. */
  | 'PER_BLOCK'
  /** porcentaje sobre una base declarada. */
  | 'PERCENT'
  /** escalones por tramos: el modo decide qué significa el importe de cada uno. */
  | 'TIERED'
  /** el importe lo dice una fila de un tarifario, buscada por la clave de la tabla. */
  | 'RATE_TABLE';

/**
 * La regla tal como la armó la persona en el formulario visual. El motor NO ejecuta esto: ejecuta
 * la `expression` compilada a partir de acá. Se guarda para poder REABRIR la regla en el formulario
 * simple en vez de mandar a nadie a editar JSON.
 */
export interface RuleBuilderForm {
  /** null solo cuando el operador es FIXED. */
  variable: NumericVarKey | null;
  operator: BuilderOperator;
  /** Importe o porcentaje, SIEMPRE sin signo. El signo lo decide `effect`. */
  value: string;
  /** Tamaño de bloque para PER_BLOCK. */
  blockSize?: number;
  /** Base del porcentaje para PERCENT. */
  percentBase?: BaseRef;
  /** Tramos y su interpretación, para TIERED. */
  tiers?: Tier[];
  tierMode?: TierMode;
  /** Código del tarifario a consultar, para RATE_TABLE. */
  rateTableCode?: string;
  /** Columna de valor del tarifario a usar. Vacío = el valor principal. */
  rateTableColumn?: string;
  effect: RuleEffect;
  /**
   * Tope y piso sobre el resultado YA calculado, cualquiera sea el operador. Compila a un CLAMP que
   * envuelve la expresión. Ambos vacíos = sin acotar, que es como se comportaba toda regla antes de
   * este campo.
   */
  clamp?: { min?: string; max?: string };
}

export interface Rule {
  id: string;
  countryId: string;
  /** 'COUNTRY' si no se declara: es como se interpretaban todas las reglas antes de este campo. */
  scope?: RuleScope;
  /** Compañía dueña de la regla cuando `scope` es 'PARTY'. */
  partyId?: string | null;
  /**
   * Desde cuándo rige, en formato `YYYY-MM-DD` INCLUSIVE. Null = desde siempre.
   *
   * Sin esto, editar una regla cambiaba el cálculo de liquidaciones que todavía no se habían
   * emitido, y no había forma de responder "¿qué regla estaba vigente el día de este viaje?" — que
   * es la primera pregunta de cualquier auditoría.
   */
  effectiveFrom?: string | null;
  /** Hasta cuándo rige, `YYYY-MM-DD` INCLUSIVE (cubre todo ese día). Null = sin vencimiento. */
  effectiveTo?: string | null;
  code: string;
  name: string;
  stage: Stage;
  priority: number; // menor = se evalúa antes; dentro de EXCLUSIVE, gana la de menor priority
  stacking: Stacking;
  exclusionGroup: string | null; // reglas MAX mutuamente excluyentes comparten este grupo
  conditions: Pred;
  expression: Expr;
  /** Explicación en castellano. Autogenerada desde `builder`, editable a mano. */
  description?: string | null;
  /** Motivo de negocio por el que existe la regla. Texto libre, para auditoría. */
  reason?: string | null;
  effect?: RuleEffect | null;
  /** Forma visual con la que se armó. Ausente = regla escrita en modo avanzado. */
  builder?: RuleBuilderForm | null;
  /** Forma visual de la condición. Ausente = condición escrita en modo avanzado, o "Siempre". */
  conditionBuilder?: ConditionBuilderForm | null;
  isAdhoc: boolean;
  active: boolean;
  version: number; // se incrementa al editar; nunca se sobreescribe en silencio
}

// ── Tablas de tarifas ─────────────────────────────────────────────────────────────────────────
// El vacío que dejaba la tabla zona-a-zona: su clave eran DOS columnas fijas (origen, destino).
// Un tarifario real se indexa por combinaciones — zona, tipo de camión, tipo de servicio, cliente —
// y con el modelo anterior cada combinación necesitaba su propia regla: 5 zonas × 4 camiones eran
// 20 reglas para lo que en una planilla son 20 FILAS.
//
// Una tabla de tarifas declara QUÉ variables forman su clave y guarda una fila por combinación.
// Es la mitad "tabular" que le faltaba al motor, y la que hace que un Excel se importe tal cual.

export interface RateTable {
  id: string;
  countryId: string;
  /** Compañía dueña. null = tabla del país, la usan todas. */
  partyId: string | null;
  /** Código con el que la referencia una regla. */
  code: string;
  name: string;
  /**
   * Variables que forman la clave, EN ORDEN. Cada fila trae un valor por cada una.
   * Pueden ser del sistema (`truckTypeId`, `originZone`) o personalizadas de la compañía.
   */
  keyColumns: VarKey[];
  /**
   * Columnas de valor ADEMÁS del principal (`amount`): un mismo tarifario puede dar, por ejemplo,
   * "flete" y "peaje" para la misma combinación, y cada regla elige la que usa. Vacío o ausente =
   * un solo valor por fila, como siempre.
   */
  valueColumns?: string[];
  active: boolean;
}

/** Valor que hace que una columna de la clave acepte cualquier cosa. */
export const RATE_TABLE_WILDCARD = '*';

export interface RateTableRow {
  id: string;
  tableId: string;
  /** Un valor por cada `keyColumns`, en el mismo orden. `*` acepta cualquier valor. */
  key: string[];
  /** Valor principal de la fila. */
  amount: Money;
  /** Valores de las columnas adicionales (`RateTable.valueColumns`), por nombre. Puede faltar alguno. */
  values?: Record<string, Money>;
  order: number;
  active: boolean;
}

/** Cómo resolvió una búsqueda en tabla, para que el desglose lo pueda explicar. */
export interface RateTableMatch {
  /** Id del tarifario (para abrirlo desde el desglose). */
  tableId: string;
  tableCode: string;
  /** Compañía dueña del tarifario; null = del país. */
  tablePartyId: string | null;
  rowId: string;
  /** La clave de la fila que ganó, ya legible ("CCS | NPR | *"). */
  matchedKey: string;
  /** Cuántas columnas coincidieron de forma exacta (sin comodín). */
  specificity: number;
  /** Columna de valor que se leyó. Ausente = la principal. */
  column?: string;
}


// La edición manual nunca sobreescribe en silencio — siempre queda registrada con un motivo.
export interface Override {
  value: Money;
  reason: string;
}

// ── Viajes del TMS (solo lectura) ─────────────────────────────────────────────────────────────
// El liquidador NO crea viajes: consume los de guía de despacho (`routes`), ya armados por la vista
// `tarifas_v_viajes` con su transportista, conductor, vehículo y zona. Ver ROADMAP §8.

/** Estado del viaje, normalizado por la vista. Solo 'completed' se liquida. */
export type TripStatus = 'completed' | 'planned' | 'in_progress' | string;

/** Un viaje de guía de despacho, tal como lo lee el liquidador. */
export interface TripRecord {
  id: string;
  countryId: string;
  /** Número del viaje (`routes.route_number`). Es el dato con el que la gente busca. */
  routeNumber: string;
  /** 'YYYY-MM-DD'. Resuelve la vigencia de las reglas. */
  routeDate: string;
  status: TripStatus;
  carrierId: string | null;
  carrierName: string | null;
  /** `carriers.is_flota_propia`. Nulo = el viaje no tiene transportista asignado. */
  isOwnFleet: boolean | null;
  driverId: string | null;
  driverName: string | null;
  driverDocument: string | null;
  vehicleId: string | null;
  vehiclePlate: string | null;
  /** `vehicles.vehicle_type`: el "tipo de camión" con el que se buscan las tarifas. */
  vehicleType: string | null;
  capacityWeightKg: number;
  capacityVolumeM3: number;
  destZoneId: string | null;
  destZoneCode: string | null;
  destZoneName: string | null;
  km: number;
  totalStops: number;
  completedStops: number;
  weightKg: number;
  volumeM3: number;
  actualStartTime: string | null;
  actualEndTime: string | null;
  durationHours: number;
  guideCount: number;
  /** Guías (una por pedido) ya entregadas. */
  deliveredGuides: number;
  returnCount: number;
  /** Liquidación vigente del viaje, o nulo si todavía no se liquidó. */
  settlementId: string | null;
  /** El viaje ya tuvo una liquidación y se anuló: vuelve a la bandeja para liquidarse de nuevo. */
  hadAnnulledSettlement?: boolean;
}

/**
 * Lo variable que se carga a mano al liquidar un viaje (además de las devoluciones, que se guardan
 * aparte en `SettlementRecord.returns`). Los datos del viaje (km, paradas, vehículo…) son de guía
 * de despacho y no se editan desde el liquidador.
 */
export interface TripEdits {
  /** Valores de las variables personalizadas PER_TRIP (peajes, recolectas, horas de espera…). */
  customVars: Record<string, VarValue>;
}

export type SettlementStatus = 'Borrador' | 'En Revisión' | 'Aprobado' | 'Pagado' | 'Anulado';

/** Una devolución informada en el viaje. Es informativa: no cambia lo que se le paga al transportista. */
export interface SettlementReturn {
  invoiceNumber: string;
  productCode: string;
  /** 'PARCIAL' = un producto de la factura; 'TOTAL' = todos. */
  kind: 'PARCIAL' | 'TOTAL';
  notes?: string | null;
}

/**
 * La liquidación emitida de un viaje, con su desglose completo.
 *
 * El desglose se guarda desnormalizado y sin referencia a las reglas, a propósito: una liquidación
 * emitida tiene que poder releerse tal cual se emitió aunque después la regla se edite, se
 * desactive o se borre. Por la misma razón `tripInfo` congela lo que se leyó del viaje: si guía de
 * despacho lo corrige después, la liquidación vieja sigue diciendo con qué datos se calculó.
 */
export interface SettlementRecord {
  id: string;
  countryId: string;
  /** El viaje liquidado (`routes.id`). */
  tripId: string;
  /** Perfil de cálculo con el que se liquidó. Nulo = transportista sin perfil. */
  partyId: string | null;
  /** Número propio del módulo: 'LIQ-VE-001' (antes 'LIQ-0001'). */
  number: string;
  /** Número del viaje (`route_number`), congelado. */
  tripNumber: string;
  /** 'YYYY-MM-DD'. Fecha del viaje: es la que resolvió la vigencia de las reglas. */
  settlementDate: string;
  status: SettlementStatus;
  /** Foto del viaje al emitir. */
  tripInfo: TripRecord;
  /** Lo cargado a mano al liquidar. */
  tripEdits: TripEdits;
  /** Liquidación que reemplazó a esta al re-liquidar. Nulo = sigue vigente (o anulada sin reemplazo). */
  supersededBy: string | null;
  currency: string;
  totalAmount: Money;
  notes: string | null;
  marginReason: string | null;
  marginStatus: MarginStatus | null;
  marginAmount: Money | null;
  marginPct: string | null;
  costTotal: Money | null;
  costModelId: string | null;
  /** Valor de la mercancía del viaje al emitir. Nulo = no se conocía. */
  cargoValue: Money | null;
  /** Reparto del total entre casas comerciales al emitir. Nulo = el viaje no tenía pedidos. */
  allocation: Allocation | null;
  /** Pedidos del viaje al emitir y qué se hizo con cada uno. Nulo = no había pedidos cargados. */
  orders: SettlementOrder[] | null;
  trip: TripContext;
  trace: TraceLine[];
  discarded: DiscardedRule[];
  stageSubtotals: Record<Stage, Money>;
  warnings: string[];
  overrides: Record<string, Override>;
  adhocRules: Rule[];
  /** Reglas del catálogo que produjeron líneas, tal como estaban al emitir (para poder explicarlas después). */
  rulesUsed: Rule[];
  /** Líneas que el liquidador destildó: se excluyeron del total. */
  excludedSeqs: number[];
  /** Base de cálculo cambiada por el liquidador. Nulo = se usó la base por defecto. */
  baseChange?: SettlementBaseChange | null;
  returns: SettlementReturn[];
  createdAt: string;
  updatedAt: string;
}

// ── Costo + margen (Fase 2) ───────────────────────────────────────────────────────────────────
// El costo de operar un viaje de FLOTA PROPIA es lo que se liquida: la acumulación de gastos de la
// estructura de costos es el total a pagar (y las reglas, si las hay, solo ajustan encima). Vive
// fuera del AST de Rule porque sus conceptos (prorrateo mensual, costo por km) no son de tarifas.

// ── Estructura de costos por filas ────────────────────────────────────────────────────────────
// Es la ÚNICA fuente de costo de la flota propia (antes había además tres tasas fijas por país).
// Una estructura de costos real tiene
// decenas de conceptos —salarios, aguinaldo, seguros, depreciación, mantenimiento por km— y cada
// uno se prorratea de una manera distinta. Eso es una TABLA, no tres columnas.

/** Cómo se convierte el importe de una fila en plata de ESTE viaje. */
export type BuiltinCostDriver =
  /** Importe fijo por viaje. */
  | 'FIXED'
  /** Por kilómetro recorrido. */
  | 'PER_KM'
  /** Por día del viaje (1 + noches de pernocta). */
  | 'PER_DAY'
  /** Importe MENSUAL: se divide entre los días operativos del mes y se multiplica por los días
   *  del viaje. Es la forma en que las planillas reales cargan salarios y depreciación. */
  | 'PER_MONTH_PRORATED'
  /** Por parada/cliente atendido. */
  | 'PER_CLIENT'
  /** Por hora de duración del viaje. */
  | 'PER_HOUR';

/** Un driver del sistema o una variable personalizada NUMÉRICA de la compañía ("peajes", "bultos"). */
export type CostDriver = BuiltinCostDriver | CustomVarKey;

/** Cada cuánto se repite el costo de un componente (ver `componentCostPerKm`). */
export type CostFrequency = 'km' | 'year' | 'month';

/** Grupo de presentación de una fila de la estructura. */
export type CostGroup = 'conductor' | 'ayudante' | 'otros' | 'depreciacion' | 'mantenimiento';

/** Valores con los que se calculan las filas de una estructura (los edita quien la carga). */
export interface CostStructureParams {
  /** Kilómetros que recorre un camión en un año. Amortiza los componentes `year` y `month`. */
  kmPerYear: number | null;
  /** Precio del litro de combustible. Sin él no se calcula la línea de combustible. */
  fuelPrice: Money | null;
  /** Rendimiento km por litro, por tipo de camión (`vehicles.vehicle_type`). */
  fuelEfficiency: Record<string, Money>;
}

export interface CostStructure {
  id: string;
  /** Compañía dueña de esta estructura. Null = estructura por defecto del país (flota propia). */
  partyId: string | null;
  countryId: string;
  name: string;
  /** Divisor de `PER_MONTH_PRORATED`. En la planilla de ejemplo son 30. */
  operatingDaysPerMonth: number;
  params: CostStructureParams;
  /** Desde cuándo rige. Null = siempre. */
  effectiveFrom: string | null;
  active: boolean;
  notes: string | null;
}

export interface CostStructureRow {
  id: string;
  structureId: string;
  /** Identificador corto y estable de la fila ("SALARIO_CHOFER"). */
  code: string;
  label: string;
  driver: CostDriver;
  /** SIEMPRE sin signo: el signo lo pone `sign`, igual que el efecto en las reglas. */
  amount: Money;
  sign: 'ADD' | 'SUBTRACT';
  /**
   * Condición para que la fila cuente en este viaje. Reusa el mismo vocabulario que las reglas, así
   * que "la depreciación del camión de 3-4.5 t solo aplica a ese camión" se escribe igual que
   * cualquier otra condición del sistema.
   */
  appliesWhen: Pred | null;
  /** Solo presentación ("₡/km", "1 UND"). */
  unit: string | null;
  order: number;
  active: boolean;
  /** Grupo de presentación. Null = sin grupo. */
  group: CostGroup | null;
  /**
   * Componente que se repite cada cierto tiempo (mantenimiento, llantas…). Si está, la fila cuesta
   * `costPerKm × km del viaje`: `amount` es el costo de UNA reposición y `frequency`+`frequencyQty`
   * dicen cada cuánto se repite. `driver` se ignora.
   */
  frequency: CostFrequency | null;
  /** Cada cuántos km / años / meses se repite (según `frequency`). */
  frequencyQty: number | null;
  /** Cuántas unidades del componente se compran (informativo: el costo ya viene total). */
  unitQty: number | null;
  /** Costo por km derivado (para mostrar y exportar; el cálculo lo recalcula de sus datos). */
  costPerKm: Money | null;
  /** Solo para este tipo de camión (`vehicles.vehicle_type`). Null = todos. */
  truckType: string | null;
}

export interface CostBreakdown {
  total: Money;
  breakdown: TraceLine[];
  modelId: string;
  /** Moneda del costo. Siempre la local del país: el margen compara moneda contra la misma moneda. */
  currency: string;
}

// La ganancia o pérdida del viaje es un dato de AUDITORÍA, no de la liquidación: compara el valor
// de la mercancía que el viaje lleva (los pedidos de sus guías de despacho) contra los gastos
// operativos (lo que se liquida). No bloquea ni pide motivo: quien liquida solo ve cuánto se paga.
// Los umbrales solo colorean la alerta de auditoría.
export interface MarginPolicy {
  countryId: string;
  warnBelow: number;
  criticalBelow: number;
  /** Sin efecto desde 2026-10-05 (el margen es informativo). Se conserva por compatibilidad. */
  requireReasonBelow: number;
  /** Sin efecto desde 2026-10-05 (el margen es informativo). Se conserva por compatibilidad. */
  blockOnLoss: boolean;
}

export type MarginStatus = 'OK' | 'WARN' | 'CRITICAL' | 'LOSS';

export interface MarginResult {
  /** Valor de la mercancía − gastos operativos. */
  amount: Money;
  /** amount ÷ valor de la mercancía. */
  pct: string;
  status: MarginStatus;
  /** CARGO = se midió contra el valor de la mercancía; NONE = el viaje no tiene valor de pedidos cargado. */
  basis: 'CARGO' | 'NONE';
  /** Valor de la mercancía del viaje (suma de sus pedidos). */
  cargoValue: Money;
  /** Gastos operativos: lo que se liquida. */
  expense: Money;
  /** Moneda del margen: la local del país, igual que el total liquidado y el costo. */
  currency: string;
}

// ── Mercancía del viaje y reparto entre casas comerciales ─────────────────────────────────────

/** Lo que una casa comercial (cliente) pone en un viaje: sus pedidos, vistos por las guías de despacho. */
export interface CargoPart {
  customerId: string | null;
  code: string | null;
  name: string;
  /** Valor de la mercancía (`orders.total_amount`). */
  value: Money;
  weightKg: number;
  volumeM3: number;
  items: number;
  orders: number;
  /** De esos pedidos, cuántos se dejaron para liquidar después. */
  deferredOrders?: number;
}

/** Lo que se decide con un pedido de un viaje: anularlo (no entra en el reparto) o dejarlo para después. */
export type OrderMark = 'ANULADO' | 'DIFERIDO';

/** Un pedido de un viaje, visto por su guía de despacho (una guía lleva un pedido). */
export interface TripOrder {
  guideId: string;
  guideNumber: string | null;
  sequence: number | null;
  /** 'pending' | 'in_transit' | 'delivered' | 'failed' (vocabulario de guía de despacho). */
  deliveryStatus: string | null;
  orderId: string | null;
  orderNumber: string | null;
  customerId: string | null;
  customerCode: string | null;
  customerName: string | null;
  value: Money;
  weightKg: number;
  volumeM3: number;
  items: number;
  mark: OrderMark | null;
  markReason: string | null;
}

/** Qué se hizo con un pedido al emitir la liquidación (foto congelada). */
export interface SettlementOrder {
  orderId: string | null;
  orderNumber: string | null;
  guideNumber: string | null;
  customerName: string | null;
  value: Money;
  deliveryStatus: string | null;
  /** INCLUIDO = entra en el reparto; ANULADO = fuera, con su motivo; DIFERIDO = entra, pero su proforma queda pendiente. */
  status: 'INCLUIDO' | 'ANULADO' | 'DIFERIDO';
  reason: string | null;
}

/** Todo lo que lleva un viaje, por casa comercial. */
export interface CargoSummary {
  value: Money;
  weightKg: number;
  volumeM3: number;
  orders: number;
  parts: CargoPart[];
}

/** Con qué se reparte el costo del viaje entre las casas comerciales. */
export type AllocationCriterion = 'VALUE' | 'WEIGHT' | 'VOLUME';

export interface AllocationShare {
  customerId: string | null;
  code: string | null;
  name: string;
  /** Parte del reparto (0 a 1) con 6 decimales. */
  share: string;
  /** Lo que le toca pagar a la casa. La suma de todas es exactamente el total repartido. */
  amount: Money;
  value: Money;
  weightKg: number;
  volumeM3: number;
  orders: number;
  /** Pedidos de esta casa que quedaron para liquidar después: su proforma está pendiente. */
  deferredOrders?: number;
}

export interface Allocation {
  criterion: AllocationCriterion;
  /** Cuál se usó de verdad: cae a repartir por pedidos si la base elegida suma cero. */
  basis: AllocationCriterion | 'ORDERS';
  total: Money;
  currency: string;
  shares: AllocationShare[];
}

// ── Salida del kernel ────────────────────────────────────────────────────────────────────────

/** Origen de una línea del desglose: una regla del catálogo, una ad-hoc o una línea de costo. */
export type TraceSource = 'RULE' | 'ADHOC' | 'COST_ROW';

export interface TraceLine {
  seq: number;
  stage: Stage;
  ruleId: string | null; // null = línea ad-hoc sin persistir
  ruleCode: string;
  label: string;
  inputs: Record<string, string | number>;
  /** Lo que dictó la regla, antes de aplicar un override manual. */
  computed: Money;
  /** Si el monto salió de una tabla de tarifas, qué fila lo resolvió. */
  tableMatch?: RateTableMatch;
  /** De dónde viene la línea. Falta en liquidaciones guardadas antes de que se registrara. */
  source?: TraceSource;
  /** Alcance de la regla que la produjo ('COUNTRY' o 'PARTY'); solo si `source` es RULE. */
  ruleScope?: RuleScope;
  /** Compañía dueña de la regla cuando es de alcance 'PARTY'. */
  rulePartyId?: string | null;
  /** Versión de la regla al calcular. */
  ruleVersion?: number;
  override?: Override;
  /** `override.value` si existe; si no, `computed`. Es lo que entra al acumulado. */
  final: Money;
  /** Acumulado hasta esta línea. */
  runningSubtotal: Money;
}

export type DiscardReason =
  | 'CONDITION_FALSE' | 'EXCLUDED_BY_EXCLUSIVE' | 'LOST_MAX' | 'INACTIVE'
  /** Regla de país reemplazada por una de la compañía con el mismo código. */
  | 'OVERRIDDEN_BY_PARTY'
  /** La fecha del viaje cae fuera del período de vigencia de la regla. */
  | 'OUT_OF_PERIOD'
  /** La regla tiene una forma que el kernel no sabe leer: operador o condición desconocidos. */
  | 'RULE_BROKEN'
  /** El liquidador cambió la base de cálculo: esta regla BASE (o la estructura de costos) ya no aplica. */
  | 'BASE_REEMPLAZADA'
  /** Cobra el mismo concepto que la base elegida (p. ej. otra regla por km): se omite para no cobrar doble. */
  | 'DUPLICA_BASE';
export interface DiscardedRule {
  ruleCode: string;
  reason: DiscardReason;
  detail: string;
}

/**
 * Un problema que IMPIDE emitir la liquidación tal como está. Distinto de `warnings`, que son
 * avisos informativos: si algo hace que el total sea incorrecto, no alcanza con un texto que nadie
 * lee — tiene que frenar la emisión hasta que alguien lo resuelva o lo autorice.
 */
export interface CalcIssue {
  code:
    | 'BASE_NO_DISPONIBLE'
    | 'REFERENCIA_CIRCULAR'
    | 'TOTAL_NEGATIVO'
    | 'VARIABLE_INEXISTENTE'
    | 'COMPANIA_SIN_PERFIL'
    | 'COMPANIA_INACTIVA'
    /** Una regla no se pudo leer: el total está incompleto hasta arreglarla. */
    | 'REGLA_ILEGIBLE';
  message: string;
  ruleCode?: string;
}

// ── Cambio de base de cálculo ─────────────────────────────────────────────────────────────────
// La fase BASE sale por defecto de la estructura de costos (flota propia) o de las reglas BASE
// (terceros). El liquidador puede cambiarla por otro tipo de cobro; solo cambia la base, las demás
// fases siguen igual.

/** Tipos de cobro que puede tomar la base. TENDERING existe en el catálogo pero no tiene mecánica definida. */
export type BaseMethodId = 'PER_KM' | 'PER_UNIT' | 'FIXED' | 'VOLUME' | 'TENDERING';

/** De dónde sale la base elegida. */
export type BaseSourceKind = 'RULE' | 'RATE_TABLE' | 'COST_STRUCTURE';

export interface BaseSource {
  kind: BaseSourceKind;
  /** Código de la regla / del tarifario, o id de la estructura de costos. */
  ref: string;
  /** Nombre legible para la persona. */
  label: string;
}

/** Lo que pide el liquidador: qué tipo de cobro usar como base. */
export interface BaseOverride {
  method: BaseMethodId;
}

/** Cómo se resolvió la base elegida: es lo que se muestra y lo que se guarda al emitir. */
export interface BaseInfo {
  method: BaseMethodId;
  source: BaseSource;
  /** Códigos de las reglas BASE (o de la estructura de costos) que dejaron de aplicar. */
  replaced: string[];
  /** Reglas de otras fases que cobraban lo mismo que la base y se omitieron. */
  duplicates: { ruleCode: string; detail: string }[];
}

/** La base elegida tal como queda en la liquidación emitida (auditoría). */
export interface SettlementBaseChange extends BaseInfo {
  changedBy: string | null;
  changedAt: string;
}

// El motor calcula cuánto se le debe LIQUIDAR (pagar) al transportista por el viaje — nunca un
// cobro a un cliente. No hay "costo interno vs cobrado" que comparar (no existe margen de venta en
// este módulo): la misma regla de negocio (propio → nómina, outsourcing → cuentas por pagar) se
// resuelve enteramente con reglas condicionadas por `fleetType`/`carrierId`, igual que cualquier
// otra condición del AST — nunca con un `if` de código que bifurque el modelo de cálculo.
export interface CalcResult {
  trace: TraceLine[];
  discarded: DiscardedRule[];
  stageSubtotals: Record<Stage, Money>;
  /** Total a liquidar. Es el importe que se paga y el que se muestra. */
  totalLiquidado: Money;
  /** Moneda del país: `country.localCurrency`. Todo el resultado está en ella. */
  currency: string;
  /** Gastos operativos de la estructura de costos (flota propia); ya están dentro del total liquidado. */
  cost: CostBreakdown;
  /** Ganancia/pérdida de auditoría: valor de la mercancía contra gastos operativos. */
  margin: MarginResult;
  /** Cómo se reparte el total entre las casas comerciales; null si el viaje no tiene pedidos cargados. */
  allocation: Allocation | null;
  /** Avisos informativos: el total es correcto, pero algo merece una mirada. */
  warnings: string[];
  /** Problemas que hacen que el total NO sea confiable. Vacío = la liquidación se puede emitir. */
  blockingIssues: CalcIssue[];
  /** Presente solo si el liquidador cambió la base de cálculo. */
  base?: BaseInfo;
}

// ── Entrada de calculate() — todo lo que el kernel necesita, nada implícito ───────────────────

export interface CalculateInput {
  country: Country;
  trip: TripContext;
  rules: Rule[];
  zones: Zone[];
  zoneGroups: ZoneGroup[];
  locations: Location[];
  /** Tablas de tarifas disponibles para este viaje (las del país + las de su compañía). */
  rateTables?: RateTable[];
  rateTableRows?: RateTableRow[];
  /** Mercancía del viaje (pedidos de sus guías). Sin ella no hay margen de auditoría ni reparto por casa. */
  cargo?: CargoSummary | null;
  /** Criterio de reparto entre casas comerciales. Por defecto el valor de la mercancía. */
  allocationCriterion?: AllocationCriterion;
  /** Variables declaradas por la compañía del viaje. Sin esto, sus reglas propias no resuelven. */
  partyVariables?: PartyVariable[];
  /** Estructura de costos de la compañía del viaje. Si existe, manda sobre cualquier otra. */
  costStructure?: CostStructure | null;
  costStructureRows?: CostStructureRow[];
  /** Estructura por defecto del país: costo de la flota propia sin estructura propia. */
  defaultCostStructure?: CostStructure | null;
  defaultCostStructureRows?: CostStructureRow[];
  marginPolicy: MarginPolicy;
  overrides?: Record<string, Override>; // indexados por ruleCode
  adhocRules?: Rule[]; // reglas del viaje actual, no persistidas
  /** Tipo de cobro que reemplaza a la base por defecto. Sin él, la base es la de siempre. */
  baseOverride?: BaseOverride;
}

// ── Proformas — viajes emitidos y persistidos ─────────────────────────────────────────────────

export type ProformaStatus = 'PENDIENTE' | 'EN_REVISION' | 'APROBADO' | 'LIQUIDADO';

/** Snapshot inmutable de un viaje emitido: `result` queda congelado al emitir y nunca se
 *  recalcula, aunque después cambien las reglas o los parámetros de costo. */
export interface Proforma {
  id: string;
  countryId: string;
  number: string; // secuencial legible, único por país: "VJ-0001"
  status: ProformaStatus;
  createdAt: string; // ISO 8601, igual a trip.quotedAt al momento de emitir
  trip: TripContext;
  overrides: Record<string, Override>;
  adhocRules: Rule[];
  result: CalcResult;
  reason?: string; // motivo capturado si la política de margen lo exigió
}

// ── Plantillas de viaje frecuente ──────────────────────────────────────────────────────────────

export interface Template {
  id: string;
  countryId: string;
  name: string;
  trip: Omit<TripContext, 'quotedAt'>;
  overrides?: Record<string, Override>;
}
