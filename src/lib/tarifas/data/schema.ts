// Registro de esquema: la ÚNICA definición de cada entidad que el tarifador lee o escribe. De acá
// salen, sin duplicar nada a mano: (1) el nombre de la colección dentro del JSON, (2) el nombre de
// la tabla en Postgres, (3) el DDL (`ddl.ts`), (4) el manifiesto que valida el backend
// (`manifest.ts` -> `backend/tarifas/src/schema_manifest.json`) y (5) el prefijo de id de las
// filas nuevas.
//
// Regla de oro: agregar una entidad = agregar una entrada acá. Si se agrega en otro lado, el JSON,
// Postgres y el backend se desincronizan, que es exactamente el problema que esta capa existe
// para evitar.
//
// Dos clases de entidad (ver docs/tarifador/ROADMAP.md §8):
//
//   PROPIAS   — lo de CÁLCULO: reglas, tarifarios, estructura de costos, variables personalizadas,
//               política de margen, liquidaciones emitidas. El tarifador las crea y edita; su DDL
//               se genera desde acá (tablas `tarifas_*`).
//   EXTERNAS  — datos maestros y operativos del TMS: viajes de guía de despacho, transportistas,
//               conductores, vehículos, zonas, países. El tarifador SOLO las lee, y también pasan
//               por esta capa (nada se lee "por fuera" del ORM). `external` hace que los drivers
//               rechacen cualquier escritura y que `ddl.ts` no genere su DDL: el dueño de esas
//               tablas es otro módulo.

export type ColumnType =
  | 'text'
  | 'int'
  | 'numeric'
  | 'boolean'
  | 'jsonb'
  | 'timestamptz'
  // Ids del TMS. En el JSON viaja como string, igual que en node-postgres.
  | 'uuid';

// El universo de entidades, declarado como unión literal en vez de derivarlo de `ENTITIES`.
// Es a propósito: `ColumnDef.references` apunta a una EntityName, y derivar el tipo de la constante
// que a su vez se tipa con ColumnDef sería una referencia circular que TypeScript rechaza.
// `ENTITIES` lleva `satisfies Record<EntityName, EntityDef>`, así que el compilador igual exige
// que estén todas y solo estas.
export type EntityName =
  // ── Externas (TMS, solo lectura) ──
  | 'country'
  | 'zone'
  | 'carrier'
  | 'driver'
  | 'vehicle'
  | 'trip'
  | 'dispatchGuide'
  | 'tripReturn'
  | 'tripOrder'
  // ── Propias (cálculo) ──
  | 'countrySettings'
  | 'zoneGroup'
  | 'pricingRule'
  | 'pricingTemplate'
  | 'settlementParty'
  | 'partyVariable'
  | 'settlement'
  | 'tripOrderMark'
  | 'costStructure'
  | 'costStructureRow'
  | 'rateTable'
  | 'rateTableRow'
  | 'marginPolicy'
  | 'auditLog';

export interface ColumnDef {
  type: ColumnType;
  /** Por defecto NOT NULL. */
  nullable?: boolean;
  primaryKey?: boolean;
  /** Nombre de la entidad referenciada (clave de ENTITIES), para la FK del DDL. */
  references?: EntityName;
  /** Qué hacer al borrar el padre. Por defecto 'restrict'. */
  onDelete?: 'restrict' | 'cascade' | 'set null';
  /** Índice simple sobre esta columna (los filtros más usados del módulo). */
  indexed?: boolean;
  /** Único en toda la tabla. El driver JSON lo hace cumplir igual que Postgres. */
  unique?: boolean;
}

/**
 * Índice único PARCIAL: la combinación de `columns` es única entre las filas que cumplen `where`.
 * `where` es estructurado (no SQL) para que el driver JSON pueda evaluarlo igual que Postgres.
 */
export interface UniqueIndexDef {
  name: string;
  columns: string[];
  where?: { column: string; op: 'eq' | 'neq'; value: string };
  /** Mensaje para el usuario cuando se viola. */
  message: string;
}

export interface ExternalDef {
  /**
   * Tabla real del TMS. Cuando la entidad se lee desde una VISTA (`trip`, `tripReturn`), las FK de
   * las tablas propias apuntan a esta tabla base, no a la vista.
   */
  baseTable: string;
}

