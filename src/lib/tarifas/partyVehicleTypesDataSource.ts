// Catálogo de vehículos de una compañía.
//
// Su razón de ser: `truckVolumeM3` y `truckWeightTons` existen como variables del motor desde hace
// varios pasos, pero había que teclearlas viaje por viaje porque no había de dónde derivarlas. El
// código del tipo de camión ya viaja en la liquidación — solo faltaba decir qué capacidad tiene
// cada código.
//
// El `code` es el MISMO que usa la tarifa por vehículo, así que un tarifario importado de Excel
// queda conectado con su capacidad sin trabajo extra. `faltantesDeCatalogo` explota esa relación.

import { db, type Row } from './data';
import type { PartyVehicleType } from './types';

export interface VehicleTypeInput {
  partyId: string;
  code: string;
  name: string;
  volumeM3: string;
  weightTons: string;
  notes: string | null;
  active: boolean;
}

export type VehicleTypeErrors = Partial<Record<keyof VehicleTypeInput, string>>;

export type SaveVehicleTypeResult =
  | { status: 'saved'; vehicleType: PartyVehicleType }
  | { status: 'invalid'; errors: VehicleTypeErrors }
  | { status: 'failed'; error: { message: string } };

function toDomain(row: Row): PartyVehicleType {
  return {
    id: row.id,
    partyId: row.party_id,
    code: row.code,
    name: row.name,
    volumeM3: Number(row.volume_m3) || 0,
    weightTons: Number(row.weight_tons) || 0,
    notes: row.notes ?? null,
    active: !!row.active,
  };
}

export async function listVehicleTypes(
  partyId: string,
  options?: { includeInactive?: boolean },
): Promise<PartyVehicleType[]> {
  const where: { column: string; op: 'eq'; value: unknown }[] = [
    { column: 'party_id', op: 'eq', value: partyId },
  ];
  if (!options?.includeInactive) where.push({ column: 'active', op: 'eq', value: true });

  const rows = await db().find('partyVehicleType', {
    where,
    orderBy: [{ column: 'code', locale: true }],
  });
  return rows.map(toDomain);
}

const NON_NEGATIVE = /^\d+(\.\d+)?$/;

export function validateVehicleType(
  input: VehicleTypeInput,
  existing: Pick<PartyVehicleType, 'id' | 'code' | 'partyId'>[],
  id?: string,
): VehicleTypeErrors {
  const errors: VehicleTypeErrors = {};
  const code = input.code.trim();

  if (!code) {
    errors.code = 'El código es obligatorio.';
  } else if (
    existing.some((v) => v.id !== id && v.partyId === input.partyId
      && v.code.toUpperCase() === code.toUpperCase())
  ) {
    // El código es la clave con la que el viaje y la tarifa encuentran este tipo: repetirlo dejaría
    // en duda cuál capacidad aplica.
    errors.code = 'Esta compañía ya tiene un vehículo con ese código.';
  }

  if (!input.name.trim()) errors.name = 'El nombre es obligatorio.';
  if (!NON_NEGATIVE.test(input.volumeM3.trim())) errors.volumeM3 = 'Escribí un número sin signo.';
  if (!NON_NEGATIVE.test(input.weightTons.trim())) errors.weightTons = 'Escribí un número sin signo.';

  return errors;
}

export async function saveVehicleType(
  input: VehicleTypeInput,
  id?: string,
): Promise<SaveVehicleTypeResult> {
  const existing = (await db().find('partyVehicleType')).map(toDomain);
  const errors = validateVehicleType(input, existing, id);
  if (Object.keys(errors).length > 0) return { status: 'invalid', errors };

  const values: Row = {
    party_id: input.partyId,
    code: input.code.trim(),
    name: input.name.trim(),
    volume_m3: input.volumeM3.trim(),
    weight_tons: input.weightTons.trim(),
    notes: input.notes?.trim() || null,
    active: input.active,
  };

  try {
    const saved = id
      ? await db().update('partyVehicleType', id, values)
      : await db().insert('partyVehicleType', values);
    return { status: 'saved', vehicleType: toDomain(saved) };
  } catch (error) {
    return {
      status: 'failed',
      error: { message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Baja LÓGICA. Puede haber tarifas y reglas que nombren este código: borrarlo dejaría viajes sin
 * capacidad y sin aviso.
 */
export async function setVehicleTypeActive(
  id: string,
  active: boolean,
): Promise<{ error: string | null }> {
  try {
    await db().update('partyVehicleType', id, { active });
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteVehicleType(id: string): Promise<{ error: string | null }> {
  try {
    await db().delete('partyVehicleType', id);
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Códigos de camión que la compañía YA usa en sus tarifas pero todavía no tienen capacidad
 * declarada.
 *
 * Es el atajo que evita cargar el catálogo a mano: después de importar un tarifario desde Excel,
 * los códigos ya están ahí y solo falta decir cuántos metros cúbicos y toneladas tiene cada uno.
 */
export async function faltantesDeCatalogo(partyId: string): Promise<string[]> {
  const [rates, types] = await Promise.all([
    db().find('outsourcedCostRate', {
      where: [{ column: 'carrier_id', op: 'eq', value: partyId }],
    }),
    listVehicleTypes(partyId, { includeInactive: true }),
  ]);

  const declarados = new Set(types.map((t) => t.code.toUpperCase()));

  return [...new Set(
    rates
      .map((r) => String(r.truck_type_id ?? '').trim())
      .filter((code) => code && !declarados.has(code.toUpperCase())),
  )].sort((a, b) => a.localeCompare(b));
}
