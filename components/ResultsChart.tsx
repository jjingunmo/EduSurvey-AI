import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts';
import { AggregatedStat } from '../types';

interface ResultsChartProps {
  data: AggregatedStat[];
}

const ResultsChart: React.FC<ResultsChartProps> = ({ data }) => {
  if (data.length === 0) return null;

  // Colors for bars based on score
  const getBarColor = (score: number) => {
    if (score >= 4.5) return '#22c55e'; // Green
    if (score >= 4.0) return '#3b82f6'; // Blue
    if (score >= 3.0) return '#eab308'; // Yellow
    if (score >= 2.0) return '#f97316'; // Orange
    return '#ef4444'; // Red
  };

  return (
    <div className="w-full h-[400px] bg-white p-4 rounded-lg shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold text-slate-800 mb-4">문항별 만족도 평균 점수 (5점 만점)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={true} />
          <XAxis type="number" domain={[0, 5]} hide />
          <YAxis 
            type="category" 
            dataKey="question" 
            width={150} 
            tick={{ fontSize: 11 }}
            interval={0}
          />
          <Tooltip 
            cursor={{ fill: 'transparent' }}
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => [value.toFixed(2), '평균 점수']}
          />
          <Bar dataKey="averageScore" radius={[0, 4, 4, 0]} barSize={20} name="평균 점수">
             {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.averageScore)} />
              ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ResultsChart;
