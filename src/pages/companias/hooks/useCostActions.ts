import { importRows, saveStructure, type CostRowInput } from '../../../lib/tarifas/costStructureDataSource';
import { registrarEvento } from '../../../lib/liquidador/auditLog';
import { getActorRole } from '../../../lib/tarifas/actor';
import type { CostStructure } from '../../../lib/tarifas/types';
import { INHERITED_MESSAGE } from '../components/cost-structure/rowInput';
import { messageOf, type StructureCtx } from './costStructureContext';

interface Params {
  ctx: StructureCtx;
  usuarioActivo: string;
  blockedByInherited: boolean;
  ensureParty: () => Promise<string | null>;
  ensureStructure: () => Promise<CostStructure | null>;
  openTemplate: () => void;
}

/** Guardar parámetros, abrir la plantilla e importar una hoja suelta. */
export function useCostActions(p: Params) {
  const { party, structure, meta, setError, load } = p.ctx;

  const handleSaveMeta = async () => {
    setError('');
    try {
      const target = structure ?? await p.ensureStructure();
      if (!target) return;
      const result = await saveStructure({
        partyId: target.partyId,
        countryId: party?.countryId ?? '',
        name: meta.name,
        operatingDaysPerMonth: meta.operatingDaysPerMonth,
        params: target.params,
        effectiveFrom: target.effectiveFrom ?? null,
        active: true,
        notes: target.notes ?? null,
      }, target.id);

      if (result.status === 'invalid') { setError(Object.values(result.errors).join(' ')); return; }
      if (result.status === 'failed') { setError(result.error.message); return; }
      await load();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  // Subir la plantilla solo necesita el perfil de la compañía: NO crea una estructura de costos.
  const handleOpenTemplate = async () => {
    setError('');
    try {
      if ((await p.ensureParty()) === null) return;
      p.openTemplate();
    } catch (e) {
      setError(messageOf(e));
    }
  };

  const handleImport = async (imported: CostRowInput[], mode: 'replace' | 'append') => {
    if (p.blockedByInherited) throw new Error(INHERITED_MESSAGE);
    const target = await p.ensureStructure();
    if (!target) throw new Error('No se pudo crear la estructura de costos.');

    const result = await importRows(target.id, imported, mode);
    if (result.error) throw new Error(result.error);

    await registrarEvento({
      entidad: 'cost_structure',
      entidadId: target.id,
      accion: 'UPDATE',
      usuario: p.usuarioActivo,
      rol: getActorRole(),
      despues: { filas_importadas: result.inserted, modo: mode },
      motivo: `Importación de planilla (${mode === 'replace' ? 'reemplazo' : 'agregado'})`,
    });

    await load();
  };

  return { handleSaveMeta, handleOpenTemplate, handleImport };
}
