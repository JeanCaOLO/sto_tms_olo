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

// ponytail: notificaciones de ejemplo en estado local (aún no hay endpoint real).
// El techo/upgrade path es reemplazar este seed por un fetch cuando el backend
// exponga /api/notifications — la firma del hook (items, unreadCount, markAllRead,
// markRead) no cambia.
const SEED: AppNotification[] = [
  { id: 'n1', icon: 'ri-route-line', iconColor: 'teal', title: 'Nueva ruta asignada', detail: 'RUT-2024-003 asignada a Carlos Rodríguez', time: 'Hace 5 minutos', read: false },
  { id: 'n2', icon: 'ri-checkbox-circle-line', iconColor: 'green', title: 'Entrega completada', detail: 'GDE-2024-005 entregado exitosamente', time: 'Hace 15 minutos', read: false },
  { id: 'n3', icon: 'ri-alert-line', iconColor: 'amber', title: 'Alerta de capacidad', detail: 'Vehículo PPU-1234 al 95% de capacidad', time: 'Hace 32 minutos', read: false },
];

export function useNotifications() {
  const [items, setItems] = useState<AppNotification[]>(SEED);

  const unreadCount = useMemo(() => items.filter((n) => !n.read).length, [items]);

  const markAllRead = () => setItems((prev) => prev.map((n) => ({ ...n, read: true })));

  const markRead = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return { items, unreadCount, markAllRead, markRead };
}
