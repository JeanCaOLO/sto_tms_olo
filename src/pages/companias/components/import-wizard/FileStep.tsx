/** Paso 1: elegir el archivo (Excel o CSV). */
export function FileStep({ onFile }: { onFile: (file: File | undefined) => void }) {
  return (
    <div className="text-center py-10 border-2 border-dashed border-slate-200 rounded-lg">
      <i className="ri-file-excel-2-line text-4xl text-slate-300"></i>
      <p className="mt-3 text-sm text-slate-600 font-medium">Elegí un Excel o un CSV</p>
      <p className="text-xs text-slate-500 mb-4">
        Se leen todas las hojas; después elegís cuál importar.
      </p>
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={(e) => onFile(e.target.files?.[0])}
        className="mx-auto block text-sm text-slate-600 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-teal-600 file:text-white file:cursor-pointer"
      />
    </div>
  );
}
