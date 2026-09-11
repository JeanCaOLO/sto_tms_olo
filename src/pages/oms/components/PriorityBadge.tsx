import Badge from '../../../components/base/Badge';
import { TIER_BADGE, TIER_LABEL, type PriorityTier } from '../types';

// FR + WCAG: el tier NUNCA se transmite solo por color — el badge incluye
// siempre el texto del nivel. Mapeo tier->variante en types.ts.
export default function PriorityBadge({ tier }: { tier: PriorityTier }) {
  return <Badge variant={TIER_BADGE[tier]}>{TIER_LABEL[tier]}</Badge>;
}
