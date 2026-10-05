import { db } from '../../lib/tarifas/data';

/** Aviso fijo cuando el módulo corre sobre la semilla local: nada de lo que se vea o guarde es de Aurora. */
export default function DataModeBanner() {
  if (db().kind !== 'json') return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
      <i className="ri-database-2-line"></i>
      <span>
        <strong>Datos de demostración.</strong> Este módulo usa la semilla local del navegador, no la base de datos real.
      </span>
    </div>
  );
}
