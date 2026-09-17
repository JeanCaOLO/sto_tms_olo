// Registro de esquema: la ÚNICA definición de cada entidad del tarifador. De acá salen, sin
// duplicar nada a mano: (1) el nombre de la colección dentro del JSON, (2) el nombre de la tabla
// en Postgres, (3) el DDL (`ddl.ts`), (4) el mapeo snake_case <-> camelCase (`naming.ts`) y
// (5) el prefijo de id de las filas nuevas.
//
// Regla de oro: agregar una entidad = agregar una entrada acá. Si se agrega en otro lado, el JSON
// y Postgres se desincronizan, que es exactamente el problema que esta capa existe para evitar.
//
// Alcance: SOLO datos propios del tarifador. Las tablas del TMS (carriers, drivers, vehicles,
// routes, stores, countries) NO se declaran acá — el tarifador las lee vía Supabase y nunca las
// escribe. Ver `repository.ts`.

export type ColumnType =
  | 'text'
  | 'int'
  | 'numeric'
  | 'boolean'
  | 'jsonb'
  | 'timestamptz';

// El universo de entidades, declarado como unión literal en vez de derivarlo de `ENTITIES`.
// Es a propósito: `ColumnDef.references` apunta a una EntityName, y derivar el tipo de la constante
// que a su vez se tipa con ColumnDef sería una referencia circular que TypeScript rechaza.
// `ENTITIES` lleva `satisfies Record<EntityName, EntityDef>`, así que el compilador igual exige
// que estén todas y solo estas.
export type EntityName =
  | 'country'
  | 'zoneGroup'
  | 'zone'
  | 'pricingRule'
  | 'pricingTemplate'
  | 'settlementParty'
  | 'partyVariable'
  | 'partyVehicleType'
  | 'route'
  | 'driver'
  | 'settlement'
  | 'costStructure'
  | 'costStructureRow'
  | 'rateTable'
  | 'rateTableRow'
  | 'ownCostParams'
  | 'outsourcedCostRate'
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
}

export interface EntityDef {
  /** Tabla en Postgres. */
  table: string;
  /** Clave de la colección dentro del JSON (`TarifasDatabase` en `localData/store.ts`). */
  collection: string;
  /** Prefijo de los ids generados para filas nuevas. */
  idPrefix: string;
  /** Etiqueta legible, para mensajes de error dirigidos al usuario. */
  label: string;
  /** Si es true, la entidad es append-only: la capa rechaza update y delete. */
  appendOnly?: boolean;
  columns: Record<string, ColumnDef>;
}

// `numeric` viaja como STRING, no como number de JS — igual que `Money` en el kernel y que el
// comportamiento por defecto de node-postgres para columnas numeric. Es deliberado: convertir a
// number perdería precisión decimal, que es justo lo que el kernel evita con decimal.js.
//
// Nota sobre las filas existentes: el driver JSON NO coacciona tipos al leer (algunas filas de la
// semilla guardan un numeric como number de JS, p.ej. `warn_below: 0.15`). Convertirlas ahora
// cambiaría el comportamiento del módulo; la normalización sigue donde ya estaba, en el borde del
// kernel (`repository.ts`).

const idColumn = (): ColumnDef => ({ type: 'text', primaryKey: true });

