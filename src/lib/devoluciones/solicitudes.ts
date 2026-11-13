// Solicitud de devolución que crea el cliente (rol Cliente): motivos, límites y validación. Lógica pura (sin React).
// Debe coincidir con backend/admin/src/admin_return_requests.py (el backend vuelve a validar todo).

export type ReasonCode = 'no_solicitado' | 'danado' | 'cantidad_de_mas' | 'rechazado' | 'otro';

export const REASONS: { code: ReasonCode; label: string }[] = [
  { code: 'no_solicitado', label: 'No solicitado' },
  { code: 'danado', label: 'Dañado' },
  { code: 'cantidad_de_mas', label: 'Cantidad de más' },
  { code: 'rechazado', label: 'Rechazado por el cliente' },
  { code: 'otro', label: 'Otro' },
];

export const MAX_ITEMS = 50;
export const MAX_FILES_PER_ITEM = 5;
export const MAX_QUANTITY = 1_000_000;
export const DESCRIPTION_LIMIT = 500;
export const CODE_LIMIT = 100;
export const NAME_LIMIT = 255;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime'] as const;
export const ACCEPT_ATTR = ACCEPTED_MIME.join(',');

export interface DraftFile {
  id: string;
  file: File;
}

export interface DraftItem {
  id: string;
  productCode: string;
  productName: string;
  quantity: string;
  reason: ReasonCode | '';
  description: string;
  files: DraftFile[];
}

export interface ItemErrors {
  productCode?: string;
  productName?: string;
  quantity?: string;
  reason?: string;
  description?: string;
}

export const newDraftItem = (id: string): DraftItem => ({
  id, productCode: '', productName: '', quantity: '', reason: '', description: '', files: [],
});

export const isVideo = (mime: string) => mime.startsWith('video/');

export function maxBytesFor(mime: string): number {
  return isVideo(mime) ? MAX_VIDEO_BYTES : MAX_PHOTO_BYTES;
}

const mb = (bytes: number) => `${bytes / (1024 * 1024)} MB`;

/** Motivo por el que NO se puede adjuntar el archivo, o null si es válido. */
export function fileProblem(file: { name: string; type: string; size: number }, alreadyAttached: number): string | null {
  if (alreadyAttached >= MAX_FILES_PER_ITEM) return `Máximo ${MAX_FILES_PER_ITEM} archivos por artículo.`;
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) {
    return `«${file.name}»: solo fotos JPG/PNG o videos MP4/MOV.`;
  }
  if (file.size <= 0) return `«${file.name}» está vacío.`;
  if (file.size > maxBytesFor(file.type)) {
    return `«${file.name}» supera ${mb(maxBytesFor(file.type))} (${isVideo(file.type) ? 'video' : 'foto'}).`;
  }
  return null;
}

/** Cantidad entera > 0 o null. */
export function parseQuantity(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  return value > 0 && value <= MAX_QUANTITY ? value : null;
}

export function validateItem(item: DraftItem): ItemErrors {
  const errors: ItemErrors = {};
  if (!item.productCode.trim()) errors.productCode = 'Escribe el código del artículo.';
  else if (item.productCode.trim().length > CODE_LIMIT) errors.productCode = `Máximo ${CODE_LIMIT} caracteres.`;
  if (!item.productName.trim()) errors.productName = 'Escribe el nombre del artículo.';
  else if (item.productName.trim().length > NAME_LIMIT) errors.productName = `Máximo ${NAME_LIMIT} caracteres.`;
  if (parseQuantity(item.quantity) === null) errors.quantity = 'La cantidad debe ser un entero mayor que 0.';
  if (!item.reason) errors.reason = 'Elige un motivo.';
  if (item.reason === 'otro' && !item.description.trim()) errors.description = 'Describe el motivo.';
  if (item.description.trim().length > DESCRIPTION_LIMIT) errors.description = `Máximo ${DESCRIPTION_LIMIT} caracteres.`;
  return errors;
}

export const hasErrors = (errors: ItemErrors) => Object.keys(errors).length > 0;

export function validateAll(items: DraftItem[]): { ok: boolean; errors: Record<string, ItemErrors>; message: string } {
  if (items.length === 0) return { ok: false, errors: {}, message: 'Agrega al menos un artículo.' };
  if (items.length > MAX_ITEMS) return {ok: false, errors: {}, message: `Máximo ${MAX_ITEMS} artículos por solicitud.`};
  const errors: Record<string, ItemErrors> = {};
  for (const item of items) {
    const itemErrors = validateItem(item);
    if (hasErrors(itemErrors)) errors[item.id] = itemErrors;
  }
  const ok = Object.keys(errors).length === 0;
  return { ok, errors, message: ok ? '' : 'Revisa los campos marcados.' };
}

export interface UploadedFile {
  key: string;
}

export interface RequestItemPayload {
  product_code: string;
  product_name: string;
  quantity: number;
  reason_code: ReasonCode;
  description?: string;
  files: UploadedFile[];
}

/** Cuerpo del POST. Asume que el borrador ya pasó `validateAll`. */
export function toPayloadItem(item: DraftItem, files: UploadedFile[]): RequestItemPayload {
  return {
    product_code: item.productCode.trim(),
    product_name: item.productName.trim(),
    quantity: parseQuantity(item.quantity) as number,
    reason_code: item.reason as ReasonCode,
    ...(item.description.trim() ? { description: item.description.trim() } : {}),
    files,
  };
}

export const requestStatus = (status: string, approvalMode?: 'legacy' | 'automatic'): {label: string; variant: 'warning' | 'success' | 'danger' | 'default'} => {
  if (status === 'pendiente_asignacion') return {label: 'Pendiente de revisión', variant: 'warning'};
  if (status === 'aprobada') return {label: approvalMode==='automatic'?'Aprobada automáticamente':'Aprobada', variant: 'success'};
  if (status === 'rechazada') return {label: 'Rechazada', variant: 'danger'};
  return {label: status, variant: 'default'};
};
