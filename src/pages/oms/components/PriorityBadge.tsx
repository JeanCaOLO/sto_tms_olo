import Badge from '../../../components/base/Badge';
import type { PriorityTier } from '../mockData';

const TIER_CONFIG: Record<PriorityTier, { variant: 'danger' | 'warning' | 'default'; label: string }> = {
  alta: { variant: 'danger', label: 'Alta' },
  media: { variant: 'warning', label: 'Media' },
  baja: { variant: 'default', label: 'Baja' },
};

interface PriorityBadgeProps {
  tier: PriorityTier;
  size?: 'sm' | 'md';
}

export default function PriorityBadge({ tier, size = 'md' }: PriorityBadgeProps) {
  const config = TIER_CONFIG[tier];
  return (
    <Badge variant={config.variant} size={size}>
      {config.label}
    </Badge>
  );
}
