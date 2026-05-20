import { useState, useRef, useCallback } from 'react';
import Button from '../base/Button';

interface CsvField {
  key: string;
  label: string;
  required: boolean;
  type?: 'text' | 'number' | 'email' | 'date' | 'boolean';
}

interface CsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  fields: CsvField[];
  tableName: string;
  templateFileName: string;
  transformRow?: (row: Record<string, any>, organizationId: string) => Promise<Record<string, any>>;
  organizationId: string;
  title?: string;
}

interface ParsedRow {
  data: Record<string, any>;
  isValid: boolean;
  errors: string[];
  rowNumber: number;
}

export default function CsvImportModal({
  isOpen,
  onClose,
  onImportComplete,
  fields,
  tableName,
  templateFileName,
  transformRow,
  organizationId,
  title = 'Importar desde CSV',
}: CsvImportModalProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; failed: number } | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleClose = () => {
    setStep(1);
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
    onClose();
  };

  const downloadTemplate = () => {
    const headers = fields.map(f => f.label).join(',');
    const exampleRow = fields.map(f => {
      if (f.type === 'email') return 'ejemplo@email.com';
      if (f.type === 'number') return '100';
      if (f.type === 'date') return '2024-01-15';
      if (f.type === 'boolean') return 'true';
      return 'ejemplo';
    }).join(',');
    
    const csvContent = `${headers}\n${exampleRow}`;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = templateFileName;
    link.click();
  };

  const validateRow = (row: Record<string, any>, rowNumber: number): ParsedRow => {
    const errors: string[] = [];
    const data: Record<string, any> = {};

    fields.forEach(field => {
      const value = row[field.label]?.toString().trim() || '';
      
      if (field.required && !value) {
        errors.push(`${field.label} es obligatorio`);
      }

      if (value) {
        if (field.type === 'number') {
          const num = parseFloat(value);
          if (isNaN(num)) {
            errors.push(`${field.label} debe ser un número`);
          } else {
            data[field.key] = num;
          }
        } else if (field.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push(`${field.label} no es un email válido`);
          } else {
            data[field.key] = value;
          }
        } else if (field.type === 'date') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            errors.push(`${field.label} no es una fecha válida`);
          } else {
            data[field.key] = value;
          }
        } else if (field.type === 'boolean') {
          const boolValue = value.toLowerCase();
          if (!['true', 'false', '1', '0', 'sí', 'si', 'no'].includes(boolValue)) {
            errors.push(`${field.label} debe ser true/false o sí/no`);
          } else {
            data[field.key] = ['true', '1', 'sí', 'si'].includes(boolValue);
          }
        } else {
          data[field.key] = value;
        }
      }
    });

    return {
      data,
      isValid: errors.length === 0,
      errors,
      rowNumber,
    };
  };

  const parseCSV = (text: string): Record<string, any>[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const rows: Record<string, any>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const row: Record<string, any> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }

    return rows;
  };

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!selectedFile.name.endsWith('.csv')) {
      alert('Por favor selecciona un archivo CSV válido');
      return;
    }

    setFile(selectedFile);
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      const validated = rows.map((row, index) => validateRow(row, index + 2));
      setParsedRows(validated);
      setStep(3);
    };

    reader.readAsText(selectedFile);
  }, [fields]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleImport = async () => {
    const validRows = parsedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      alert('No hay registros válidos para importar');
      return;
    }

    setImporting(true);
    let successCount = 0;
    let failedCount = 0;

    try {
      const { supabase } = await import('../../lib/supabase');
      
      for (const row of validRows) {
        try {
          let dataToInsert = { ...row.data, organization_id: organizationId };
          
          if (transformRow) {
            dataToInsert = await transformRow(row.data, organizationId);
          }

          const { error } = await supabase.from(tableName).insert([dataToInsert]);
          
          if (error) {
            console.error(`Error en fila ${row.rowNumber}:`, error);
            failedCount++;
          } else {
            successCount++;
          }
        } catch (err) {
          console.error(`Error procesando fila ${row.rowNumber}:`, err);
          failedCount++;
        }
      }

      setImportResult({ success: successCount, failed: failedCount });
      
      if (successCount > 0) {
        onImportComplete();
      }
    } catch (error) {
      console.error('Error durante la importación:', error);
      alert('Error durante la importación. Por favor intenta nuevamente.');
    } finally {
      setImporting(false);
    }
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.length - validCount;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-teal-50 to-teal-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-teal-600 rounded-lg flex items-center justify-center">
              <i className="ri-file-upload-line text-white text-xl"></i>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <p className="text-xs text-slate-500">Paso {step} de 3</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/50 transition-colors cursor-pointer"
          >
            <i className="ri-close-line text-xl text-slate-600"></i>
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${step >= s ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {s}
                </div>
                {s < 3 && <div className={`flex-1 h-1 mx-2 rounded ${step > s ? 'bg-teal-600' : 'bg-slate-200'}`}></div>}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Paso 1: Descargar plantilla */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-20 h-20 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-download-cloud-line text-4xl text-teal-600"></i>
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Descarga la plantilla CSV</h3>
                <p className="text-sm text-slate-500 mb-6">
                  Descarga la plantilla con las columnas correctas y completa los datos
                </p>
                <Button
                  variant="primary"
                  onClick={downloadTemplate}
                  icon={<i className="ri-download-line"></i>}
                >
                  Descargar Plantilla
                </Button>
              </div>

              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h4 className="font-semibold text-slate-900 text-sm mb-3 flex items-center gap-2">
                  <i className="ri-information-line text-teal-600"></i>
                  Columnas de la plantilla:
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {fields.map((field) => (
                    <div key={field.key} className="flex items-center gap-2 text-xs">
                      <div className={`w-2 h-2 rounded-full ${field.required ? 'bg-red-500' : 'bg-slate-300'}`}></div>
                      <span className="text-slate-700">{field.label}</span>
                      {field.required && <span className="text-red-500 text-xs">*</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-slate-500 mt-3">
                  <span className="text-red-500">*</span> Campos obligatorios
                </p>
              </div>

              <div className="flex justify-end">
                <Button variant="primary" onClick={() => setStep(2)}>
                  Siguiente <i className="ri-arrow-right-line ml-1"></i>
                </Button>
              </div>
            </div>
          )}

          {/* Paso 2: Subir archivo */}
          {step === 2 && (
            <div className="space-y-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
                  dragActive ? 'border-teal-500 bg-teal-50' : 'border-slate-300 hover:border-teal-400 hover:bg-slate-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="ri-file-upload-line text-4xl text-slate-400"></i>
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">
                  {file ? file.name : 'Arrastra tu archivo CSV aquí'}
                </h3>
                <p className="text-sm text-slate-500 mb-4">
                  o haz clic para seleccionar un archivo
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
              </div>

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  <i className="ri-arrow-left-line mr-1"></i> Atrás
                </Button>
              </div>
            </div>
          )}

          {/* Paso 3: Vista previa */}
          {step === 3 && !importResult && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-50 rounded-lg p-4 border border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-slate-700">{validCount} válidos</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-slate-700">{invalidCount} inválidos</span>
                  </div>
                </div>
                <span className="text-xs text-slate-500">Total: {parsedRows.length} registros</span>
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Estado</th>
                      {fields.slice(0, 4).map((field) => (
                        <th key={field.key} className="px-3 py-2 text-left font-semibold text-slate-600">
                          {field.label}
                        </th>
                      ))}
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Errores</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row) => (
                      <tr key={row.rowNumber} className={row.isValid ? 'bg-green-50/30' : 'bg-red-50/30'}>
                        <td className="px-3 py-2 text-slate-500">{row.rowNumber}</td>
                        <td className="px-3 py-2">
                          {row.isValid ? (
                            <i className="ri-checkbox-circle-fill text-green-500"></i>
                          ) : (
                            <i className="ri-close-circle-fill text-red-500"></i>
                          )}
                        </td>
                        {fields.slice(0, 4).map((field) => (
                          <td key={field.key} className="px-3 py-2 text-slate-700 truncate max-w-[120px]">
                            {row.data[field.key] || '—'}
                          </td>
                        ))}
                        <td className="px-3 py-2 text-red-600 text-xs">
                          {row.errors.join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-between">
                <Button variant="secondary" onClick={() => { setStep(2); setFile(null); setParsedRows([]); }}>
                  <i className="ri-arrow-left-line mr-1"></i> Cambiar archivo
                </Button>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  disabled={validCount === 0 || importing}
                  icon={importing ? <i className="ri-loader-4-line animate-spin"></i> : <i className="ri-upload-line"></i>}
                >
                  {importing ? 'Importando...' : `Importar ${validCount} registros`}
                </Button>
              </div>
            </div>
          )}

          {/* Resultado */}
          {importResult && (
            <div className="text-center space-y-6">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <i className="ri-checkbox-circle-line text-4xl text-green-600"></i>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">Importación completada</h3>
                <div className="flex items-center justify-center gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="font-semibold text-slate-700">{importResult.success} exitosos</span>
                  </div>
                  {importResult.failed > 0 && (
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                      <span className="font-semibold text-slate-700">{importResult.failed} fallidos</span>
                    </div>
                  )}
                </div>
              </div>
              <Button variant="primary" onClick={handleClose}>
                Cerrar
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}