// Shared types between server and client

export type TrendSource = 'daily_trend' | 'realtime' | 'related';
export type TrendStatus = 'rising' | 'stable' | 'declining';

export interface Keyword {
  id: string;
  keyword: string;
  source: TrendSource;
  category?: string;
  firstSeen: string;
  lastUpdated: string;
}

export interface AnalysisSnapshot {
  id: string;
  keywordId: string;
  timestamp: string;
  searchVolume: number; // Google Trends relative score 0-100
  resultCount: number; // Total search results
  competitionScore: number; // 0-100, higher = more competition
  opportunityScore: number; // 0-100, higher = better opportunity
  trend: TrendStatus;
  serpData: SerpResult[];
}

export interface SerpResult {
  position: number;
  title: string;
  url: string;
  domain: string;
  snippet: string;
  isAd: boolean;
}

export interface KeywordOpportunity {
  keyword: Keyword;
  latestAnalysis: AnalysisSnapshot | null;
  trendData: TrendDataPoint[];
}

export interface TrendDataPoint {
  date: string;
  value: number;
}

export interface DailyTrendItem {
  title: string;
  formattedTraffic: string;
  relatedQueries: string[];
  articles: {
    title: string;
    url: string;
    source: string;
  }[];
}

export interface DiscoveryConfig {
  minSearchVolume: number; // Minimum trend score to consider
  maxCompetition: number; // Maximum competition score
  minOpportunityScore: number; // Minimum opportunity score to alert
  regions: string[]; // Geo regions to monitor
  categories: string[]; // Categories to monitor
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

// Dashboard statistics
export interface DashboardStats {
  totalKeywords: number;
  newToday: number;
  highOpportunity: number;
  averageOpportunityScore: number;
}
