export interface SurveyItem {
  question: string;
  score: number; // 5 to 1
  label: '매우만족' | '만족' | '보통' | '불만' | '매우불만';
  category: '교육기획평가' | '교육환경평가' | '강사평가' | '프로그램 성과평가' | '기타';
}

export interface SurveyResponse {
  pageIndex: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
  items: SurveyItem[];
  title?: string; // Extracted survey title/training name
  error?: string;
}

export interface ProcessedFile {
  id: string;
  fileName: string;
  totalPages: number;
  responses: SurveyResponse[];
}

export interface AggregatedStat {
  question: string;
  category: string;
  averageScore: number;
  count: number;
  totalScore: number;
  distribution: {
    [key: string]: number; // "매우만족": 5, "만족": 2 ...
  };
}

export enum ProcessingStatus {
  IDLE = 'IDLE',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
}