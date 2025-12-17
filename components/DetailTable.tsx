import React from 'react';
import { AggregatedStat } from '../types';

interface DetailTableProps {
  data: AggregatedStat[];
}

const DetailTable: React.FC<DetailTableProps> = ({ data }) => {
  // Group data by category
  const groupedData: Record<string, AggregatedStat[]> = {};
  
  // Initialize order
  const categories = ['교육기획평가', '교육환경평가', '강사평가', '프로그램 성과평가', '기타'];
  
  data.forEach(item => {
    const cat = item.category || '기타';
    if (!groupedData[cat]) groupedData[cat] = [];
    groupedData[cat].push(item);
  });

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow-sm border border-slate-200">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
              문항 (Question)
            </th>
            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
              응답 수
            </th>
            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
              평균 점수
            </th>
            <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase tracking-wider">
              분포 (매우만족~매우불만)
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-slate-200">
          {categories.map(category => {
            const items = groupedData[category];
            if (!items || items.length === 0) return null;

            return (
              <React.Fragment key={category}>
                {/* Category Header */}
                <tr className="bg-slate-100">
                  <td colSpan={4} className="px-6 py-2 text-sm font-bold text-slate-700 border-b border-slate-200">
                    {category}
                  </td>
                </tr>
                {items.map((item, idx) => (
                  <tr key={`${category}-${idx}`} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 pl-8 border-l-4 border-l-transparent hover:border-l-blue-500 transition-colors">
                      {item.question}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-center text-slate-500">
                      {item.count}명
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold
                        ${item.averageScore >= 4.5 ? 'bg-green-100 text-green-800' :
                          item.averageScore >= 4.0 ? 'bg-blue-100 text-blue-800' :
                          item.averageScore >= 3.0 ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'}`}>
                        {item.averageScore.toFixed(2)} / 5.0
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      <div className="flex justify-center gap-1 text-xs">
                          <div className="flex flex-col items-center" title="매우만족"><span className="font-bold text-green-600">{item.distribution['매우만족'] || 0}</span></div>
                          <span className="text-slate-300">|</span>
                          <div className="flex flex-col items-center" title="만족"><span className="font-bold text-blue-600">{item.distribution['만족'] || 0}</span></div>
                          <span className="text-slate-300">|</span>
                          <div className="flex flex-col items-center" title="보통"><span className="font-bold text-yellow-600">{item.distribution['보통'] || 0}</span></div>
                          <span className="text-slate-300">|</span>
                          <div className="flex flex-col items-center" title="불만"><span className="font-bold text-orange-600">{item.distribution['불만'] || 0}</span></div>
                          <span className="text-slate-300">|</span>
                          <div className="flex flex-col items-center" title="매우불만"><span className="font-bold text-red-600">{item.distribution['매우불만'] || 0}</span></div>
                      </div>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default DetailTable;