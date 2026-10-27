// Etiquetas de presentación de las acciones del OMS en la Auditoría. Mapea el
// `action` crudo guardado en oms_logs a un nombre legible SIN tocar el valor
// almacenado (la búsqueda/exportación usan esta etiqueta; el backend sigue
// escribiendo 'barrido', 'procesar_viaje', etc.).
const ACTION_LABELS: Record<string, string> = {
  barrido: 'Corrida automática',
  procesar_viaje: 'Procesar a Eflow',
  override_manual: 'Override manual',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

// Mensaje para mostrar: el backend escribe el texto empezando con "Barrido: …"
// (o "Barrido FALLÓ: …"). Reescribimos ese prefijo a la etiqueta elegida para no
// tocar el texto guardado en oms_logs ni depender de un reproceso. Solo aplica a
// la acción de corrida; el resto de mensajes se muestran tal cual.
export function displayMessage(log: { action: string; message: string }): string {
  if (log.action === 'barrido') {
    return log.message.replace(/^Barrido\b/, ACTION_LABELS.barrido);
  }
  return log.message;
}
