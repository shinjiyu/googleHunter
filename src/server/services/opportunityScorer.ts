import type { AnalysisSnapshot, Keyword, TrendStatus } from '../../shared/types';
import {
  createAnalysisSnapshot,
  getKeywordById
} from '../db';
import {
  analyzeAppStoreCompetition,
  type AppStoreCompetition,
} from './appStoreAnalyzer';
import {
  analyzeSERP,
  calculateCompetitionScore as calculateSerpCompetition,
  hasContentGap
} from './serpAnalyzer';
import {
  detectTrend,
  fetchInterestOverTime,
  getSearchVolume,
  type TrendsFetcherConfig,
} from './trendsFetcher';

export interface OpportunityScorerConfig extends TrendsFetcherConfig {
  minSearchVolume: number;
  maxCompetition: number;
  minOpportunityScore: number;
}

const DEFAULT_CONFIG: OpportunityScorerConfig = {
  geo: 'US',
  minSearchVolume: 20,
  maxCompetition: 70,
  minOpportunityScore: 50,
};

/**
 * Calculate opportunity score
 * Formula: searchVolume * 0.4 + (100 - competitionScore) * 0.6
 * Bonus for rising trends and content gaps
 */
export function calculateOpportunityScore(
  searchVolume: number,
  competitionScore: number,
  trend: TrendStatus,
  hasGap: boolean
): number {
  // Base score
  let score = searchVolume * 0.4 + (100 - competitionScore) * 0.6;

  // Trend bonus
  if (trend === 'rising') {
    score *= 1.2; // 20% bonus for rising trends
  } else if (trend === 'declining') {
    score *= 0.8; // 20% penalty for declining trends
  }

  // Content gap bonus
  if (hasGap) {
    score *= 1.15; // 15% bonus for content gap
  }

  // Normalize to 0-100
  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Analyze a keyword and create a snapshot
 * Now includes App Store competition analysis for app-related keywords
 */
export async function analyzeKeyword(
  keywordId: string,
  config: OpportunityScorerConfig = DEFAULT_CONFIG
): Promise<AnalysisSnapshot | null> {
  const keyword = getKeywordById(keywordId);
  if (!keyword) {
    console.error(`Keyword not found: ${keywordId}`);
    return null;
  }

  console.log(`Analyzing keyword: "${keyword.keyword}"`);

  try {
    // 1. Get search volume from Google Trends
    const trendData = await fetchInterestOverTime(keyword.keyword, config);
    const searchVolume = trendData.length > 0
      ? Math.round(trendData.slice(-7).reduce((sum, p) => sum + p.value, 0) / Math.min(7, trendData.length))
      : await getSearchVolume(keyword.keyword, config);

    // 2. Detect trend direction
    const trend = detectTrend(trendData);

    // 3. Analyze App Store competition (primary for app ideas)
    let competitionScore: number;
    let appStoreData: AppStoreCompetition | null = null;

    // Check if keyword is app-related (also check source)
    const isAppKeyword = isAppRelatedKeyword(keyword.keyword) || keyword.source === 'app_idea';

    if (isAppKeyword) {
      // Use App Store competition as primary metric
      appStoreData = await analyzeAppStoreCompetition(keyword.keyword, config.geo.toLowerCase());
      competitionScore = appStoreData.competitionScore;
      console.log(`[AppStore] "${keyword.keyword}": ${appStoreData.totalApps} apps, competition=${competitionScore}`);
    } else {
      // Fall back to SERP analysis for non-app keywords
      const serpAnalysis = await analyzeSERP(keyword.keyword, config.geo.toLowerCase());
      competitionScore = calculateSerpCompetition(
        serpAnalysis.results,
        serpAnalysis.totalResults,
        keyword.keyword
      );
    }

    // 4. Check for content/market gap
    const gap = isAppKeyword
      ? (appStoreData?.totalApps || 0) < 10 // Low app count = gap
      : false; // TODO: SERP gap analysis

    // 5. Calculate opportunity score with app-specific factors
    const opportunityScore = calculateOpportunityScore(
      searchVolume,
      competitionScore,
      trend,
      gap
    );

    // 6. Save analysis snapshot
    // Store App Store data in serpData for now (can extend types later)
    const serpData = appStoreData
      ? [
        {
          position: 0,
          title: `App Store Analysis: ${appStoreData.totalApps} apps`,
          url: '',
          domain: 'appstore',
          snippet: appStoreData.analysis,
          isAd: false,
        },
        ...appStoreData.topApps.slice(0, 5).map((app, i) => ({
          position: i + 1,
          title: app.trackName,
          url: app.trackViewUrl,
          domain: 'apps.apple.com',
          snippet: `Rating: ${app.averageUserRating.toFixed(1)}/5, Reviews: ${app.userRatingCount.toLocaleString()}, by ${app.sellerName}`,
          isAd: false,
        })),
      ]
      : [];

    const snapshot = createAnalysisSnapshot(
      keywordId,
      searchVolume,
      appStoreData?.totalApps || 0,
      competitionScore,
      opportunityScore,
      trend,
      serpData
    );

    console.log(
      `Analysis complete for "${keyword.keyword}": ` +
      `volume=${searchVolume}, competition=${competitionScore}, opportunity=${opportunityScore}` +
      (isAppKeyword ? ` [App Store: ${appStoreData?.totalApps} apps]` : '')
    );

    return snapshot;
  } catch (error) {
    console.error(`Error analyzing keyword "${keyword.keyword}":`, error);
    return null;
  }
}

/**
 * Check if a keyword is app-related
 */
function isAppRelatedKeyword(keyword: string): boolean {
  const kw = keyword.toLowerCase();
  const appTerms = [
    'app', 'tool', 'tracker', 'manager', 'planner', 'reminder',
    'organizer', 'calculator', 'converter', 'scanner', 'editor',
    'maker', 'generator', 'helper', 'assistant',
  ];
  return appTerms.some((term) => kw.includes(term));
}

/**
 * Analyze multiple keywords
 */
export async function analyzeKeywords(
  keywordIds: string[],
  config: OpportunityScorerConfig = DEFAULT_CONFIG
): Promise<AnalysisSnapshot[]> {
  const results: AnalysisSnapshot[] = [];

  for (const keywordId of keywordIds) {
    try {
      const snapshot = await analyzeKeyword(keywordId, config);
      if (snapshot) {
        results.push(snapshot);
      }
    } catch (error) {
      console.error(`Error analyzing keyword ${keywordId}:`, error);
    }

    // Delay between analyses to respect rate limits
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  return results;
}

/**
 * Check if a keyword meets opportunity criteria
 */
export function isHighOpportunity(
  analysis: AnalysisSnapshot,
  config: OpportunityScorerConfig = DEFAULT_CONFIG
): boolean {
  return (
    analysis.searchVolume >= config.minSearchVolume &&
    analysis.competitionScore <= config.maxCompetition &&
    analysis.opportunityScore >= config.minOpportunityScore
  );
}

/**
 * Get opportunity summary for a keyword
 */
export interface OpportunitySummary {
  keyword: Keyword;
  analysis: AnalysisSnapshot;
  isHighOpportunity: boolean;
  reasons: string[];
}

export function getOpportunitySummary(
  keyword: Keyword,
  analysis: AnalysisSnapshot,
  config: OpportunityScorerConfig = DEFAULT_CONFIG
): OpportunitySummary {
  const reasons: string[] = [];

  // Volume analysis
  if (analysis.searchVolume >= config.minSearchVolume) {
    reasons.push(`Good search volume (${analysis.searchVolume}/100)`);
  } else {
    reasons.push(`Low search volume (${analysis.searchVolume}/100)`);
  }

  // Competition analysis
  if (analysis.competitionScore <= config.maxCompetition) {
    reasons.push(`Low competition (${analysis.competitionScore}/100)`);
  } else {
    reasons.push(`High competition (${analysis.competitionScore}/100)`);
  }

  // Trend analysis
  if (analysis.trend === 'rising') {
    reasons.push('Rising trend');
  } else if (analysis.trend === 'declining') {
    reasons.push('Declining trend');
  }

  // Content gap
  if (hasContentGap(analysis.serpData, keyword.keyword)) {
    reasons.push('Content gap detected');
  }

  return {
    keyword,
    analysis,
    isHighOpportunity: isHighOpportunity(analysis, config),
    reasons,
  };
}

/**
 * Quick analysis using only Google Trends (no SERP scraping)
 * Useful for initial filtering before full analysis
 */
export async function quickAnalyze(
  keyword: string,
  config: TrendsFetcherConfig = DEFAULT_CONFIG
): Promise<{
  searchVolume: number;
  trend: TrendStatus;
  worthFullAnalysis: boolean;
}> {
  const trendData = await fetchInterestOverTime(keyword, config);

  const searchVolume = trendData.length > 0
    ? Math.round(trendData.slice(-7).reduce((sum, p) => sum + p.value, 0) / Math.min(7, trendData.length))
    : 0;

  const trend = detectTrend(trendData);

  // Worth full analysis if has decent volume and not declining
  const worthFullAnalysis = searchVolume >= 15 && trend !== 'declining';

  return {
    searchVolume,
    trend,
    worthFullAnalysis,
  };
}