export const ENTITIES = {
  country: {
    table: 'tarifas_countries',
    collection: 'countries',
    idPrefix: 'country',
    label: 'País',
    columns: {
      id: idColumn(),
      iso2: { type: 'text' },
      name: { type: 'text' },
      local_currency: { type: 'text' },
      rounding_decimals: { type: 'int' },
      rounding_mode: { type: 'text' },
      overnight_threshold_hours: { type: 'int' },
    },
  },

  zoneGroup: {
    table: 'tarifas_zone_groups',
    collection: 'zoneGroups',
    idPrefix: 'zg',
    label: 'Grupo de zona',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      code: { type: 'text' },
      name: { type: 'text' },
      status: { type: 'text' },
    },
  },

  zone: {
    table: 'tarifas_zones',
    collection: 'zones',
    idPrefix: 'zone',
    label: 'Zona',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      zone_group_id: { type: 'text', nullable: true, references: 'zoneGroup', onDelete: 'set null' },
      code: { type: 'text' },
      name: { type: 'text' },
      status: { type: 'text' },
    },
  },

  // Puente entre la geografía del TMS (tiendas, tipos de ruta) y la del tarifador (zonas).
  // Sin él, una liquidación real no resuelve su zona y las reglas por zona nunca aplican.


  pricingRule: {
    table: 'tarifas_pricing_rules',
    collection: 'pricingRules',
    idPrefix: 'rule',
    label: 'Regla de tarifa',
    columns: {
      id: idColumn(),
      // Nullable = regla global (aplica a cualquier país configurado). Ver `repository.ts`.
      country_id: { type: 'text', nullable: true, references: 'country', indexed: true },
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
      country_id: { type: 'text', references: 'country', indexed: true },
      name: { type: 'text' },
      trip: { type: 'jsonb' },
    },
  },

  // Compañía a la que se le liquida un viaje: flota propia o transportista tercero. Es la entidad
  // del TARIFADOR, no del TMS — acá vive lo que el tarifador necesita para liquidar (clasificación,
  // datos fiscales, moneda vía país) y nada más.
  //
  // `carrier_id` enlaza OPCIONALMENTE con `carriers.id` del TMS (Supabase). Sin FK declarada, a
  // propósito: son fuentes distintas, el tarifador no es dueño de esa tabla y un perfil debe poder
  // existir sin contraparte en el TMS (es justo el caso de la flota propia).
  settlementParty: {
    table: 'tarifas_settlement_parties',
    collection: 'settlementParties',
    idPrefix: 'party',
    label: 'Compañía a liquidar',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      classification: { type: 'text', indexed: true }, // 'OWN' | 'OUTSOURCED'
      code: { type: 'text' },
      name: { type: 'text' },
      tax_id: { type: 'text', nullable: true },
      tax_id_type: { type: 'text', nullable: true }, // RIF | NIT | CEDULA_JURIDICA | OTRO
      carrier_id: { type: 'text', nullable: true, indexed: true },
      contact_name: { type: 'text', nullable: true },
      email: { type: 'text', nullable: true },
      phone: { type: 'text', nullable: true },
      address: { type: 'text', nullable: true },
      // Baja lógica: una compañía referenciada por tarifas o liquidaciones históricas nunca se
      // borra, se desactiva. Ver `partiesDataSource.ts`.
      status: { type: 'text', indexed: true }, // 'active' | 'inactive'
      notes: { type: 'text', nullable: true },
    },
  },

  // Variables personalizadas de una compañía: campos que la compañía agrega para calcular su
  // liquidación, más allá del vocabulario que trae el sistema. Cada una declara DE DÓNDE sale su
  // valor, que es lo que permite que el motor sepa con qué número evaluarla:
  //   CONSTANT  -> un valor configurado en la compañía (p.ej. "bono nocturno = 15")
  //   PER_TRIP  -> un dato que se carga en cada liquidación (p.ej. "horas de espera")
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

  // Estructura de costos de una compañía: la planilla real, fila por fila. Reemplaza al modelo de
  // tres campos (`ownCostParams`), que queda como respaldo para quien no cargó la suya.
  // Catálogo de vehículos de una compañía. El `code` coincide con el `truck_type_id` de sus
  // tarifas, así que un tarifario importado queda conectado con la capacidad de cada camión.
  partyVehicleType: {
    table: 'tarifas_party_vehicle_types',
    collection: 'partyVehicleTypes',
    idPrefix: 'pvt',
    label: 'Tipo de vehículo',
    columns: {
      id: idColumn(),
      party_id: { type: 'text', references: 'settlementParty', onDelete: 'cascade', indexed: true },
      code: { type: 'text', indexed: true },
      name: { type: 'text' },
      volume_m3: { type: 'numeric' },
      weight_tons: { type: 'numeric' },
      notes: { type: 'text', nullable: true },
      active: { type: 'boolean', indexed: true },
    },
  },

  // Ruta del TARIFADOR: la lane comercial de un transportista (`CAR-CCS`), no la ruta operativa del
  // TMS. Es de donde salen los datos del viaje al liquidar: zonas, km, paradas, bultos, peajes.
  //
  // NO lleva importe. La tarifa de la ruta sale del tarifario de su compañía, con clave
  // (zona origen, zona destino). Ponerle un `amount` acá sería el segundo lugar donde buscar por
  // qué un viaje cobró lo que cobró — exactamente lo que costó desarmar `zoneLaneRate`.
  route: {
    table: 'tarifas_routes',
    collection: 'routes',
    idPrefix: 'route',
    label: 'Ruta',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      /** Transportista dueño. Se borra con él: una ruta sin compañía no se liquida. */
      party_id: { type: 'text', references: 'settlementParty', onDelete: 'cascade', indexed: true },
      /** Código operativo, 'CAR-CCS'. Único dentro de la compañía. */
      code: { type: 'text', indexed: true },
      name: { type: 'text' },
      // RESTRICT a propósito: el tarifario guarda el CÓDIGO de la zona y por eso perdió la
      // protección que daba la clave foránea. Acá se recupera.
      origin_zone_id: { type: 'text', references: 'zone', indexed: true },
      dest_zone_id: { type: 'text', references: 'zone', indexed: true },
      km: { type: 'numeric' },
      /** Paradas/clientes atendidos. Alimenta `clientCount` del viaje. */
      stop_count: { type: 'int' },
      package_count: { type: 'int' },
      weight_kg: { type: 'numeric' },
      /** Cantidad de peajes y su monto: son dos variables distintas del motor, hacen falta las dos. */
      toll_count: { type: 'int' },
      tolls_amount: { type: 'numeric' },
      duration_hours: { type: 'numeric' },
      notes: { type: 'text', nullable: true },
      /** Baja LÓGICA: hay liquidaciones emitidas que la nombran. */
      active: { type: 'boolean', indexed: true },
    },
  },

  // Conductor del tarifador. Existe porque la guía física trae NOMBRE y CÉDULA y casi nunca la
  // compañía: `driverSearch.ts` resuelve esa búsqueda desde hace tiempo, pero no había de dónde
  // sacar la lista — se leía del TMS.
  driver: {
    table: 'tarifas_drivers',
    collection: 'drivers',
    idPrefix: 'drv',
    label: 'Conductor',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      party_id: { type: 'text', references: 'settlementParty', onDelete: 'cascade', indexed: true },
      full_name: { type: 'text', indexed: true },
      /** Cédula. Se guarda como la tipearon; la comparación normaliza (ver `normalizeDocument`). */
      document: { type: 'text', nullable: true, indexed: true },
      phone: { type: 'text', nullable: true },
      license: { type: 'text', nullable: true },
      /** 'YYYY-MM-DD'. Texto, igual que la vigencia de las reglas: es fecha de calendario. */
      license_expires_at: { type: 'text', nullable: true },
      notes: { type: 'text', nullable: true },
      active: { type: 'boolean', indexed: true },
    },
  },

  // La liquidación EMITIDA, con su desglose completo.
  //
  // El desglose se guarda DESNORMALIZADO y sin clave foránea hacia `pricingRule`, a propósito: una
  // liquidación emitida tiene que poder releerse tal cual se emitió aunque después la regla se
  // edite, se desactive o se borre. Es la misma razón por la que las reglas se versionan.
  settlement: {
    table: 'tarifas_settlements',
    collection: 'settlements',
    idPrefix: 'stl',
    label: 'Liquidación',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      // RESTRICT en los tres: una liquidación emitida no se borra porque alguien dio de baja la
      // compañía, la ruta o el conductor. Las pantallas hacen baja lógica.
      party_id: { type: 'text', references: 'settlementParty', indexed: true },
      route_id: { type: 'text', nullable: true, references: 'route', indexed: true },
      driver_id: { type: 'text', nullable: true, references: 'driver', indexed: true },
      /** Número propio del módulo, 'LIQ-0001'. Único por país. */
      number: { type: 'text', indexed: true },
      /** Nro de viaje de la GUÍA FÍSICA. Es el dato con el que la gente busca. */
      trip_number: { type: 'text', nullable: true, indexed: true },
      /** Fecha de la liquidación, 'YYYY-MM-DD'. Es la que resuelve la vigencia de las reglas. */
      settlement_date: { type: 'text', indexed: true },
      truck_type_id: { type: 'text', nullable: true },
      /** 'Borrador' | 'En Revisión' | 'Aprobado' | 'Pagado' | 'Anulado'. */
      status: { type: 'text', indexed: true },
      /** Moneda del país al emitir. Se congela: el país podría cambiarla después. */
      currency: { type: 'text' },
      total_amount: { type: 'numeric' },
      notes: { type: 'text', nullable: true },
      /** Motivo obligatorio cuando el margen cae bajo el umbral de la política. */
      margin_reason: { type: 'text', nullable: true },
      margin_status: { type: 'text', nullable: true, indexed: true },
      margin_amount: { type: 'numeric', nullable: true },
      margin_pct: { type: 'numeric', nullable: true },
      cost_total: { type: 'numeric', nullable: true },
      cost_model_id: { type: 'text', nullable: true },
      /** El viaje con el que se calculó, variables personalizadas incluidas. Sin esto no se recalcula. */
      trip: { type: 'jsonb' },
      /** Qué regla aportó cuánto. El desglose que hoy se pierde al guardar. */
      trace: { type: 'jsonb' },
      /** Qué NO aplicó y por qué. Es la mitad de cualquier auditoría. */
      discarded: { type: 'jsonb' },
      stage_subtotals: { type: 'jsonb' },
      warnings: { type: 'jsonb' },
      /** Montos corregidos a mano, con su motivo. */
      overrides: { type: 'jsonb' },
      /** Reglas puntuales de esta liquidación, que no viven en el catálogo. */
      adhoc_rules: { type: 'jsonb' },
      /** Líneas destildadas: se excluyeron del total y hay que poder decir cuáles. */
      excluded_seqs: { type: 'jsonb' },
      /** Devoluciones informadas. No afectan el pago; se registran para la auditoría. */
      returns: { type: 'jsonb' },
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
      party_id: { type: 'text', references: 'settlementParty', onDelete: 'cascade', indexed: true },
      country_id: { type: 'text', references: 'country', indexed: true },
      name: { type: 'text' },
      /** Divisor del prorrateo mensual. En la planilla de ejemplo, 30. */
      operating_days_per_month: { type: 'int' },
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
      country_id: { type: 'text', references: 'country', indexed: true },
      /** Null = tabla del país, la usan todas las compañías. */
      party_id: { type: 'text', nullable: true, references: 'settlementParty', onDelete: 'cascade', indexed: true },
      /** Código con el que la referencia una regla. */
      code: { type: 'text', indexed: true },
      name: { type: 'text' },
      /** Variables que forman la clave, en orden. */
      key_columns: { type: 'jsonb' },
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
      row_order: { type: 'int' },
      active: { type: 'boolean', indexed: true },
    },
  },

  ownCostParams: {
    table: 'tarifas_own_cost_params',
    collection: 'ownCostParams',
    idPrefix: 'own',
    label: 'Parámetros de costo propio',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      cost_per_km: { type: 'numeric' },
      depreciation_per_km: { type: 'numeric' },
      driver_daily: { type: 'numeric' },
    },
  },

  outsourcedCostRate: {
    table: 'tarifas_outsourced_cost_rates',
    collection: 'outsourcedCostRates',
    idPrefix: 'osr',
    label: 'Tarifa de outsourcing',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
      // Apunta al perfil liquidable del tarifador, no al `carriers.id` del TMS. El nombre de la
      // columna se conserva para no romper las filas ya guardadas.
      carrier_id: { type: 'text', references: 'settlementParty', indexed: true },
      truck_type_id: { type: 'text' },
      flat_rate: { type: 'numeric' },
    },
  },

  marginPolicy: {
    table: 'tarifas_margin_policies',
    collection: 'marginPolicies',
    idPrefix: 'mp',
    label: 'Política de margen',
    columns: {
      id: idColumn(),
      country_id: { type: 'text', references: 'country', indexed: true },
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

export function primaryKeyOf(name: EntityName): string {
  const found = Object.entries(entityDef(name).columns).find(([, col]) => col.primaryKey);
  if (!found) throw new Error(`La entidad "${name}" no declara columna primaria`);
  return found[0];
}

export function columnNames(name: EntityName): string[] {
  return Object.keys(entityDef(name).columns);
}
