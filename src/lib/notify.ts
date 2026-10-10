// Avisos breves (toast) desde código que no es un componente ni vive bajo `ToastProvider` en las pruebas.
// `ToastProvider` se suscribe y los muestra; sin proveedor (pruebas, scripts) el aviso se descarta.

export type NotifyVariant = 'success' | 'error' | 'warning' | 'info';
type Listener = (message: string, variant: NotifyVariant) => void;

const listeners = new Set<Listener>();

export function onNotify(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify(message: string, variant: NotifyVariant = 'info'): void {
  listeners.forEach((listener) => listener(message, variant));
}
