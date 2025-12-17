import React, { useState, useMemo, useRef } from 'react';
import { FileText, Loader2, CheckCircle, AlertCircle, RefreshCcw, Users, Star, BarChart3, Play, Square, Trash2, ClipboardList, Layout, GraduationCap, TrendingUp, Printer, FileDown, FileSpreadsheet } from 'lucide-react';
import FileUpload from './components/FileUpload';
import ResultsChart from './components/ResultsChart';
import DetailTable from './components/DetailTable';
import { analyzeSurveyImage } from './services/geminiService';
import { convertFileToBase64 } from './services/pdfUtils';
import { ProcessedFile, AggregatedStat, ProcessingStatus, SurveyResponse } from './types';

// --- Helper Functions for String Similarity ---

// Calculate Levenshtein Distance (Edit Distance)
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,       // deletion
        matrix[i][j - 1] + 1,       // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
};

// Calculate Similarity (0 to 1)
const getSimilarity = (str1: string, str2: string): number => {
  // Normalize: Remove parentheses/content, non-alphanumeric/korean chars, and whitespace
  const normalize = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/[^가-힣a-zA-Z0-9]/g, '');
  
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  const distance = getLevenshteinDistance(s1, s2);
  const maxLength = Math.max(s1.length, s2.length);
  
  return 1 - (distance / maxLength);
};

