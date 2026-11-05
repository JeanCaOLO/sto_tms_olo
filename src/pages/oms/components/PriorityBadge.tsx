import Badge from '../../../components/base/Badge';
import { priorityBadgeVariant, priorityLabel } from '../types';

// FR + WCAG: la prioridad NUNCA se transmite solo por color — el badge incluye
// siempre el texto del nivel. Escala numérica 0..n (menor = más urgente); el
// mapeo número->variante vive en types.ts (priorityBadgeVariant).
export default function PriorityBadge({ priority }: { priority: number }) {
  return <Badge variant={priorityBadgeVariant(priority)}>{priorityLabel(priority)}</Badge>;
}
