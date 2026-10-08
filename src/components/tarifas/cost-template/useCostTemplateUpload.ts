// Estado y acciones de la subida de la plantilla: leer el archivo, validarlo y guardar (reemplaza).

import { useEffect, useMemo, useState } from 'react';
import { parseCostTemplate, type ParsedCostTemplate } from '../../../lib/tarifas/costTemplate';
import { applyCostTemplate } from '../../../lib/tarifas/costStructureDataSource';
import { listTruckTypes } from '../../../lib/tarifas/vehiclesDataSource';
import { readWorkbook } from './costTemplateFile';

interface Params {
  isOpen: boolean;
  /** Compañía dueña. Null = estructura por defecto de la flota propia del país. */
  partyId: string | null;
  countryId: string;
  structureName: string;
  scopeLabel: string;
  onClose: () => void;
  onApplied: () => void;
}

export function useCostTemplateUpload({
  isOpen, partyId, countryId, structureName, scopeLabel, onClose, onApplied,
}: Params) {
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<ParsedCostTemplate | null>(null);
  const [knownTrucks, setKnownTrucks] = useState<string[]>([]);
  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setFileName(''); setParsed(null); setError('');
    let cancelled = false;
    listTruckTypes()
      .then((types) => { if (!cancelled) setKnownTrucks(types.map((t) => t.code)); })
      .catch(() => { if (!cancelled) setKnownTrucks([]); }); // sin catálogo no se avisa de tipos desconocidos
    return () => { cancelled = true; };
  }, [isOpen]);

  const summary = useMemo(() => parsed?.summary ?? [], [parsed]);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setParsed(null); setFileName(file.name);
    if (!/\.xlsx?$/i.test(file.name)) {
      setError('El archivo debe ser un libro de Excel (.xlsx) con las hojas de la plantilla.');
      return;
    }
    setReading(true);
    try {
      setParsed(parseCostTemplate(await readWorkbook(file), { knownTruckTypes: knownTrucks }));
    } catch (e) {
      setError(`No se pudo leer el archivo: ${e instanceof Error ? e.message : 'error inesperado'}`);
    } finally {
      setReading(false);
    }
  };

  const handleSave = async () => {
    if (!parsed || parsed.errors.length > 0 || !parsed.operatingDays) return;
    if (!window.confirm(`Esto reemplaza ${scopeLabel} por las ${parsed.rows.length} filas de la plantilla. ¿Continuar?`)) return;
    setSaving(true); setError('');
    try {
      const result = await applyCostTemplate({
        partyId, countryId, name: structureName,
        operatingDaysPerMonth: parsed.operatingDays, params: parsed.params, rows: parsed.rows,
      });
      if (result.status === 'failed') throw new Error(result.error.message);
      onApplied();
      onClose();
    } catch (e) {
      setError(`No se pudo guardar: ${e instanceof Error ? e.message : 'error inesperado'}`);
    } finally {
      setSaving(false);
    }
  };

  return { fileName, parsed, summary, reading, saving, error, handleFile, handleSave };
}