const App: React.FC = () => {
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [globalStatus, setGlobalStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [processingProgress, setProcessingProgress] = useState<string>('');
  const [targetAudienceCount, setTargetAudienceCount] = useState<string>('');
  const [pagesPerPerson, setPagesPerPerson] = useState<string>('1');
  
  // Store raw files to process later
  const fileRegistry = useRef<Map<string, File>>(new Map());
  // Control flag for stopping the process
  const stopProcessing = useRef<boolean>(false);

  // 1. Handle File Selection (No processing yet)
  const handleFilesSelected = (files: File[]) => {
    const newProcessedFiles: ProcessedFile[] = files.map(f => {
      const id = Math.random().toString(36).substr(2, 9);
      // Store raw file in registry
      fileRegistry.current.set(id, f);
      
      return {
        id,
        fileName: f.name,
        totalPages: 0,
        responses: []
      };
    });

    setProcessedFiles(prev => [...prev, ...newProcessedFiles]);
  };

  // 2. Start Processing Logic
  const startProcessing = async () => {
    if (processedFiles.length === 0) return;
    
    setGlobalStatus(ProcessingStatus.PROCESSING);
    stopProcessing.current = false;

    // Loop through all files that are not fully processed
    for (let i = 0; i < processedFiles.length; i++) {
      if (stopProcessing.current) break;

      const fileData = processedFiles[i];
      const rawFile = fileRegistry.current.get(fileData.id);

      // Skip if already processed or file not found
      const isFullyCompleted = fileData.totalPages > 0 && fileData.responses.every(r => r.status === 'completed' || r.status === 'error');
      if (isFullyCompleted || !rawFile) continue;

      setProcessingProgress(`${fileData.fileName} 변환 준비 중...`);

      try {
        let currentImages: string[] = [];
        let currentResponses = [...fileData.responses];

        // Step A: Convert PDF/Image to Base64 (if not done yet)
        if (fileData.totalPages === 0) {
          if (stopProcessing.current) break;
          setProcessingProgress(`${fileData.fileName} 변환 중...`);
          
          try {
            currentImages = await convertFileToBase64(rawFile);
            
            // Initialize responses structure
            currentResponses = currentImages.map((_, idx) => ({
              pageIndex: idx,
              status: 'pending',
              items: []
            }));

            // Update state with pages info
            setProcessedFiles(prev => prev.map(pf => {
              if (pf.id === fileData.id) {
                return {
                  ...pf,
                  totalPages: currentImages.length,
                  responses: currentResponses
                };
              }
              return pf;
            }));
          } catch (error) {
            console.error("File conversion error:", error);
            // Mark file as error if conversion fails
             setProcessedFiles(prev => prev.filter(pf => pf.id !== fileData.id));
             continue;
          }
        } else {
             if (stopProcessing.current) break;
             setProcessingProgress(`${fileData.fileName} 데이터 로드 중...`);
             currentImages = await convertFileToBase64(rawFile);
        }

        // Step B: Process Each Page
        for (let pageIdx = 0; pageIdx < currentImages.length; pageIdx++) {
          if (stopProcessing.current) break;

          // Skip if this page is already done
          if (currentResponses[pageIdx]?.status === 'completed') continue;

          const imageBase64 = currentImages[pageIdx];
          
          setProcessingProgress(`${fileData.fileName} - ${pageIdx + 1}/${currentImages.length} 페이지 분석 중...`);

          // Update status to processing
          setProcessedFiles(prev => prev.map(pf => {
            if (pf.id === fileData.id) {
              const newRes = [...pf.responses];
              newRes[pageIdx] = { ...newRes[pageIdx], status: 'processing' };
              return { ...pf, responses: newRes };
            }
            return pf;
          }));

          try {
            // Call Gemini
            const { items, title } = await analyzeSurveyImage([imageBase64]);

            // Update success
            setProcessedFiles(prev => prev.map(pf => {
              if (pf.id === fileData.id) {
                const newRes = [...pf.responses];
                newRes[pageIdx] = { 
                  ...newRes[pageIdx], 
                  status: 'completed', 
                  items: items,
                  title: title || undefined
                };
                return { ...pf, responses: newRes };
              }
              return pf;
            }));
          } catch (err: any) {
            console.error(`Error processing page ${pageIdx}`, err);
            setProcessedFiles(prev => prev.map(pf => {
              if (pf.id === fileData.id) {
                const newRes = [...pf.responses];
                newRes[pageIdx] = { 
                  ...newRes[pageIdx], 
                  status: 'error', 
                  error: err.message 
                };
                return { ...pf, responses: newRes };
              }
              return pf;
            }));
          }
        }

      } catch (error) {
        console.error("General processing error", error);
      }
    }

    setGlobalStatus(ProcessingStatus.IDLE);
    setProcessingProgress('');
  };

  const handleStop = () => {
    stopProcessing.current = true;
    setProcessingProgress('중지 중...');
  };

  const handleReset = () => {
    setProcessedFiles([]);
    setGlobalStatus(ProcessingStatus.IDLE);
    setTargetAudienceCount('');
    setPagesPerPerson('1');
    fileRegistry.current.clear();
  };

  // Aggregation Logic with Fuzzy Matching & Category Preservation
  const aggregatedStats = useMemo<AggregatedStat[]>(() => {
    const statsMap = new Map<string, { 
      totalScore: number; 
      count: number; 
      distribution: Record<string, number>;
      category: string;
    }>();

    // Cache to store the mapping of Raw String -> Merged Canonical Key
    const keyCache = new Map<string, string>();

    processedFiles.forEach(file => {
      file.responses.forEach(response => {
        if (response.status === 'completed') {
          response.items.forEach(item => {
            // 1. Basic normalization
            const rawKey = item.question.replace(/\([^)]*\)/g, '').trim();
            if (!rawKey) return;

            let targetKey = rawKey;

            // 2. Check cache or find fuzzy match
            if (keyCache.has(rawKey)) {
              targetKey = keyCache.get(rawKey)!;
            } else {
              let bestMatchKey: string | null = null;
              let bestMatchScore = 0;

              for (const existingKey of statsMap.keys()) {
                const similarity = getSimilarity(rawKey, existingKey);
                // Threshold: 0.8
                if (similarity >= 0.8 && similarity > bestMatchScore) {
                  bestMatchScore = similarity;
                  bestMatchKey = existingKey;
                }
              }

              if (bestMatchKey) {
                targetKey = bestMatchKey;
              }
              
              keyCache.set(rawKey, targetKey);
            }

            // 3. Update Stats
            if (!statsMap.has(targetKey)) {
              statsMap.set(targetKey, { 
                totalScore: 0, 
                count: 0, 
                distribution: { '매우만족': 0, '만족': 0, '보통': 0, '불만': 0, '매우불만': 0 },
                category: item.category || '기타' // Default to '기타' if undefined
              });
            }
            
            const current = statsMap.get(targetKey)!;
            current.totalScore += item.score;
            current.count += 1;
            
            if (current.distribution[item.label] !== undefined) {
               current.distribution[item.label] += 1;
            }
            
            // Optional: Update category if current is '기타' but new item has specific category
            if (current.category === '기타' && item.category && item.category !== '기타') {
               current.category = item.category;
            }
          });
        }
      });
    });

    const results: AggregatedStat[] = [];
    statsMap.forEach((val, key) => {
      results.push({
        question: key,
        category: val.category,
        averageScore: val.count > 0 ? val.totalScore / val.count : 0,
        count: val.count,
        totalScore: val.totalScore,
        distribution: val.distribution
      });
    });

    // Sort Order: Category Priority -> Question Name
    const categoryOrder: Record<string, number> = {
      '교육기획평가': 1,
      '교육환경평가': 2,
      '강사평가': 3,
      '프로그램 성과평가': 4,
      '기타': 5
    };

    return results.sort((a, b) => {
      const orderA = categoryOrder[a.category] || 99;
      const orderB = categoryOrder[b.category] || 99;
      
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.question.localeCompare(b.question);
    });
  }, [processedFiles]);

  // Calculate Overall Satisfaction Score
  const overallSatisfaction = useMemo(() => {
    if (aggregatedStats.length === 0) return 0;
    
    let totalScoreSum = 0;
    let totalItemCount = 0;

    aggregatedStats.forEach(stat => {
      totalScoreSum += stat.totalScore;
      totalItemCount += stat.count;
    });

    return totalItemCount > 0 ? totalScoreSum / totalItemCount : 0;
  }, [aggregatedStats]);

  // Calculate Category Satisfaction Scores
  const categoryStats = useMemo(() => {
    const categories = ['교육기획평가', '교육환경평가', '강사평가', '프로그램 성과평가'];
    const stats: Record<string, number> = {};

    categories.forEach(cat => {
      const items = aggregatedStats.filter(item => item.category === cat);
      let totalScore = 0;
      let totalCount = 0;
      
      items.forEach(item => {
        totalScore += item.totalScore;
        totalCount += item.count;
      });
      
      stats[cat] = totalCount > 0 ? totalScore / totalCount : 0;
    });

    return stats;
  }, [aggregatedStats]);

  const pagesPerPersonNum = Math.max(1, parseInt(pagesPerPerson) || 1);

  // Calculate total respondents based on Pages / PagesPerPerson
  const totalCompletedPages = processedFiles.reduce((acc, file) => 
    acc + file.responses.filter(r => r.status === 'completed').length, 0
  );

  const totalErrorPages = processedFiles.reduce((acc, file) => 
    acc + file.responses.filter(r => r.status === 'error').length, 0
  );

  const totalCompletedRespondents = Math.floor(totalCompletedPages / pagesPerPersonNum);
  const totalErrorRespondents = Math.floor(totalErrorPages / pagesPerPersonNum);
  
  const targetCountNum = parseInt(targetAudienceCount) || 0;
  const participationRate = targetCountNum > 0 
    ? ((totalCompletedRespondents / targetCountNum) * 100).toFixed(1) 
    : 0;

  // Find the education title (most common or first available)
  const educationTitle = useMemo(() => {
    let foundTitle = '';
    for (const file of processedFiles) {
      for (const res of file.responses) {
        if (res.title && res.title.trim().length > 0) {
          foundTitle = res.title.trim();
          break;
        }
      }
      if (foundTitle) break;
    }
    return foundTitle;
  }, [processedFiles]);

  // Generate Word Document
  const handleDownloadDoc = () => {
    if (processedFiles.length === 0) return;

    const displayTitle = educationTitle || '교육명 미상';

    // 1. Build HTML Content
    const title = `<h1 style="text-align: center; font-size: 24px; color: #333;">교육만족도 조사 결과 보고서</h1>`;
    
    const summarySection = `
      <h2 style="font-size: 18px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px;">1. 종합 요약</h2>
      <ul style="font-size: 14px; line-height: 1.6;">
        <li><strong>교육명:</strong> ${displayTitle}</li>
        <li><strong>전체 만족도:</strong> ${overallSatisfaction.toFixed(2)} / 5.0</li>
        <li><strong>참여율:</strong> ${participationRate}% (${totalCompletedRespondents}명 / ${targetAudienceCount || '-'}명)</li>
        <li><strong>분석 파일 수:</strong> ${processedFiles.length}개</li>
      </ul>
    `;

    const categoryRows = Object.entries(categoryStats).map(([cat, score]) => 
      `<tr><td style="padding: 8px;">${cat}</td><td style="padding: 8px; text-align: center;">${(score as number).toFixed(2)}</td></tr>`
    ).join('');
    
    const categorySection = `
      <h2 style="font-size: 18px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 20px;">2. 영역별 만족도</h2>
      <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; width: 100%; font-size: 14px; border: 1px solid #ddd;">
        <thead style="background-color: #f8fafc;">
          <tr>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center;">영역</th>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center;">점수 (5점 만점)</th>
          </tr>
        </thead>
        <tbody>
          ${categoryRows}
        </tbody>
      </table>
    `;

    let currentCategory = '';
    const detailRows = aggregatedStats.map(stat => {
      let catHeader = '';
      if (stat.category !== currentCategory) {
        currentCategory = stat.category;
        catHeader = `<tr style="background-color: #e2e8f0;"><td colspan="4" style="padding: 8px; font-weight: bold; color: #1e293b;">${currentCategory}</td></tr>`;
      }
      
      const distributionStr = `
        매우만족: ${stat.distribution['매우만족'] || 0} | 
        만족: ${stat.distribution['만족'] || 0} | 
        보통: ${stat.distribution['보통'] || 0} | 
        불만: ${stat.distribution['불만'] || 0} | 
        매우불만: ${stat.distribution['매우불만'] || 0}
      `;

      return `
        ${catHeader}
        <tr>
          <td style="padding: 8px;">${stat.question}</td>
          <td style="padding: 8px; text-align: center;">${stat.count}명</td>
          <td style="padding: 8px; text-align: center; font-weight: bold;">${stat.averageScore.toFixed(2)}</td>
          <td style="padding: 8px; font-size: 11px; color: #64748b;">${distributionStr}</td>
        </tr>
      `;
    }).join('');

    const detailSection = `
      <h2 style="font-size: 18px; color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 5px; margin-top: 20px;">3. 문항별 상세 분석</h2>
      <table border="1" cellspacing="0" cellpadding="5" style="border-collapse: collapse; width: 100%; font-size: 14px; border: 1px solid #ddd;">
        <thead style="background-color: #f8fafc;">
          <tr>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center;">문항</th>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center; width: 80px;">응답수</th>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center; width: 80px;">평균</th>
            <th style="padding: 8px; background-color: #f1f5f9; text-align: center;">응답 분포</th>
          </tr>
        </thead>
        <tbody>
          ${detailRows}
        </tbody>
      </table>
    `;

    const content = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>교육만족도 결과</title>
        <style>
          body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; }
          table { width: 100%; border-collapse: collapse; }
          td, th { border: 1px solid #000; padding: 5px; }
        </style>
      </head>
      <body style="padding: 20px;">
        ${title}
        ${summarySection}
        ${categorySection}
        ${detailSection}
        <br>
        <p style="text-align: right; color: #888; font-size: 11px;">Generated by EduSurvey AI</p>
      </body>
      </html>
    `;

    // 2. Create Blob with BOM for UTF-8
    const blob = new Blob(['\ufeff', content], {
      type: 'application/msword'
    });

    // 3. Trigger Download
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Sanitize filename
    const safeFilename = displayTitle.replace(/[^a-zA-Z0-9가-힣\s-_]/g, '').trim() || '교육만족도';
    link.download = `${safeFilename}_결과보고서.doc`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate CSV Document
  const handleDownloadCSV = () => {
    if (processedFiles.length === 0) return;

    const displayTitle = educationTitle || '교육명 미상';
    // BOM for Excel compatibility with UTF-8
    const bom = '\uFEFF';
    let csvContent = bom;

    // Title
    csvContent += `교육만족도 조사 결과 보고서\n\n`;

    // Summary
    csvContent += `1. 종합 요약\n`;
    csvContent += `교육명,${displayTitle.replace(/,/g, ' ')}\n`;
    csvContent += `전체 만족도,${overallSatisfaction.toFixed(2)}\n`;
    csvContent += `참여율,${participationRate}% (${totalCompletedRespondents}명 / ${targetAudienceCount || '-'}명)\n`;
    csvContent += `분석 파일 수,${processedFiles.length}개\n\n`;

    // Category Stats
    csvContent += `2. 영역별 만족도\n`;
    csvContent += `영역,점수 (5점 만점)\n`;
    Object.entries(categoryStats).forEach(([cat, score]) => {
      csvContent += `${cat},${(score as number).toFixed(2)}\n`;
    });
    csvContent += `\n`;

    // Detailed Stats
    csvContent += `3. 문항별 상세 분석\n`;
    csvContent += `카테고리,문항,응답수,평균,매우만족,만족,보통,불만,매우불만\n`;

    aggregatedStats.forEach(stat => {
        // Escape commas and newlines in text fields
        const cleanQuestion = `"${stat.question.replace(/"/g, '""')}"`;
        const cleanCategory = stat.category;
        const dist = stat.distribution;
        
        csvContent += `${cleanCategory},${cleanQuestion},${stat.count},${stat.averageScore.toFixed(2)},${dist['매우만족']||0},${dist['만족']||0},${dist['보통']||0},${dist['불만']||0},${dist['매우불만']||0}\n`;
    });

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Sanitize filename
    const safeFilename = displayTitle.replace(/[^a-zA-Z0-9가-힣\s-_]/g, '').trim() || '교육만족도';
    link.download = `${safeFilename}_결과.csv`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col print:bg-white">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-6 h-6 text-blue-600" />
            <h1 className="text-xl font-bold text-slate-800">EduSurvey AI</h1>
          </div>
          <div className="text-sm text-slate-500 hidden sm:block">
             교육 만족도 자동 집계 시스템 ({pagesPerPersonNum}페이지 = 1명)
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 print:p-0 print:max-w-none">
        
        {/* Input & Upload Section */}
        <section className="mb-8 space-y-4 print:hidden">
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
             <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                   <h2 className="text-lg font-semibold text-slate-800">설문 설정 및 업로드</h2>
                   <p className="text-sm text-slate-500 mt-1">
                     <span className="font-bold text-blue-600">{pagesPerPersonNum}페이지를 1명의 응답자</span>로 인식하여 집계합니다.
                   </p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4">
                  {/* Pages Per Person Input */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="pagesPerPerson" className="text-sm font-medium text-slate-700 whitespace-nowrap">
                      인원당 페이지:
                    </label>
                    <div className="relative">
                      <input
                        id="pagesPerPerson"
                        type="number"
                        min="1"
                        placeholder="1"
                        value={pagesPerPerson}
                        onChange={(e) => setPagesPerPerson(e.target.value)}
                        className="w-20 pl-3 pr-8 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-medium"
                        disabled={globalStatus === ProcessingStatus.PROCESSING}
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">페이지</span>
                    </div>
                  </div>

                  {/* Respondent Count Input */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="targetCount" className="text-sm font-medium text-slate-700 whitespace-nowrap">
                      총 교육 인원:
                    </label>
                    <div className="relative">
                      <input
                        id="targetCount"
                        type="number"
                        min="0"
                        placeholder="0"
                        value={targetAudienceCount}
                        onChange={(e) => setTargetAudienceCount(e.target.value)}
                        className="w-24 pl-3 pr-8 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-right font-medium"
                        disabled={globalStatus === ProcessingStatus.PROCESSING}
                      />
                      <span className="absolute right-3 top-2 text-slate-400 text-sm">명</span>
                    </div>
                  </div>
                </div>
             </div>

            <FileUpload 
              onFilesSelected={handleFilesSelected} 
              disabled={globalStatus === ProcessingStatus.PROCESSING} 
            />
            
            {/* Control Actions */}
            {processedFiles.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
                 {globalStatus === ProcessingStatus.IDLE ? (
                   <button 
                     onClick={startProcessing}
                     className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                   >
                     <Play className="w-4 h-4 fill-current" />
                     집계 시작
                   </button>
                 ) : (
                   <button 
                     onClick={handleStop}
                     className="flex items-center gap-2 bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-50 px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
                   >
                     <Square className="w-4 h-4 fill-current" />
                     중지
                   </button>
                 )}

                 <button 
                   onClick={handleReset}
                   disabled={globalStatus === ProcessingStatus.PROCESSING}
                   className="flex items-center gap-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 px-5 py-2.5 rounded-lg font-medium transition-colors ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                   <Trash2 className="w-4 h-4" />
                   전체 초기화
                 </button>
              </div>
            )}
            
            {globalStatus === ProcessingStatus.PROCESSING && (
              <div className="mt-4 flex items-center justify-center text-blue-600 bg-blue-50 p-3 rounded-lg border border-blue-100 animate-in fade-in slide-in-from-top-2">
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                <span className="font-medium">AI가 문서를 분석 중입니다... {processingProgress}</span>
              </div>
            )}
          </div>
        </section>

        {/* Results Section */}
        {processedFiles.length > 0 && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              
              {/* Overall Satisfaction - Featured Card */}
              <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-5 rounded-lg border border-blue-600 shadow-md flex flex-col justify-between text-white col-span-1 md:col-span-2 lg:col-span-1">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-blue-100">전체 교육 만족도</p>
                  <Star className="w-5 h-5 text-yellow-300 fill-yellow-300" />
                </div>
                <div className="mt-2">
                  <p className="text-4xl font-bold tracking-tight">{overallSatisfaction.toFixed(2)}</p>
                  <p className="text-xs text-blue-100 mt-1">5점 만점 기준</p>
                </div>
              </div>

              {/* Participation Rate */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between col-span-1">
                <div>
                  <p className="text-sm text-slate-500 font-medium">참여율</p>
                  <div className="flex items-baseline gap-2 mt-1">
                     <p className="text-2xl font-bold text-slate-800">{participationRate}%</p>
                     <span className="text-xs text-slate-400">({totalCompletedRespondents}/{targetAudienceCount || '-'}명)</span>
                  </div>
                </div>
                <div className="p-3 bg-indigo-50 rounded-full">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>

              {/* Total Files */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between col-span-1">
                <div>
                  <p className="text-sm text-slate-500 font-medium">업로드 파일</p>
                  <p className="text-2xl font-bold text-slate-800 mt-1">{processedFiles.length}개</p>
                </div>
                <div className="p-3 bg-slate-100 rounded-full">
                  <FileText className="w-6 h-6 text-slate-600" />
                </div>
              </div>

              {/* Completed Analysis */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between col-span-1">
                 <div>
                  <p className="text-sm text-slate-500 font-medium">분석 완료</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{totalCompletedRespondents}명</p>
                </div>
                <div className="p-3 bg-green-50 rounded-full">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>

              {/* Failed Analysis */}
              <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between col-span-1">
                 <div>
                  <p className="text-sm text-slate-500 font-medium">분석 실패</p>
                  <p className="text-2xl font-bold text-red-600 mt-1">{totalErrorRespondents}건</p>
                </div>
                <div className="p-3 bg-red-50 rounded-full">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            {/* Category Statistics Cards - Added below the main stats as requested */}
            {totalCompletedRespondents > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-bottom-2 duration-700">
                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-500">교육기획</span>
                      <ClipboardList className="w-4 h-4 text-blue-500" />
                   </div>
                   <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800">{categoryStats['교육기획평가'].toFixed(2)}</span>
                      <span className="text-xs text-slate-400">/ 5.0</span>
                   </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-500">교육환경</span>
                      <Layout className="w-4 h-4 text-green-500" />
                   </div>
                   <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800">{categoryStats['교육환경평가'].toFixed(2)}</span>
                      <span className="text-xs text-slate-400">/ 5.0</span>
                   </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-500">강사만족도</span>
                      <GraduationCap className="w-4 h-4 text-purple-500" />
                   </div>
                   <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800">{categoryStats['강사평가'].toFixed(2)}</span>
                      <span className="text-xs text-slate-400">/ 5.0</span>
                   </div>
                </div>

                <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm flex flex-col">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-slate-500">교육성과</span>
                      <TrendingUp className="w-4 h-4 text-orange-500" />
                   </div>
                   <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-bold text-slate-800">{categoryStats['프로그램 성과평가'].toFixed(2)}</span>
                      <span className="text-xs text-slate-400">/ 5.0</span>
                   </div>
                </div>
              </div>
            )}

            {/* Aggregated Charts & Tables */}
            {totalCompletedRespondents > 0 && (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Chart */}
                  <div className="col-span-1 lg:col-span-2">
                    <ResultsChart data={aggregatedStats} />
                  </div>
                </div>

                {/* Detail Table */}
                <div>
                   <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center">
                     <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                     문항별 상세 집계
                   </h3>
                   <DetailTable data={aggregatedStats} />
                </div>
              </>
            )}

            {/* File List Status */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden print:hidden">
               <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                 <h3 className="font-semibold text-slate-800">처리 상세 현황</h3>
                 <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">
                    대기중인 파일은 '집계 시작' 버튼을 누르면 처리됩니다.
                 </span>
               </div>
               <div className="divide-y divide-slate-200 max-h-80 overflow-y-auto">
                 {processedFiles.map(file => {
                   const completed = file.responses.filter(r => r.status === 'completed').length;
                   const failed = file.responses.filter(r => r.status === 'error').length;
                   const processing = file.responses.filter(r => r.status === 'processing').length;
                   const pending = file.totalPages === 0 
                      ? 1 
                      : file.responses.filter(r => r.status === 'pending').length;
                   
                   return (
                     <div key={file.id} className="px-6 py-4 hover:bg-slate-50">
                       <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-3">
                              <FileText className={`w-5 h-5 ${file.totalPages === 0 ? 'text-slate-400' : 'text-blue-500'}`} />
                              <div>
                                <span className="text-sm font-medium text-slate-800 block">{file.fileName}</span>
                                <span className="text-xs text-slate-400">
                                   {file.totalPages === 0 ? '업로드 대기 중' : `총 ${file.totalPages} 페이지`}
                                </span>
                              </div>
                          </div>
                          <div className="flex gap-2 text-xs">
                             {processing > 0 && <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded-full animate-pulse">{processing} 처리중</span>}
                             {completed > 0 && <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full">{completed} 완료</span>}
                             {failed > 0 && <span className="bg-red-100 text-red-700 px-2 py-1 rounded-full">{failed} 실패</span>}
                             {pending > 0 && processing === 0 && <span className="bg-slate-100 text-slate-600 px-2 py-1 rounded-full">대기 중</span>}
                          </div>
                       </div>
                       
                       {/* Mini progress bar */}
                       {file.totalPages > 0 && (
                          <div className="w-full bg-slate-200 rounded-full h-1.5 mt-2 overflow-hidden">
                             <div 
                                className={`h-1.5 rounded-full transition-all duration-300 ${failed > 0 ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${((completed + failed) / file.totalPages) * 100}%` }}
                             />
                          </div>
                       )}
                     </div>
                   );
                 })}
               </div>
            </div>

            {/* Print Buttons Section */}
             <div className="mt-12 mb-8 print:hidden border-t border-slate-200 pt-8 flex flex-col items-center justify-center gap-6">
                <h3 className="text-lg font-bold text-slate-800">집계 결과 내보내기</h3>
                <div className="flex flex-wrap justify-center gap-4">
                  <button 
                    onClick={handleDownloadDoc}
                    className="flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    <FileText className="w-5 h-5" />
                    doc문서로 저장
                  </button>
                  <button 
                    onClick={handleDownloadCSV}
                    className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-lg font-medium transition-colors shadow-sm"
                  >
                    <FileSpreadsheet className="w-5 h-5" />
                    CSV로 저장
                  </button>
                </div>
                <p className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
                  * 집계된 결과를 워드(doc) 또는 CSV 파일로 다운로드합니다.
                </p>
             </div>

          </div>
        )}
      </main>
    </div>
  );
};

export default App;