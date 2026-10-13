// Tarifarios: alta, baja y carga de filas.
//
// Barrel que re-exporta desde los módulos de la carpeta rateTables/.

// Schema and key variables
export {
  RATE_TABLE_CATEGORICAL_VARS,
  RATE_TABLE_RANGE_VARS,
  RATE_TABLE_KEY_VARS,
  isRangeKeyVar,
  isCustomKeyVar,
  keyVarsFor,
  ZONE_KEY_VARS,
  keyFingerprint,
  mismaClave,
} from './rateTables/schema';

// Table validation
export {
  type RateTableInput,
  type RateTableErrors,
  validateRateTable,
} from './rateTables/validation';

// Table CRUD
export {
  type SaveRateTableResult,
  listRateTables,
  getRateTable,
  saveRateTable,
  setRateTableActive,
  deleteRateTable,
} from './rateTables/crud';

// Row schema
export {
  type RateTableRowInput,
  type RateRowErrors,
  cleanValues,
  normalizeKey,
  toRow,
} from './rateTables/rows/schema';

// Row validation
export {
  validateRateRow,
} from './rateTables/rows/validation';

// Row CRUD
export {
  type SaveRateRowResult,
  listRateTableRows,
  saveRateRow,
  deleteRateRow,
} from './rateTables/rows/crud';

// Bulk operations
export {
  type BulkRow,
  type BulkResult,
  bulkUpsertRows,
  validateImportedRanges,
} from './rateTables/bulk';

// Zone integrity
export {
  type RateTableZoneUse,
  rowsUsingZone,
  zoneUsedByRateTables,
} from './rateTables/zones';
