// Confirmaciones desde código que no es un componente, con el modal propio de la app en lugar del
// cuadro nativo del navegador. `ConfirmHost` se suscribe y las muestra; sin él (pruebas, scripts) se
// usa `window.confirm`, para que quien no monte el host siga funcionando.

export interface ConfirmOptions {
  message: string;
  title?: string;
  confirmLabel?: string;
  /** `danger` pinta el botón de rojo (acciones que no se pueden deshacer). */
  variant?: 'danger' | 'primary';
}

type Handler = (options: ConfirmOptions) => Promise<boolean>;

let handler: Handler | null = null;

export function onConfirm(next: Handler): () => void {
  handler = next;
  return () => { if (handler === next) handler = null; };
}

export function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  const resolved = typeof options === 'string' ? { message: options } : options;
  if (!handler) return Promise.resolve(window.confirm(resolved.message));
  return handler(resolved);
}
