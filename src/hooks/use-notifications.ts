import { useMemo, useState } from 'react';

export interface AppNotification {
  id: string;
  icon: string;
  iconColor: string;
  title: string;
  detail: string;
  time: string;
  read: boolean;
}

// ponytail: notificaciones de ejemplo (aún no hay endpoint real). El "leído" se
// persiste en localStorage por id, no en memoria, para que sobreviva a recargas
// (antes el estado vivía solo en useState y toda notificación volvía como no
// leída al refrescar). Upgrade path: reemplazar el SEED por un fetch a
// /api/notifications y el set local por un PATCH de "marcar leída" — la firma
// del hook (items, unreadCount, markAllRead, markRead) no cambia.
const SEED: Omit<AppNotification, 'read'>[] = [
  { id: 'n1', icon: 'ri-route-line', iconColor: 'teal', title: 'Nueva ruta asignada', detail: 'RUT-2024-003 asignada a Carlos Rodríguez', time: 'Hace 5 minutos' },
  { id: 'n2', icon: 'ri-checkbox-circle-line', iconColor: 'green', title: 'Entrega completada', detail: 'GDE-2024-005 entregado exitosamente', time: 'Hace 15 minutos' },
  { id: 'n3', icon: 'ri-alert-line', iconColor: 'amber', title: 'Alerta de capacidad', detail: 'Vehículo PPU-1234 al 95% de capacidad', time: 'Hace 32 minutos' },
];

const READ_KEY = 'sto_notif_read';

function loadReadIds(): Set<string> {
  try {
    const raw = localStorage.getItem(READ_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function saveReadIds(ids: Set<string>): void {
  try {
    localStorage.setItem(READ_KEY, JSON.stringify([...ids]));
  } catch {
    // localStorage no disponible (modo privado / SSR): degradar a solo-memoria.
  }
}

function withRead(readIds: Set<string>): AppNotification[] {
  return SEED.map((n) => ({ ...n, read: readIds.has(n.id) }));
}

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>(() => withRead(loadReadIds()));

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const persist = (readIds: Set<string>) => {
    saveReadIds(readIds);
    setItems(withRead(readIds));
  };

  const markAllRead = () => persist(new Set(SEED.map((n) => n.id)));

  const markRead = (id: string) => {
    const next = loadReadIds();
    next.add(id);
    persist(next);
  };

  return { items, unreadCount, markAllRead, markRead };
}