export interface EntityDef {
  /** Tabla (o vista) en Postgres. */
  table: string;
  /** Clave de la colección dentro del JSON (`TarifasDatabase` en `localData/store.ts`). */
  collection: string;
  /** Prefijo de los ids generados para filas nuevas. Las externas no generan ids. */
  idPrefix: string;
  /** Etiqueta legible, para mensajes de error dirigidos al usuario. */
  label: string;
  /** Si es true, la entidad es append-only: la capa rechaza update y delete. */
  appendOnly?: boolean;
  /** Presente = entidad del TMS: solo lectura, sin DDL generado. */
  external?: ExternalDef;
  uniqueIndexes?: UniqueIndexDef[];
  columns: Record<string, ColumnDef>;
}

// `numeric` viaja como STRING, no como number de JS — igual que `Money` en el kernel y que el
// comportamiento por defecto de node-postgres para columnas numeric. Es deliberado: convertir a
// number perdería precisión decimal, que es justo lo que el kernel evita con decimal.js.
//
// Nota sobre las filas existentes: el driver JSON NO coacciona tipos al leer (algunas filas de la
// semilla guardan un numeric como number de JS, p.ej. `warn_below: 0.15`). La normalización sigue
// donde ya estaba, en el borde del kernel.

const idColumn = (): ColumnDef => ({ type: 'text', primaryKey: true });
const uuidId = (): ColumnDef => ({ type: 'uuid', primaryKey: true });

/** País: entidad externa (`countries`). Toda tabla propia lo referencia con un uuid. */
const countryRef = (extra: Partial<ColumnDef> = {}): ColumnDef => ({
  type: 'uuid',
  references: 'country',
  indexed: true,
  ...extra,
});

