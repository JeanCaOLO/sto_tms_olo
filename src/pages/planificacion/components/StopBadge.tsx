interface Props {
  number: number;
  size?: 'sm' | 'md';
  muted?: boolean;
}

const SIZES = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
};

export default function StopBadge({ number, size = 'md', muted = false }: Props) {
  const tone = muted ? 'bg-slate-300 text-slate-600' : 'bg-teal-600 text-white';
  return (
    <div className={`flex-shrink-0 ${SIZES[size]} ${tone} rounded-full flex items-center justify-center font-bold`}>
      {number}
    </div>
  );
}
