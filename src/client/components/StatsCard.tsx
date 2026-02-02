import { ReactNode } from 'react';

interface StatsCardProps {
  title: string;
  value: number | string;
  suffix?: string;
  trend?: 'up' | 'down';
  icon?: ReactNode;
}

export default function StatsCard({ title, value, suffix, trend, icon }: StatsCardProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 card-hover">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <div className="flex items-baseline mt-2">
            <p className="text-3xl font-bold text-gray-900">{value}</p>
            {suffix && <span className="ml-1 text-lg text-gray-500">{suffix}</span>}
          </div>
          {trend && (
            <div className="flex items-center mt-2">
              {trend === 'up' ? (
                <span className="flex items-center text-sm text-green-600">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  Increasing
                </span>
              ) : (
                <span className="flex items-center text-sm text-red-600">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                  </svg>
                  Decreasing
                </span>
              )}
            </div>
          )}
        </div>
        {icon && (
          <div className="p-3 bg-primary-50 rounded-lg text-primary-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}