export const ENTITIES = {
  // ════════════════════════════════════════════════════════════════════════════════════════════
  // EXTERNAS — TMS, solo lectura. Se declaran SOLO las columnas que el tarifador usa: es también
  // la lista blanca de lo que el backend deja leer.
  // ════════════════════════════════════════════════════════════════════════════════════════════

  country: {
    table: 'countries',
    collection: 'countries',
    idPrefix: 'country',
    label: 'País',
    external: { baseTable: 'countries' },
    columns: {
      id: uuidId(),
      code: { type: 'text' },
      name: { type: 'text' },
      /** Moneda de liquidación del país. Se congela en cada liquidación al emitirla. */
      currency: { type: 'text' },
      status: { type: 'text', nullable: true },
    },
  },

  // Zona del catálogo. Las reglas y los tarifarios comparan su `code` (en CR, el código de ruta del
  // WMS: '01', '02'…), nunca el id.
  zone: {
    table: 'zones',
    collection: 'zones',
    idPrefix: 'zone',
    label: 'Zona',
    external: { baseTable: 'zones' },
    columns: {
      id: uuidId(),
      country_id: { type: 'uuid', indexed: true },
      code: { type: 'text', nullable: true, indexed: true },
      name: { type: 'text' },
      status: { type: 'text' },
    },
  },

  // Transportista del catálogo: es la compañía a la que se le liquida. Flota propia o tercero lo
  // decide `is_flota_propia`, no el liquidador.
  carrier: {
    table: 'carriers',
    collection: 'carriers',
    idPrefix: 'carrier',
    label: 'Transportista',
    external: { baseTable: 'carriers' },
    columns: {
      id: uuidId(),
      country_id: { type: 'uuid', nullable: true, indexed: true },
      code: { type: 'text' },
      name: { type: 'text' },
      tax_id: { type: 'text', nullable: true },
      is_flota_propia: { type: 'boolean' },
      status: { type: 'text', nullable: true },
    },
  },

  driver: {
    table: 'drivers',
    collection: 'drivers',
    idPrefix: 'drv',
    label: 'Conductor',
    external: { baseTable: 'drivers' },
    columns: {
      id: uuidId(),
      carrier_id: { type: 'uuid', nullable: true, indexed: true },
      code: { type: 'text' },
      full_name: { type: 'text' },
      document: { type: 'text', nullable: true },
      phone: { type: 'text' },
      license_number: { type: 'text' },
      status: { type: 'text', nullable: true },
    },
  },

  // Vehículo del catálogo. `vehicle_type` (texto) es el "tipo de camión" con el que se buscan las
  // tarifas; la capacidad sale de acá (peso en kg, volumen en m³).
  vehicle: {
    table: 'vehicles',
    collection: 'vehicles',
    idPrefix: 'veh',
    label: 'Vehículo',
    external: { baseTable: 'vehicles' },
    columns: {
      id: uuidId(),
      carrier_id: { type: 'uuid', nullable: true, indexed: true },
      plate: { type: 'text' },
      vehicle_type: { type: 'text', indexed: true },
      capacity_weight: { type: 'numeric', nullable: true },
      capacity_volume: { type: 'numeric', nullable: true },
      status: { type: 'text', nullable: true },
    },
  },

  // El VIAJE a liquidar, ya armado: vista `tarifas_v_viajes` sobre `routes` (los viajes de guía de
  // despacho) + transportista + conductor + vehículo + zona destino. Ver sql/19_tarifas_aurora.sql.
  //
  // `status` llega NORMALIZADO por la vista ('completed' | 'planned' | 'in_progress' | otro en
  // minúsculas): solo un viaje 'completed' se liquida. `settlement_id` es la liquidación vigente
  // (no anulada) del viaje, o nulo si todavía no se liquidó.
  trip: {
    table: 'tarifas_v_viajes',
    collection: 'trips',
    idPrefix: 'trip',
    label: 'Viaje',
    external: { baseTable: 'routes' },
    columns: {
      id: uuidId(),
      country_id: { type: 'uuid', indexed: true },
      route_number: { type: 'text', indexed: true },
      /** 'YYYY-MM-DD'. Resuelve la vigencia de las reglas. */
      route_date: { type: 'text', indexed: true },
      status: { type: 'text', indexed: true },
      carrier_id: { type: 'uuid', nullable: true, indexed: true },
      carrier_name: { type: 'text', nullable: true },
      is_flota_propia: { type: 'boolean', nullable: true },
      driver_id: { type: 'uuid', nullable: true },
      driver_name: { type: 'text', nullable: true },
      driver_document: { type: 'text', nullable: true },
      vehicle_id: { type: 'uuid', nullable: true },
      vehicle_plate: { type: 'text', nullable: true },
      vehicle_type: { type: 'text', nullable: true },
      /** kg */
      capacity_weight: { type: 'numeric', nullable: true },
      /** m³ */
      capacity_volume: { type: 'numeric', nullable: true },
      dest_zone_id: { type: 'uuid', nullable: true },
      dest_zone_code: { type: 'text', nullable: true },
      dest_zone_name: { type: 'text', nullable: true },
      /** km */
      total_distance: { type: 'numeric', nullable: true },
      total_stops: { type: 'int', nullable: true },
      completed_stops: { type: 'int', nullable: true },
      /** kg */
      total_weight: { type: 'numeric', nullable: true },
      /** m³ */
      total_volume: { type: 'numeric', nullable: true },
      actual_start_time: { type: 'timestamptz', nullable: true },
      actual_end_time: { type: 'timestamptz', nullable: true },
      /** Calculada por la vista: fin real − inicio real, en horas. */
      duration_hours: { type: 'numeric', nullable: true },
      guide_count: { type: 'int' },
      /** Guías (una por pedido) ya entregadas. Contra `guide_count` dice si el viaje está 100 % entregado. */
      delivered_guides: { type: 'int' },
      return_count: { type: 'int' },
      settlement_id: { type: 'text', nullable: true, indexed: true },
    },
  },

  // Parada del viaje (una guía por pedido). Solo para mostrar el detalle.
  dispatchGuide: {
    table: 'dispatch_guides',
    collection: 'dispatchGuides',
    idPrefix: 'dg',
    label: 'Guía de despacho',
    external: { baseTable: 'dispatch_guides' },
    columns: {
      id: uuidId(),
      route_id: { type: 'uuid', indexed: true },
      guide_number: { type: 'text' },
      sequence_number: { type: 'int' },
      status: { type: 'text', nullable: true },
      delivery_status: { type: 'text', nullable: true },
      recipient_name: { type: 'text', nullable: true },
      actual_arrival_time: { type: 'timestamptz', nullable: true },
    },
  },

  // Devolución del viaje. `returns` no apunta al viaje sino a la guía; la vista
  // `tarifas_v_devoluciones` expone el `route_id` para poder filtrar por viaje.
  tripReturn: {
    table: 'tarifas_v_devoluciones',
    collection: 'tripReturns',
    idPrefix: 'ret',
    label: 'Devolución',
    external: { baseTable: 'returns' },
    columns: {
      id: uuidId(),
      route_id: { type: 'uuid', indexed: true },
      dispatch_guide_id: { type: 'uuid', nullable: true },
      return_number: { type: 'text' },
      return_type: { type: 'text' },
      reason: { type: 'text' },
      product_code: { type: 'text', nullable: true },
      product_name: { type: 'text', nullable: true },
      quantity: { type: 'int', nullable: true },
      status: { type: 'text', nullable: true },
    },
  },

  // Pedidos de un viaje, uno por guía de despacho (`tarifas_v_viaje_pedidos`): qué lleva cada guía,
  // de qué casa comercial es, cuánto vale y si ya se entregó. `mark` es lo que quien liquida decidió
  // con ese pedido (ANULADO / DIFERIDO), leído de `tarifas_trip_order_marks`.
  tripOrder: {
    table: 'tarifas_v_viaje_pedidos',
    collection: 'tripOrders',
    idPrefix: 'tor',
    label: 'Pedido del viaje',
    external: { baseTable: 'dispatch_guides' },
    columns: {
      id: uuidId(),
      route_id: { type: 'uuid', indexed: true },
      guide_number: { type: 'text', nullable: true },
      sequence_number: { type: 'int', nullable: true },
      delivery_status: { type: 'text', nullable: true },
      order_id: { type: 'uuid', nullable: true },
      order_number: { type: 'text', nullable: true },
      customer_id: { type: 'uuid', nullable: true },
      customer_code: { type: 'text', nullable: true },
      customer_name: { type: 'text', nullable: true },
      value: { type: 'numeric' },
      weight_kg: { type: 'numeric' },
      volume_m3: { type: 'numeric' },
      items: { type: 'int' },
      /** 'ANULADO' | 'DIFERIDO' | nulo (el pedido entra en la liquidación). */
      mark: { type: 'text', nullable: true },
      mark_reason: { type: 'text', nullable: true },
    },
  },

  // Lo que se decidió con un pedido concreto de un viaje antes de liquidarlo: anularlo (no entra en
  // el reparto) o dejarlo para liquidar después. Se conserva para que la decisión sobreviva entre
  // sesiones y quede a la vista de la auditoría.
  tripOrderMark: {
    table: 'tarifas_trip_order_marks',
    collection: 'tripOrderMarks',
    idPrefix: 'mrk',
    label: 'Marca de pedido',
    uniqueIndexes: [
      {
        name: 'tarifas_trip_order_marks_uq',
        columns: ['trip_id', 'order_id'],
        message: 'Ese pedido ya tiene una marca en este viaje.',
      },
    ],
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      trip_id: { type: 'uuid', references: 'trip', indexed: true },
      order_id: { type: 'uuid' },
      /** 'ANULADO' | 'DIFERIDO'. */
      mark: { type: 'text' },
      reason: { type: 'text', nullable: true },
      actor: { type: 'text', nullable: true },
    },
  },

  // ════════════════════════════════════════════════════════════════════════════════════════════
  // PROPIAS — lo de cálculo.
  // ════════════════════════════════════════════════════════════════════════════════════════════

  // Lo que el cálculo necesita del país y el catálogo no tiene. La moneda NO va acá: es del país.
  countrySettings: {
    table: 'tarifas_country_settings',
    collection: 'countrySettings',
    idPrefix: 'cset',
    label: 'Configuración de cálculo del país',
    columns: {
      id: idColumn(),
      country_id: countryRef({ unique: true }),
      rounding_decimals: { type: 'int' },
      rounding_mode: { type: 'text' },
      overnight_threshold_hours: { type: 'int' },
    },
  },

  // Agrupación de zonas para el cálculo ("Centro", "Valle Central"). La zona del catálogo no sabe
  // de grupos: el grupo guarda los CÓDIGOS de las zonas que abarca.
  zoneGroup: {
    table: 'tarifas_zone_groups',
    collection: 'zoneGroups',
    idPrefix: 'zg',
    label: 'Grupo de zona',
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      code: { type: 'text' },
      name: { type: 'text' },
      /** Códigos de `zones` que pertenecen al grupo. */
      zone_codes: { type: 'jsonb' },
      status: { type: 'text' },
    },
  },

  pricingRule: {
    table: 'tarifas_pricing_rules',
    collection: 'pricingRules',
    idPrefix: 'rule',
    label: 'Regla de tarifa',
    columns: {
      id: idColumn(),
      // Nullable = regla global (aplica a cualquier país configurado).
      country_id: countryRef({ nullable: true }),
      // 'COUNTRY' | 'PARTY'. Nullable: las reglas anteriores al alcance son todas de país.
      scope: { type: 'text', nullable: true, indexed: true },
      party_id: { type: 'text', nullable: true, references: 'settlementParty', onDelete: 'cascade', indexed: true },
      code: { type: 'text' },
      name: { type: 'text' },
      stage: { type: 'text', indexed: true },
      priority: { type: 'int' },
      stacking: { type: 'text' },
      exclusion_group: { type: 'text', nullable: true },
      conditions: { type: 'jsonb' },
      expression: { type: 'jsonb' },
      // Texto que explica la regla en castellano. Se genera solo desde `builder`, pero se puede
      // reescribir a mano; si se reescribe, deja de regenerarse.
      description: { type: 'text', nullable: true },
      /** Motivo de negocio: "acuerdo con EPA de agosto 2026". Texto libre, para auditoría. */
      reason: { type: 'text', nullable: true },
      /** 'INCREASE' | 'DECREASE'. El signo del importe deja de escribirse a mano. */
      effect: { type: 'text', nullable: true },
      // Forma VISUAL con la que se armó la regla (variable, operador, valor, efecto). El motor
      // ejecuta `expression`; esto existe para poder REABRIR la regla en el formulario simple en
      // vez de mandar al usuario al JSON. Nulo = regla armada en modo avanzado.
      builder: { type: 'jsonb', nullable: true },
      // Forma VISUAL de la condición (fila, operador, negación) — mismo motivo que `builder`: poder
      // reabrir en el formulario simple. Nulo = condición en modo avanzado, o "Siempre".
      condition_builder: { type: 'jsonb', nullable: true },
      is_adhoc: { type: 'boolean' },
      active: { type: 'boolean', indexed: true },
      // Vigencia, en 'YYYY-MM-DD' y con AMBOS extremos inclusivos. Nulo = sin límite por ese lado.
      // Se compara contra la fecha del VIAJE: sin esto, editar una tarifa cambiaba el resultado de
      // liquidaciones ya calculadas y no había forma de recalcular una vieja.
      effective_from: { type: 'text', nullable: true, indexed: true },
      effective_to: { type: 'text', nullable: true, indexed: true },
      version: { type: 'int' },
    },
  },

  pricingTemplate: {
    table: 'tarifas_pricing_templates',
    collection: 'pricingTemplates',
    idPrefix: 'tpl',
    label: 'Plantilla de viaje',
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      name: { type: 'text' },
      trip: { type: 'jsonb' },
    },
  },

  // PERFIL DE CÁLCULO de un transportista: el ancla de lo que el liquidador configura por compañía
  // (variables personalizadas, estructura de costos, tarifarios, reglas propias). NO tiene datos
  // maestros: nombre, NIT, contacto y flota propia/tercero se leen de `carriers`.
  //
  // Uno por transportista (`carrier_id` único). Se crea la primera vez que se configura algo del
  // transportista; un transportista sin perfil se liquida solo con las reglas del país.
  settlementParty: {
    table: 'tarifas_settlement_parties',
    collection: 'settlementParties',
    idPrefix: 'party',
    label: 'Perfil de cálculo',
    columns: {
      id: idColumn(),
      carrier_id: { type: 'uuid', references: 'carrier', unique: true, indexed: true },
      // Baja lógica: un perfil referenciado por tarifas o liquidaciones históricas nunca se borra.
      status: { type: 'text', indexed: true }, // 'active' | 'inactive'
      notes: { type: 'text', nullable: true },
    },
  },

  // Variables personalizadas de una compañía: todo dato que el viaje NO trae (peajes, recolectas,
  // bultos, horas de espera…). Cada una declara DE DÓNDE sale su valor:
  //   CONSTANT  -> un valor configurado en la compañía (p.ej. "bono nocturno = 15")
  //   PER_TRIP  -> un dato que se carga al liquidar cada viaje (p.ej. "peajes")
  partyVariable: {
    table: 'tarifas_party_variables',
    collection: 'partyVariables',
    idPrefix: 'pvar',
    label: 'Variable personalizada',
    columns: {
      id: idColumn(),
      party_id: { type: 'text', references: 'settlementParty', onDelete: 'cascade', indexed: true },
      /** Identificador usado en las reglas, siempre con el prefijo `custom:`. */
      key: { type: 'text', indexed: true },
      /** Nombre legible que se muestra en los desplegables. */
      label: { type: 'text' },
      /** 'NUMBER' | 'TEXT'. Solo las numéricas sirven para multiplicar o dividir. */
      kind: { type: 'text' },
      /** 'CONSTANT' | 'PER_TRIP'. */
      origin: { type: 'text' },
      /** Valor de la constante, o valor por defecto de la variable por viaje. */
      default_value: { type: 'text', nullable: true },
      /** Unidad para mostrar junto al número ("horas", "kg"). Solo presentación. */
      unit: { type: 'text', nullable: true },
      active: { type: 'boolean', indexed: true },
    },
  },

  // La liquidación EMITIDA de un viaje, con su desglose completo.
  //
  // El desglose se guarda DESNORMALIZADO y sin clave foránea hacia `pricingRule`, a propósito: una
  // liquidación emitida tiene que poder releerse tal cual se emitió aunque después la regla se
  // edite, se desactive o se borre. Por la misma razón `trip_info` congela lo que se leyó del viaje.
  //
  // Un viaje tiene UNA liquidación vigente (índice único parcial). Re-liquidar = anular la vigente
  // y emitir otra; la anulada apunta a su reemplazo con `superseded_by`.
  settlement: {
    table: 'tarifas_settlements',
    collection: 'settlements',
    idPrefix: 'stl',
    label: 'Liquidación',
    uniqueIndexes: [
      {
        name: 'tarifas_settlements_trip_vigente_uq',
        columns: ['trip_id'],
        where: { column: 'status', op: 'neq', value: 'Anulado' },
        message: 'El viaje ya tiene una liquidación vigente. Para recalcularlo, re-liquidalo.',
      },
    ],
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      /** El viaje liquidado (`routes.id`). RESTRICT: un viaje liquidado no se borra. */
      trip_id: { type: 'uuid', references: 'trip', indexed: true },
      /** Perfil de cálculo con el que se liquidó. Nulo = transportista sin perfil. */
      party_id: { type: 'text', nullable: true, references: 'settlementParty', indexed: true },
      /** Número propio del módulo, 'LIQ-0001'. Único por país. */
      number: { type: 'text', indexed: true },
      /** Número del viaje (`routes.route_number`), congelado: es el dato con el que la gente busca. */
      trip_number: { type: 'text', indexed: true },
      /** Fecha del viaje, 'YYYY-MM-DD'. Es la que resolvió la vigencia de las reglas. */
      settlement_date: { type: 'text', indexed: true },
      /** 'Borrador' | 'En Revisión' | 'Aprobado' | 'Pagado' | 'Anulado'. */
      status: { type: 'text', indexed: true },
      /** Moneda del país al emitir. Se congela: el país podría cambiarla después. */
      currency: { type: 'text' },
      total_amount: { type: 'numeric' },
      notes: { type: 'text', nullable: true },
      /** Sin efecto desde 2026-10-05 (el margen es informativo). Se conserva para liquidaciones anteriores. */
      margin_reason: { type: 'text', nullable: true },
      margin_status: { type: 'text', nullable: true, indexed: true },
      margin_amount: { type: 'numeric', nullable: true },
      margin_pct: { type: 'numeric', nullable: true },
      cost_total: { type: 'numeric', nullable: true },
      cost_model_id: { type: 'text', nullable: true },
      /** Valor de la mercancía del viaje al emitir (suma de sus pedidos). Nulo = no se conocía. */
      cargo_value: { type: 'numeric', nullable: true },
      /** Reparto del total entre casas comerciales (`Allocation`). Nulo = el viaje no tenía pedidos cargados. */
      allocation: { type: 'jsonb', nullable: true },
      /** Pedidos del viaje al emitir y qué pasó con cada uno (incluido, anulado, para después). Nulo = no había pedidos cargados. */
      orders: { type: 'jsonb', nullable: true },
      /** Foto del viaje tal como se leyó al emitir (transportista, conductor, placa, zona, km…). */
      trip_info: { type: 'jsonb' },
      /** Lo cargado a mano al liquidar: variables PER_TRIP. */
      trip_edits: { type: 'jsonb' },
      /** El contexto con el que calculó el motor. Sin esto no se recalcula. */
      trip: { type: 'jsonb' },
      /** Qué regla aportó cuánto. */
      trace: { type: 'jsonb' },
      /** Qué NO aplicó y por qué. Es la mitad de cualquier auditoría. */
      discarded: { type: 'jsonb' },
      stage_subtotals: { type: 'jsonb' },
      warnings: { type: 'jsonb' },
      /** Montos corregidos a mano, con su motivo. */
      overrides: { type: 'jsonb' },
      /** Reglas puntuales de esta liquidación, que no viven en el catálogo. */
      adhoc_rules: { type: 'jsonb' },
      /** Reglas del catálogo que produjeron líneas, tal como estaban al emitir: sirven para explicar la liquidación aunque la regla cambie después. */
      rules_used: { type: 'jsonb' },
      /** Líneas destildadas: se excluyeron del total y hay que poder decir cuáles. */
      excluded_seqs: { type: 'jsonb' },
      /** Devoluciones informadas. No afectan el pago; se registran para la auditoría. */
      returns: { type: 'jsonb' },
      /** Liquidación que reemplazó a esta al re-liquidar. Nulo = no fue reemplazada. */
      superseded_by: { type: 'text', nullable: true, indexed: true },
      created_at: { type: 'timestamptz' },
      updated_at: { type: 'timestamptz' },
    },
  },

  costStructure: {
    table: 'tarifas_cost_structures',
    collection: 'costStructures',
    idPrefix: 'cstr',
    label: 'Estructura de costos',
    columns: {
      id: idColumn(),
      /** Nulo = estructura por defecto del país (la usa la flota propia sin estructura propia). */
      party_id: { type: 'text', nullable: true, references: 'settlementParty', onDelete: 'cascade', indexed: true },
      country_id: countryRef(),
      name: { type: 'text' },
      /** Divisor del prorrateo mensual. En la planilla de ejemplo, 30. */
      operating_days_per_month: { type: 'int' },
      /** { kmPerYear, fuelPrice, fuelEfficiency: { <tipo de camión>: km/L } }. Ver `CostStructureParams`. */
      params: { type: 'jsonb' },
      effective_from: { type: 'timestamptz', nullable: true },
      active: { type: 'boolean', indexed: true },
      notes: { type: 'text', nullable: true },
    },
  },

  costStructureRow: {
    table: 'tarifas_cost_structure_rows',
    collection: 'costStructureRows',
    idPrefix: 'crow',
    label: 'Fila de estructura de costos',
    columns: {
      id: idColumn(),
      structure_id: { type: 'text', references: 'costStructure', onDelete: 'cascade', indexed: true },
      code: { type: 'text' },
      label: { type: 'text' },
      /** Cómo se convierte el importe en plata del viaje. Ver `CostDriver`. */
      driver: { type: 'text' },
      amount: { type: 'numeric' },
      /** 'ADD' | 'SUBTRACT'. El importe se guarda sin signo. */
      sign: { type: 'text' },
      /** Condición opcional, con el mismo vocabulario que las reglas. */
      applies_when: { type: 'jsonb', nullable: true },
      unit: { type: 'text', nullable: true },
      row_order: { type: 'int' },
      active: { type: 'boolean', indexed: true },
      /** Grupo de presentación: conductor | ayudante | otros | depreciacion | mantenimiento. */
      cost_group: { type: 'text', nullable: true },
      /** Componente que se repite: 'km' | 'year' | 'month'. Si está, la fila cuesta costo por km × km del viaje. */
      frequency: { type: 'text', nullable: true },
      /** Cada cuántos km / años / meses se repite. */
      frequency_qty: { type: 'numeric', nullable: true },
      /** Unidades del componente (informativo). */
      unit_qty: { type: 'numeric', nullable: true },
      /** Costo por km derivado, guardado para mostrar y exportar. */
      cost_per_km: { type: 'numeric', nullable: true },
      /** Solo para este tipo de camión (`vehicles.vehicle_type`). Nulo = todos. */
      truck_type: { type: 'text', nullable: true },
    },
  },

  // Tarifario indexado por combinaciones. Su clave NO es fija: la declara cada tabla en
  // `key_columns`, que es lo que permite pasar de "una regla por combinación" a "una fila por
  // combinación" — y lo que hace que un Excel se importe tal cual.
  rateTable: {
    table: 'tarifas_rate_tables',
    collection: 'rateTables',
    idPrefix: 'rt',
    label: 'Tabla de tarifas',
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      /** Null = tabla del país, la usan todas las compañías. */
      party_id: { type: 'text', nullable: true, references: 'settlementParty', onDelete: 'cascade', indexed: true },
      /** Código con el que la referencia una regla. */
      code: { type: 'text', indexed: true },
      name: { type: 'text' },
      /** Variables que forman la clave, en orden. */
      key_columns: { type: 'jsonb' },
      /** Columnas de valor adicionales al principal (nombres). Nulo o vacío = un solo valor por fila. */
      value_columns: { type: 'jsonb', nullable: true },
      active: { type: 'boolean', indexed: true },
    },
  },

  rateTableRow: {
    table: 'tarifas_rate_table_rows',
    collection: 'rateTableRows',
    idPrefix: 'rtr',
    label: 'Fila de tabla de tarifas',
    columns: {
      id: idColumn(),
      table_id: { type: 'text', references: 'rateTable', onDelete: 'cascade', indexed: true },
      /** Un valor por cada columna de la clave, en el mismo orden. `*` es comodín. */
      key: { type: 'jsonb' },
      amount: { type: 'numeric' },
      /** Valores de las columnas adicionales del tarifario, por nombre. */
      extra_values: { type: 'jsonb', nullable: true },
      row_order: { type: 'int' },
      active: { type: 'boolean', indexed: true },
    },
  },

  marginPolicy: {
    table: 'tarifas_margin_policies',
    collection: 'marginPolicies',
    idPrefix: 'mp',
    label: 'Política de margen',
    columns: {
      id: idColumn(),
      country_id: countryRef(),
      warn_below: { type: 'numeric' },
      critical_below: { type: 'numeric' },
      require_reason_below: { type: 'numeric' },
      block_on_loss: { type: 'boolean' },
    },
  },

  auditLog: {
    table: 'tarifas_audit_log',
    collection: 'auditLog',
    idPrefix: 'audit',
    label: 'Bitácora',
    // RNF-023/024: la bitácora no se edita ni se borra, ni desde la UI ni desde el código.
    appendOnly: true,
    columns: {
      id: idColumn(),
      entity: { type: 'text', indexed: true },
      entity_id: { type: 'text', indexed: true },
      action: { type: 'text' },
      user_name: { type: 'text' },
      role: { type: 'text' },
      before: { type: 'jsonb', nullable: true },
      after: { type: 'jsonb', nullable: true },
      reason: { type: 'text', nullable: true },
      created_at: { type: 'timestamptz', indexed: true },
    },
  },
} as const satisfies Record<EntityName, EntityDef>;

export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];

export function entityDef(name: EntityName): EntityDef {
  const def = ENTITIES[name] as EntityDef | undefined;
  if (!def) throw new Error(`Entidad desconocida en el registro de esquema: "${name}"`);
  return def;
}

export function isExternal(name: EntityName): boolean {
  return entityDef(name).external !== undefined;
}

/** Entidades cuyo DDL genera el tarifador (las `tarifas_*`). */
export const OWN_ENTITY_NAMES = ENTITY_NAMES.filter((name) => !isExternal(name));

export function primaryKeyOf(name: EntityName): string {
  const found = Object.entries(entityDef(name).columns).find(([, col]) => col.primaryKey);
  if (!found) throw new Error(`La entidad "${name}" no declara columna primaria`);
  return found[0];
}

export function columnNames(name: EntityName): string[] {
  return Object.keys(entityDef(name).columns);
}
