// Helpers for liquidaciones page (alcances, tab styles).

export interface Alcance {
  value: 'ready' | 'incomplete' | 'all';
  label: string;
  hint: string;
}

export const ALCANCES: Alcance[] = [
  { value: 'ready', label: 'Listos', hint: 'Completados y con todos sus pedidos entregados' },
  { value: 'incomplete', label: 'Incompletos', hint: 'No completados o con pedidos sin entregar' },
  { value: 'all', label: 'Todos', hint: 'Todos los viajes sin liquidación vigente' },
];

export function getTabClass(current: string, tab: string): string {
  return `px-4 py-2 text-sm font-medium border-b-2 cursor-pointer ${
    current === tab ? 'border-teal-600 text-teal-700' : 'border-transparent text-slate-500 hover:text-slate-700'
  }`;
}
