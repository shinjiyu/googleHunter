import type { TrendStatus } from '../../shared/types';

interface TrendIndicatorProps {
  trend: TrendStatus;
}

export default function TrendIndicator({ trend }: TrendIndicatorProps) {
  if (trend === 'rising') {
    return (
      <span className="flex items-center text-green-600 text-sm font-medium">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
        Rising
      </span>
    );
  }

  if (trend === 'declining') {
    return (
      <span className="flex items-center text-red-600 text-sm font-medium">
        <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
        </svg>
        Declining
      </span>
    );
  }

  return (
    <span className="flex items-center text-gray-500 text-sm font-medium">
      <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
      Stable
    </span>
  );
}
