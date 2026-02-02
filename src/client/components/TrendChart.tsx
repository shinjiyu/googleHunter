import {
    CartesianGrid,
    Line,
    LineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { TrendDataPoint } from '../../shared/types';

interface TrendChartProps {
  data: TrendDataPoint[];
  height?: number;
}

export default function TrendChart({ data, height = 300 }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No trend data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart
        data={data}
        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={{ stroke: '#e5e7eb' }}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 12, fill: '#6b7280' }}
          tickLine={{ stroke: '#e5e7eb' }}
          axisLine={{ stroke: '#e5e7eb' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: 'white',
            border: '1px solid #e5e7eb',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
          labelStyle={{ color: '#374151', fontWeight: 500 }}
          itemStyle={{ color: '#3b82f6' }}
        />
        <Line
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
          activeDot={{ r: 5, strokeWidth: 0 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
