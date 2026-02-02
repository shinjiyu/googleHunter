import type {
  AnalysisSnapshot,
  ApiResponse,
  DailyTrendItem,
  DashboardStats,
  Keyword,
  KeywordOpportunity,
  PaginatedResponse,
} from '../../shared/types';

const API_BASE = '/api';

async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP error ${response.status}`);
  }

  return response.json();
}

// Keywords API
export async function getKeywords(
  page = 1,
  pageSize = 20,
  search?: string
): Promise<PaginatedResponse<Keyword>> {
  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
  });
  if (search) {
    params.set('search', search);
  }
  return fetchApi(`/keywords?${params}`);
}

export async function getKeyword(id: string): Promise<ApiResponse<KeywordOpportunity>> {
  return fetchApi(`/keywords/${id}`);
}

export async function createKeyword(
  keyword: string,
  category?: string
): Promise<ApiResponse<Keyword>> {
  return fetchApi('/keywords', {
    method: 'POST',
    body: JSON.stringify({ keyword, category }),
  });
}

export async function expandKeyword(id: string): Promise<ApiResponse<Keyword[]>> {
  return fetchApi(`/keywords/${id}/expand`, {
    method: 'POST',
  });
}

// Analysis API
export async function getOpportunities(
  minScore = 50,
  limit = 50
): Promise<ApiResponse<Array<{ keyword: Keyword; analysis: AnalysisSnapshot }>>> {
  const params = new URLSearchParams({
    minScore: String(minScore),
    limit: String(limit),
  });
  return fetchApi(`/analysis/opportunities?${params}`);
}

export async function getStats(): Promise<ApiResponse<DashboardStats>> {
  return fetchApi('/analysis/stats');
}

export async function runAnalysis(id: string): Promise<ApiResponse<AnalysisSnapshot>> {
  return fetchApi(`/analysis/run/${id}`, {
    method: 'POST',
  });
}

export async function quickAnalyze(
  keyword: string,
  geo = 'US'
): Promise<
  ApiResponse<{
    searchVolume: number;
    trend: string;
    worthFullAnalysis: boolean;
  }>
> {
  return fetchApi('/analysis/quick', {
    method: 'POST',
    body: JSON.stringify({ keyword, geo }),
  });
}

export async function startDiscovery(): Promise<ApiResponse<{ message: string }>> {
  return fetchApi('/analysis/discover', {
    method: 'POST',
  });
}

export async function startAnalysisAll(): Promise<ApiResponse<{ message: string }>> {
  return fetchApi('/analysis/run-all', {
    method: 'POST',
  });
}

// Trends API
export async function getDailyTrends(geo = 'US'): Promise<ApiResponse<DailyTrendItem[]>> {
  return fetchApi(`/trends/daily?geo=${geo}`);
}

export async function getRealTimeTrends(geo = 'US'): Promise<ApiResponse<string[]>> {
  return fetchApi(`/trends/realtime?geo=${geo}`);
}

export async function getRelatedQueries(
  keyword: string,
  geo = 'US'
): Promise<ApiResponse<{ top: string[]; rising: string[] }>> {
  return fetchApi(`/trends/related/${encodeURIComponent(keyword)}?geo=${geo}`);
}
