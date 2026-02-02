interface ScoreBadgeProps {
  label: string;
  variant?: 'high' | 'medium' | 'low';
}

export default function ScoreBadge({ label, variant = 'medium' }: ScoreBadgeProps) {
  const colors = {
    high: 'bg-green-100 text-green-800',
    medium: 'bg-yellow-100 text-yellow-800',
    low: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${colors[variant]}`}>
      {label}
    </span>
  );
}
