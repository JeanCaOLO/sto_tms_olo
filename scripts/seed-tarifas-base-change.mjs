// Reglas de PRUEBA para el "Cambiar base de cálculo" del liquidador (módulo Tarifas).
//
// Solo INSERTA reglas nuevas en `tarifas_pricing_rules` para algunos terceros de Costa Rica que ya
// tienen perfil y viajes. No toca tarifarios, estructuras de costos, perfiles ni reglas existentes, y
// no hace DDL.
//
// Cada compañía recibe cuatro reglas BASE alternativas (por km, por parada, por volumen y fija). Son
// EXCLUSIVE con prioridad MAYOR (20..50) que su `BASE_FLETE` (prioridad 10): pierden por defecto, así
// que el total de cualquier liquidación existente NO cambia. Solo se vuelven la base cuando el
// liquidador elige ese tipo de cobro.
//
// Ids fijos `TEST_RULE_BASECHG_*` + ON CONFLICT DO NOTHING (idempotente). `--reset` borra únicamente
// esos ids.
//
// Uso (túnel Aurora arriba, ver scripts/tunel-aurora.ps1):
//   node --env-file=.env.local scripts/seed-tarifas-base-change.mjs                    (dry-run: ROLLBACK)
//   node --env-file=.env.local scripts/seed-tarifas-base-change.mjs --execute          (aplica)
//   node --env-file=.env.local scripts/seed-tarifas-base-change.mjs --reset --execute  (borra lo propio)

import pg from 'pg';

const execute = process.argv.includes('--execute');
const reset = process.argv.includes('--reset');

const pool = new pg.Pool({
  host: process.env.TMS_DB_HOST || 'localhost',
  port: Number(process.env.TMS_DB_PORT) || 5432,
  user: process.env.TMS_DB_USER,
  password: process.env.TMS_DB_PASSWORD,
  database: process.env.TMS_DB_NAME || 'tms_olo',
  ssl: { rejectUnauthorized: false },
});

/** Perfiles (tarifas_settlement_parties.id) con viajes completados en la base de pruebas. */
const PARTIES = {
  TEST_SP_TRANSOSA_DE_ALAJUELA_S_A: 'TRANSOSA',
  TEST_SP_TRANSMAJORI: 'TRANSMAJORI',
  TEST_SP_INVERSIONES_ACUNA_Y_SALAZAR_DEL_CARIBE_S_R_L: 'ACUNA',
};

// Órdenes de magnitud del PDF de tarifario (costo facturable ≈ ₡1 214/km), en colones.
const ALTERNATIVAS = [
  {
    code: 'BASE_KM_ALT', priority: 20, name: 'Base alternativa por kilómetro',
    expression: { op: 'PER_KM', rate: '1214.00' },
    description: 'Base alternativa: se pagan ₡1 214 por cada kilómetro del viaje.',
    builder: { variable: 'km', operator: 'TIMES', value: '1214.00', effect: 'INCREASE' },
  },
  {
    code: 'BASE_UNIDAD_ALT', priority: 30, name: 'Base alternativa por parada atendida',
    expression: { op: 'PER_UNIT', unit: 'clientCount', rate: '3200.00' },
    description: 'Base alternativa: se pagan ₡3 200 por cada parada o cliente atendido.',
    builder: { variable: 'clientCount', operator: 'TIMES', value: '3200.00', effect: 'INCREASE' },
  },
  {
    code: 'BASE_VOLUMEN_ALT', priority: 40, name: 'Base alternativa por volumen del camión',
    expression: { op: 'PER_UNIT', unit: 'truckVolumeM3', rate: '6000.00' },
    description: 'Base alternativa: se pagan ₡6 000 por cada m³ de capacidad del camión.',
    builder: { variable: 'truckVolumeM3', operator: 'TIMES', value: '6000.00', effect: 'INCREASE' },
  },
  {
    code: 'BASE_FIJA_ALT', priority: 50, name: 'Base alternativa tarifa fija por viaje',
    expression: { op: 'FIXED', amount: '150000.00' },
    description: 'Base alternativa: se pagan ₡150 000 por viaje, sin importar km ni paradas.',
    builder: { variable: null, operator: 'FIXED', value: '150000.00', effect: 'INCREASE' },
  },
];

const J = (v) => JSON.stringify(v);
const client = await pool.connect();
try {
  await client.query('BEGIN');

  if (reset) {
    const del = await client.query(`DELETE FROM tarifas_pricing_rules WHERE id LIKE 'TEST_RULE_BASECHG_%'`);
    console.log(`Reglas borradas: ${del.rowCount}`);
  } else {
    let inserted = 0;
    for (const [partyId, tag] of Object.entries(PARTIES)) {
      const { rows } = await client.query(
        `SELECT p.id, c.country_id FROM tarifas_settlement_parties p JOIN carriers c ON c.id = p.carrier_id WHERE p.id = $1`,
        [partyId],
      );
      if (!rows[0]) { console.log(`Perfil ${partyId} no existe: se omite`); continue; }
      for (const r of ALTERNATIVAS) {
        const res = await client.query(
          `INSERT INTO tarifas_pricing_rules (id, country_id, scope, party_id, code, name, stage, priority, stacking, exclusion_group,
             conditions, expression, description, reason, effect, builder, condition_builder, is_adhoc, active, effective_from, effective_to, version)
           VALUES ($1,$2,'PARTY',$3,$4,$5,'BASE',$6,'EXCLUSIVE',null,$7::jsonb,$8::jsonb,$9,$10,'INCREASE',$11::jsonb,null,false,true,null,null,1)
           ON CONFLICT (id) DO NOTHING`,
          [`TEST_RULE_BASECHG_${tag}_${r.code}`, rows[0].country_id, partyId, r.code, r.name, r.priority, J({ p: 'ALWAYS' }),
            J(r.expression), r.description, `Dato de prueba del cambio de base: ${r.description}`, J(r.builder)],
        );
        inserted += res.rowCount;
      }
    }
    console.log(`Reglas insertadas: ${inserted} (de ${Object.keys(PARTIES).length * ALTERNATIVAS.length} posibles)`);
  }

  if (execute) { await client.query('COMMIT'); console.log('COMMIT: aplicado en Aurora.'); }
  else { await client.query('ROLLBACK'); console.log('Dry-run: ROLLBACK (use --execute para aplicar).'); }
} catch (error) {
  await client.query('ROLLBACK');
  console.error('Falló, se revirtió todo:', error.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
